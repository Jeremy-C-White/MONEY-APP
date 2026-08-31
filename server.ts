import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { google } from "googleapis";
import * as crypto from "crypto";
import * as jose from "jose";

// Startup config validation
let startupError = null;
const requiredEnv = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    const msg = `CRITICAL: Missing required environment variable ${envVar}`;
    console.error(msg);
    if (!startupError) startupError = msg;
  }
}

let db: FirebaseFirestore.Firestore | any = null;
try {
  const firebaseApp = initializeApp({
    credential: applicationDefault(),
  });
  db = getFirestore(firebaseApp, "ai-studio-3aabea25-37f3-4131-89c3-c2aaa9384046");
} catch (error) {
  const msg = "CRITICAL: Error initializing Firebase Admin: " + error;
  console.error(msg);
  if (!startupError) startupError = msg;
}

let plaidClient: PlaidApi | null = null;
function getPlaidClient() {
  if (!plaidClient) {
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    const env = process.env.PLAID_ENV || "sandbox";

    if (!clientId || !secret) {
      console.warn("PLAID_CLIENT_ID and PLAID_SECRET environment variables are missing");
    }

    const configuration = new Configuration({
      basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] || PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    });
    plaidClient = new PlaidApi(configuration);
  }
  return plaidClient;
}

const getOauth2Client = () => {
  const redirectUri = process.env.APP_URL ? `${process.env.APP_URL}/api/auth/google/callback` : 'http://localhost:3000/api/auth/google/callback';
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Save raw body for webhook signature verification
  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(cors({ origin: process.env.APP_URL || 'http://localhost:3000' }));

  // Intercept API calls if there's a startup configuration error
  app.use('/api', (req, res, next) => {
    if (startupError) {
      return res.status(500).json({ error: "Server Configuration Error", details: startupError });
    }
    next();
  });

  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: "Unauthorized" });
    try {
      const token = authHeader.split(' ')[1];
      const decoded = await getAdminAuth().verifyIdToken(token);
      (req as any).user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // --- GOOGLE OAUTH ROUTES ---

  app.get("/api/auth/google/url", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const nonce = crypto.randomBytes(32).toString('hex');
      
      await db.collection('oauth_states').doc(nonce).set({
        uid,
        created_at: FieldValue.serverTimestamp(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        used: false
      });

      const oauth2Client = getOauth2Client();
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file'
        ],
        prompt: 'consent',
        state: nonce
      });
      res.json({ url });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate URL" });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect('/?error=oauth_denied');
    if (!code || !state) return res.redirect('/?error=missing_oauth_params');

    try {
      const nonce = state as string;
      const stateRef = db.collection('oauth_states').doc(nonce);

      const uid = await db.runTransaction(async (t) => {
        const stateDoc = await t.get(stateRef);
        if (!stateDoc.exists) throw new Error("Invalid or missing OAuth state");
        const data = stateDoc.data()!;
        if (data.used) throw new Error("OAuth state already used");
        if (data.expires_at.toDate() < new Date()) throw new Error("OAuth state expired");
        
        t.update(stateRef, { used: true });
        t.delete(stateRef); // Delete immediately to prevent reuse
        return data.uid as string;
      });

      const oauth2Client = getOauth2Client();
      const { tokens } = await oauth2Client.getToken(code as string);
      
      if (tokens.refresh_token) {
        await db.collection('users').doc(uid).set({
          google_refresh_token: tokens.refresh_token,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        res.redirect('/');
      } else {
        res.redirect('/?error=no_refresh_token');
      }
    } catch (error) {
      console.error(error);
      res.redirect('/?error=oauth_failed');
    }
  });

  app.post("/api/auth/google/disconnect", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();
      const refreshToken = userDoc.data()?.google_refresh_token;
      
      if (refreshToken) {
        const oauth2Client = getOauth2Client();
        await oauth2Client.revokeToken(refreshToken).catch(console.warn);
      }
      
      await userRef.update({
        google_refresh_token: FieldValue.delete()
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });

  // --- SYSTEM STATUS ---
  
  app.get("/api/status", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const [itemsSnap, userDoc, indexSnap] = await Promise.all([
        db.collection('plaid_items').where('userId', '==', uid).get(),
        db.collection('users').doc(uid).get(),
        db.collection('plaid_item_index').where('user_id', '==', uid).where('env', '==', 'production').get()
      ]);
      
      const items = itemsSnap.docs
        .map(d => ({ internal_id: d.id, ...(d.data() as any) }))
        .filter((d: any) => d.health !== 'disconnected')
        .map((d: any) => ({
          internal_id: d.internal_id,
          institution_id: d.institution_id,
          institution_name: d.institution_name,
          health: d.health,
          has_updates: !!d.has_updates,
          accounts: d.accounts || []
        }));
        
      res.json({
        items,
        trialItemsUsed: indexSnap.docs.length,
        googleConnected: !!userDoc.data()?.google_refresh_token
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Status check failed" });
    }
  });

  // --- PLAID ROUTES ---

  app.post("/api/plaid/create_link_token", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { internalItemId } = req.body;
      const client = getPlaidClient();
      
      let accessToken;
      if (internalItemId) {
        const doc = await db.collection('plaid_items').doc(internalItemId).get();
        if (!doc.exists || doc.data()?.userId !== uid || !doc.data()?.access_token) {
          return res.status(400).json({ error: "Invalid item for repair" });
        }
        accessToken = doc.data()?.access_token;
      }

      const request: any = {
        user: { client_user_id: uid },
        client_name: "FinSync",
        language: "en",
        country_codes: ["US"],
      };

      if (accessToken) {
        request.access_token = accessToken;
      } else {
        request.products = ["transactions"];
        request.transactions = { days_requested: 730 };
      }

      if (process.env.APP_URL) {
         request.webhook = `${process.env.APP_URL}/api/plaid/webhook`;
      }

      const response = await client.linkTokenCreate(request);
      
      // Implement plaid_sessions ledger
      const sessionId = db.collection('plaid_sessions').doc().id;
      await db.collection('plaid_sessions').doc(sessionId).set({
        userId: uid,
        link_token: response.data.link_token,
        internalItemId: internalItemId || null,
        status: "started",
        createdAt: FieldValue.serverTimestamp()
      });

      res.json({ link_token: response.data.link_token, session_id: sessionId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create link token" });
    }
  });

  app.post("/api/plaid/exchange_public_token", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { public_token, institution_id, institution_name, accounts, session_id } = req.body;
      
      // Server-side duplicate protection BEFORE exchange
      if (institution_id) {
        const itemsSnap = await db.collection('plaid_items')
          .where('userId', '==', uid)
          .get();
          
        const newMasks = (accounts || []).map((a: any) => a.mask).filter(Boolean);
        for (const doc of itemsSnap.docs) {
          const item = doc.data();
          if (item.institution_id !== institution_id) continue;
          if (item.status === 'disconnected') continue;
          const existingMasks = (item.accounts || []).map((a: any) => a.mask).filter(Boolean);
          
          if (newMasks.length === 0 || existingMasks.length === 0) {
             // If either mask is null, we might need a fallback. We rely on institution matching + empty mask edgecase.
             if (item.institution_name === institution_name) {
                if (session_id) await db.collection('plaid_sessions').doc(session_id).update({ status: 'duplicate_aborted' });
                return res.status(400).json({ error: "Duplicate connection detected server-side. Aborted to save quota." });
             }
          } else if (newMasks.some((m: string) => existingMasks.includes(m))) {
             if (session_id) await db.collection('plaid_sessions').doc(session_id).update({ status: 'duplicate_aborted' });
             return res.status(400).json({ error: "Duplicate connection detected server-side. Aborted to save quota." });
          }
        }
      }

      const client = getPlaidClient();
      const exchangeResponse = await client.itemPublicTokenExchange({ public_token });
      const { access_token, item_id } = exchangeResponse.data;
      
      // Authoritative Plaid metadata fetch
      let authInstitutionId = institution_id || null;
      let authInstitutionName = institution_name || "Unknown";
      let authAccounts = accounts || [];
      try {
        const itemRes = await client.itemGet({ access_token });
        authInstitutionId = itemRes.data.item.institution_id;
        
        if (authInstitutionId) {
          const instRes = await client.institutionsGetById({ 
            institution_id: authInstitutionId, 
            country_codes: ['US'] as any 
          });
          authInstitutionName = instRes.data.institution.name;
        }
        const accRes = await client.accountsGet({ access_token });
        authAccounts = accRes.data.accounts.map(a => ({
           id: a.account_id,
           mask: a.mask,
           name: a.name,
           subtype: a.subtype,
           type: a.type
        }));
      } catch (e) {
        console.warn("Could not fetch authoritative Plaid metadata", e);
      }

      // Hardened persistence with retry logic and Idempotent IDs
      const indexRef = db.collection('plaid_item_index').doc(item_id);
      
      let internalId = null;
      let success = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          internalId = await db.runTransaction(async (t) => {
            const idxDoc = await t.get(indexRef);
            if (idxDoc.exists) return idxDoc.data()!.internal_id;
            
            const newInternalRef = db.collection('plaid_items').doc();
            t.set(indexRef, { internal_id: newInternalRef.id, user_id: uid, env: process.env.PLAID_ENV || "sandbox" });
            t.set(newInternalRef, {
              userId: uid,
              access_token, // securely kept on server
              institution_id: authInstitutionId,
              institution_name: authInstitutionName,
              accounts: authAccounts,
              createdAt: FieldValue.serverTimestamp(),
              cursor: null,
              health: "healthy",
              has_updates: false
            });
            return newInternalRef.id;
          });
          success = true;
          break;
        } catch (e) {
          console.error(`Persistence attempt ${attempt} failed`, e);
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
        }
      }

      if (!success) {
        // We failed to store it durably. We should actively remove the item from Plaid to not burn a slot
        try { await client.itemRemove({ access_token }); } catch(e) {}
        if (session_id) await db.collection('plaid_sessions').doc(session_id).update({ status: 'persistence_failed' });
        throw new Error("Failed to durably store access token");
      }

      if (session_id) {
        await db.collection('plaid_sessions').doc(session_id).update({ 
          status: 'success', 
          internalItemId: internalId 
        });
      }

      res.json({ success: true, internalItemId: internalId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to exchange token" });
    }
  });

  app.put("/api/plaid/item/repair", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { internalItemId } = req.body;
      const docRef = db.collection('plaid_items').doc(internalItemId);
      const doc = await docRef.get();
      
      if (!doc.exists || doc.data()?.userId !== uid) return res.status(404).json({ error: "Not found" });
      
      const client = getPlaidClient();
      // Verify health
      const itemRes = await client.itemGet({ access_token: doc.data()!.access_token });
      if (itemRes.data.item.error) {
        return res.status(400).json({ error: "Item still unhealthy" });
      }

      await docRef.update({ health: 'healthy', error: null });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to repair item" });
    }
  });

  app.post("/api/plaid/item/remove", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { internalItemId } = req.body;
      const docRef = db.collection('plaid_items').doc(internalItemId);
      const doc = await docRef.get();
      
      if (!doc.exists || doc.data()?.userId !== uid) return res.status(404).json({ error: "Not found" });
      
      const client = getPlaidClient();
      try {
        await client.itemRemove({ access_token: doc.data()!.access_token });
      } catch (e) {
        console.warn("Plaid itemRemove failed, proceeding with local disconnect", e);
      }

      await docRef.update({ 
        health: 'disconnected',
        access_token: FieldValue.delete() // Remove the access token for safety
      });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to remove item" });
    }
  });

  app.post("/api/plaid/exit", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { session_id, error, metadata } = req.body;
      if (session_id) {
        const sessionRef = db.collection('plaid_sessions').doc(session_id);
        const sessionDoc = await sessionRef.get();
        if (sessionDoc.exists && sessionDoc.data()?.userId === uid) {
          await sessionRef.update({
            status: 'exited',
            error: error || null,
            metadata: metadata || null,
            updatedAt: FieldValue.serverTimestamp()
          });
        } else {
          return res.status(403).json({ error: "Unauthorized session access" });
        }
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to log exit" });
    }
  });

  const jwkCache = new Map<string, any>();

  app.post("/api/plaid/webhook", async (req, res) => {
    try {
      const jwtStr = req.headers['plaid-verification'];
      if (!jwtStr || typeof jwtStr !== 'string') return res.status(401).send("Missing verification header");
      
      const client = getPlaidClient();
      const { kid, alg } = jose.decodeProtectedHeader(jwtStr);
      if (!kid) throw new Error("Missing kid in JWT");
      if (alg !== 'ES256') throw new Error("Algorithm not supported");
      
      if (!jwkCache.has(kid)) {
        const keyRes = await client.webhookVerificationKeyGet({ key_id: kid });
        const key = await jose.importJWK(keyRes.data.key, alg);
        jwkCache.set(kid, key as any);
      }
      const key = jwkCache.get(kid)!;
      const { payload } = await jose.jwtVerify(jwtStr, key, { algorithms: ['ES256'] });
      
      // IAT check (max 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.iat === 'number' && now - payload.iat > 300) {
        return res.status(401).send("JWT expired");
      }

      const rawBodyBuf = (req as any).rawBody;
      const bodyHash = crypto.createHash('sha256').update(rawBodyBuf).digest('hex');
      const expectedHash = payload.request_body_sha256 as string;
      if (!crypto.timingSafeEqual(Buffer.from(expectedHash, 'utf8'), Buffer.from(bodyHash, 'utf8'))) {
        return res.status(401).send("Invalid body hash");
      }

      const { webhook_type, webhook_code, item_id, error } = req.body;
      
      // Fetch by item_id using the index
      const idxDoc = await db.collection('plaid_item_index').doc(item_id).get();
      if (!idxDoc.exists) return res.status(200).send("Ignored, item not found");
      const internalId = idxDoc.data()!.internal_id;
      const itemRef = db.collection('plaid_items').doc(internalId);

      if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') {
        await itemRef.update({ has_updates: true });
      } else if (webhook_type === 'ITEM') {
        if (webhook_code === 'ERROR') {
          if (error?.error_code === 'ITEM_LOGIN_REQUIRED') {
            await itemRef.update({ health: 'login_required' });
          }
        } else if (webhook_code === 'PENDING_DISCONNECT') {
          await itemRef.update({ health: 'pending_disconnect' });
        } else if (webhook_code === 'USER_PERMISSION_REVOKED') {
          await itemRef.update({ health: 'permission_revoked' });
        }
      }

      res.status(200).send("Webhook processed");
    } catch (e) {
      console.error("Webhook error", e);
      res.status(400).send("Webhook processing failed");
    }
  });

  // --- SYNC PIPELINE ---

  app.post("/api/sync", requireAuth, async (req, res) => {
    let jobId = crypto.randomUUID();
    let heartbeatInterval: NodeJS.Timeout | null = null;
    const uid = (req as any).user.uid;
    const lockRef = db.collection('users').doc(uid).collection('locks').doc('sync');

    try {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();
      const refreshToken = userDoc.data()?.google_refresh_token;
      let sheetId = userDoc.data()?.spreadsheetId;

      if (!refreshToken) return res.status(400).json({ error: "Google Sheets not connected" });

      // Atomic Lease Lock
      await db.runTransaction(async (t) => {
        const lockDoc = await t.get(lockRef);
        if (lockDoc.exists && lockDoc.data()?.expires_at.toDate() > new Date()) {
          throw new Error("Sync already in progress");
        }
        t.set(lockRef, { 
          job_id: jobId, 
          uid, 
          started_at: FieldValue.serverTimestamp(), 
          heartbeat_at: FieldValue.serverTimestamp(), 
          expires_at: new Date(Date.now() + 60000) 
        });
      });

      heartbeatInterval = setInterval(() => {
        lockRef.update({ 
          heartbeat_at: FieldValue.serverTimestamp(), 
          expires_at: new Date(Date.now() + 60000) 
        }).catch(console.error);
      }, 30000);

      let errors: string[] = [];
      let totalAdded = 0;
      let totalUpdated = 0;

      try {
        const oauth2Client = getOauth2Client();
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

        const createWorkbook = async () => {
          const createRes = await sheets.spreadsheets.create({
            requestBody: { properties: { title: "My Transactions Vault" } }
          });
          sheetId = createRes.data.spreadsheetId;
          await userRef.set({ spreadsheetId: sheetId }, { merge: true });
        };

        if (!sheetId) await createWorkbook();

        let spreadsheetMeta;
        try {
          spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        } catch (sheetErr: any) {
          if (sheetErr.code === 404) {
            await createWorkbook();
            spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
          } else if (sheetErr.code === 401 || sheetErr.response?.data?.error === 'invalid_grant') {
             await userRef.update({ google_refresh_token: FieldValue.delete() });
             throw new Error("Google reauthorization required");
          } else {
            throw sheetErr;
          }
        }

        const sheetName = "Transactions_Raw";
        const expectedHeaders = [
           "Transaction ID", "Account ID", "Institution ID", "Institution Name", 
           "Account Name", "Account Mask", "Account Type", "Account Subtype",
           "Date", "Authorized Date", "Name", "Merchant Name", "Original Description",
           "Plaid Amount", "Cash Flow Amount", "Currency", "Category Primary", 
           "Category Detailed", "Category Confidence", "Payment Channel",
           "Pending", "Pending Transaction ID", "Status", "Removed At", "Note"
        ];
        
        // Ensure sheet exists
        const sheetExists = spreadsheetMeta.data.sheets?.some(s => s.properties?.title === sheetName);
        let currentSheetId = spreadsheetMeta.data.sheets?.find(s => s.properties?.title === sheetName)?.properties?.sheetId;
        
        if (!sheetExists) {
          const addRes = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
          });
          currentSheetId = addRes.data.replies![0].addSheet!.properties!.sheetId;
        }

        const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetName}!1:1` });
        const currentHeaders = headerRes.data.values?.[0] || [];
        
        if (currentHeaders.length === 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            requestBody: { values: [expectedHeaders] }
          });
          // Format Date columns as Date
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: {
              requests: [
                {
                  repeatCell: {
                    range: { sheetId: currentSheetId, startRowIndex: 1, startColumnIndex: 8, endColumnIndex: 10 },
                    cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
                    fields: 'userEnteredFormat.numberFormat'
                  }
                }
              ]
            }
          });
        } else if (currentHeaders.join(',') !== expectedHeaders.join(',')) {
           throw new Error("Schema mismatch: Please delete or rename the existing Transactions_Raw sheet to allow recreation.");
        }

        // Fetch existing map
        const getRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetName}!A:Y` });
        const rows = getRes.data.values || [];
        const transactionIdToIndex = new Map();
        rows.forEach((row, index) => {
          if (row[0]) transactionIdToIndex.set(row[0], index + 1);
        });

        const client = getPlaidClient();
        const itemsSnap = await db.collection('plaid_items')
          .where('userId', '==', uid)
          .get();
          
        const docsToSync = itemsSnap.docs.filter(d => {
          const h = d.data().health;
          return h !== 'disconnected' && h !== 'login_required' && h !== 'permission_revoked';
        });

        for (const itemDoc of docsToSync) {
          const item = itemDoc.data();
          let cursor = item.cursor || null;
          let hasMore = true;
          
          let added: any[] = [];
          let modified: any[] = [];
          let removed: any[] = [];

          try {
            let restarts = 0;
            while (hasMore) {
              try {
                const syncRes = await client.transactionsSync({
                  access_token: item.access_token,
                  cursor: cursor,
                  count: 500
                });
                added = added.concat(syncRes.data.added);
                modified = modified.concat(syncRes.data.modified);
                removed = removed.concat(syncRes.data.removed);
                hasMore = syncRes.data.has_more;
                cursor = syncRes.data.next_cursor;
              } catch (syncErr: any) {
                if (syncErr.response?.data?.error_code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') {
                  if (restarts >= 3) {
                     throw new Error("Max pagination restarts exceeded for " + item.institution_name);
                  }
                  restarts++;
                  cursor = item.cursor || null;
                  added = []; modified = []; removed = [];
                  hasMore = true;
                  continue;
                }
                throw syncErr;
              }
            }

            // Sync to sheets
            const updateData: any[] = [];
            const appendValues: any[] = [];

            const getSheetsDate = (dateStr: string) => {
                if (!dateStr) return '';
                const [y, m, d] = dateStr.split('-');
                const utc = Date.UTC(parseInt(y), parseInt(m)-1, parseInt(d));
                return 25569 + (utc / 86400000);
            };

            const mapRow = (t: any, status = 'active', removedAt = '') => [
              t.transaction_id,
              t.account_id,
              item.institution_id || '',
              item.institution_name,
              item.accounts?.find((a: any) => a.id === t.account_id)?.name || '',
              item.accounts?.find((a: any) => a.id === t.account_id)?.mask || '',
              item.accounts?.find((a: any) => a.id === t.account_id)?.type || '',
              item.accounts?.find((a: any) => a.id === t.account_id)?.subtype || '',
              getSheetsDate(t.date),
              getSheetsDate(t.authorized_date),
              t.name || '',
              t.merchant_name || '',
              t.original_description || '',
              t.amount,
              -(t.amount), // cash flow amount
              t.iso_currency_code || '',
              t.personal_finance_category?.primary || '',
              t.personal_finance_category?.detailed || '',
              t.personal_finance_category?.confidence_level || '',
              t.payment_channel || '',
              t.pending ? 'Yes' : 'No',
              t.pending_transaction_id || '',
              status,
              removedAt,
              '' // Note
            ];

            for (const t of added) {
              if (!transactionIdToIndex.has(t.transaction_id)) {
                appendValues.push(mapRow(t));
              } else {
                updateData.push({
                   range: `${sheetName}!A${transactionIdToIndex.get(t.transaction_id)}:Y${transactionIdToIndex.get(t.transaction_id)}`,
                   values: [mapRow(t)]
                });
              }
            }
            for (const t of modified) {
              const rIdx = transactionIdToIndex.get(t.transaction_id);
              if (rIdx) {
                updateData.push({
                   range: `${sheetName}!A${rIdx}:Y${rIdx}`,
                   values: [mapRow(t)]
                });
              } else {
                appendValues.push(mapRow(t));
              }
            }
            for (const t of removed) {
              const rIdx = transactionIdToIndex.get(t.transaction_id);
              if (rIdx) {
                const oldRow = rows[rIdx - 1]; // rows is 0-indexed, rIdx is 1-indexed
                if (!oldRow) continue;
                oldRow[22] = 'removed';
                oldRow[23] = new Date().toISOString();
                updateData.push({
                   range: `${sheetName}!A${rIdx}:Y${rIdx}`,
                   values: [oldRow]
                });
              }
            }

            const chunkArray = (arr: any[], size: number) => {
              const res = [];
              for(let i=0; i<arr.length; i+=size) res.push(arr.slice(i, i+size));
              return res;
            };

            const updateChunks = chunkArray(updateData, 500);
            for (const chunk of updateChunks) {
               await sheets.spreadsheets.values.batchUpdate({
                 spreadsheetId: sheetId,
                 requestBody: {
                   valueInputOption: 'RAW',
                   data: chunk
                 }
               });
               totalUpdated += chunk.length;
            }

            const appendChunks = chunkArray(appendValues, 500);
            for (const chunk of appendChunks) {
               await sheets.spreadsheets.values.append({
                 spreadsheetId: sheetId,
                 range: `${sheetName}!A:Y`,
                 valueInputOption: 'RAW',
                 insertDataOption: 'INSERT_ROWS',
                 requestBody: { values: chunk }
               });
               totalAdded += chunk.length;
            }

            // Durably commit cursor
            await itemDoc.ref.update({ cursor: cursor, has_updates: false });

          } catch (itemErr: any) {
             console.error(`Failed syncing item ${item.institution_name}`, itemErr);
             errors.push(`${item.institution_name}: ${itemErr.message}`);
             if (itemErr.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
                await itemDoc.ref.update({ health: 'login_required' });
             }
          }
        }
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        try {
          await db.runTransaction(async (t) => {
            const lockDoc = await t.get(lockRef);
            if (lockDoc.exists && lockDoc.data()?.job_id === jobId) {
              t.delete(lockRef);
            }
          });
        } catch (releaseErr) {
          console.error("Failed to release lock", releaseErr);
        }
      }

      res.json({ success: true, added: totalAdded, updated: totalUpdated, errors });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Sync failed completely" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
