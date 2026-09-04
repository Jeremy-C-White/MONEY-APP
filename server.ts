import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { google } from "googleapis";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import * as crypto from "crypto";
import * as jose from "jose";
import { deduplicateAndNormalizeTransactions, NormalizedTransaction, type TransactionOverride } from "./server/lib/financial";
import { aggregateSummary, aggregateCategories, aggregateMerchants, aggregateTrends, buildTransactionsPage, buildVerificationReport, buildAccountHealthMap } from "./server/lib/aggregations";
import { dashboardCache } from "./server/lib/cache";
import { buildConnectedAccounts } from "./server/lib/connected-accounts";
import { buildAccountBalanceSummary, buildStoredBalanceSnapshot } from "./server/lib/account-balances";
import { buildAccountsPreflightReport } from "./server/lib/accounts-preflight";
import { buildCloudTaskRequest, getAutoSyncConfig, getMissingAutoSyncConfig, isAuthorizedTaskIdentity } from "./server/lib/auto-sync";
import {
  parseStoredTransactionOverride,
  removeTransactionOverride,
  saveTransactionOverride,
  TransactionOverrideRequestError,
  type TransactionOverrideServiceDependencies,
} from "./server/lib/transaction-overrides";
import {
  applyClassificationSuggestions,
  parseStoredClassificationRule,
  removeClassificationRule,
  ClassificationRuleRequestError,
  type ClassificationRuleServiceDependencies,
} from "./server/lib/classification-rules";
import { detectLikelyRecurringObligations } from "./server/lib/recurring-obligations";
import {
  buildRecurringPlanningReport,
  parseStoredRecurringDecision,
  removeRecurringDecision,
  saveRecurringDecision,
  RecurringObligationRequestError,
  type RecurringDecisionServiceDependencies,
  type StoredRecurringObligationDecision,
} from "./server/lib/recurring-obligation-decisions";
import { buildHouseholdInsights } from "./server/lib/household-insights";
import { getDateForDateInTimezone, getMonthForDateInTimezone } from "./server/lib/time";

// Environment config check (log warnings gracefully without crashing startup)
const requiredEnv = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.warn(`[Config Warning] Missing environment variable ${envVar}. Some features may be disabled until configured.`);
  }
}

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0864937792";
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "ai-studio-3aabea25-37f3-4131-89c3-c2aaa9384046";

let db: FirebaseFirestore.Firestore | any = null;
try {
  const firebaseApp = initializeApp({
    credential: applicationDefault(),
    projectId: FIREBASE_PROJECT_ID,
  });
  db = getFirestore(firebaseApp, FIRESTORE_DATABASE_ID);
} catch (error: any) {
  console.warn("Firebase Admin initialization notice:", error?.message || error);
}

function isGoogleAuthError(err: any): boolean {
  if (!err) return false;
  if (err.code === 401 || err.status === 401) return true;
  if (err.response?.status === 401) return true;
  if (err.response?.data?.error === 'invalid_grant') return true;
  if (typeof err.message === 'string' && (
    err.message.includes('invalid_grant') || 
    err.message.includes('Invalid Credentials') || 
    err.message.includes('Token has been expired or revoked') ||
    err.message.includes('invalid_token')
  )) {
    return true;
  }
  return false;
}

async function withGoogleAuth<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (isGoogleAuthError(err)) {
      try {
        await db.collection('users').doc(uid).update({ google_refresh_token: FieldValue.delete() });
      } catch (dbErr) {
        console.error("Failed to clear revoked google_refresh_token", dbErr);
      }
      const e = new Error("Google reauthorization required");
      (e as any).code = 'GOOGLE_REAUTH_REQUIRED';
      throw e;
    }
    throw err;
  }
}

function computeAccountFingerprint(institutionId: string, accounts: Array<{ name?: string; mask?: string; type?: string; subtype?: string }>): string {
  const sortedAccounts = [...(accounts || [])].map(a => ({
    name: (a.name || '').trim().toLowerCase(),
    mask: (a.mask || '').trim().toLowerCase(),
    type: (a.type || '').trim().toLowerCase(),
    subtype: (a.subtype || '').trim().toLowerCase()
  })).sort((a, b) => {
    const kA = `${a.name}|${a.mask}|${a.type}|${a.subtype}`;
    const kB = `${b.name}|${b.mask}|${b.type}|${b.subtype}`;
    return kA.localeCompare(kB);
  });
  const payload = JSON.stringify({ institution_id: institutionId || '', accounts: sortedAccounts });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

let plaidClient: PlaidApi | null = null;
function getPlaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || "sandbox";

  if (!clientId || !secret) {
    const err = new Error("Plaid credentials are not configured. Please set PLAID_CLIENT_ID and PLAID_SECRET in Settings.");
    (err as any).code = 'PLAID_CONFIG_MISSING';
    throw err;
  }

  if (!plaidClient) {
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
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error("Google OAuth credentials are not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Settings.");
    (err as any).code = 'GOOGLE_OAUTH_CONFIG_MISSING';
    throw err;
  }
  const redirectUri = process.env.APP_URL ? `${process.env.APP_URL}/api/auth/google/callback` : 'http://localhost:3000/api/auth/google/callback';
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
};

const CURRENT_MIGRATION_VERSION = 2;

function normalizeItemHealth(data: any): string {
  const health = data.health || data.status || 'unknown';
  if (health === 'healthy' || health === 'disconnected' || health === 'login_required' || health === 'pending_disconnect' || health === 'permission_revoked') {
    return health;
  }
  if (health === 'ITEM_LOGIN_REQUIRED') return 'login_required';
  if (health === 'PENDING_DISCONNECT') return 'pending_disconnect';
  if (health === 'sync_available') return 'healthy'; // sync_available means healthy but has_updates
  return health;
}

function validateProductionLockOwnership(lockDoc: FirebaseFirestore.DocumentSnapshot | null | undefined, sessionId: string) {
  if (!lockDoc || !lockDoc.exists) {
    const err = new Error("Shared Production lock is missing for unresolved session.");
    (err as any).code = "PLAID_PRODUCTION_LOCK_RECONCILIATION_REQUIRED";
    throw err;
  }
  const lockData = lockDoc.data();
  if (lockData?.session_id !== sessionId) {
    const err = new Error("The shared Production lock belongs to a different session.");
    (err as any).code = "PLAID_PRODUCTION_LOCK_RECONCILIATION_REQUIRED";
    throw err;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const autoSyncConfig = getAutoSyncConfig(process.env, FIREBASE_PROJECT_ID);
  const missingAutoSyncConfig = getMissingAutoSyncConfig(autoSyncConfig);
  const taskApiAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const taskOidcVerifier = new OAuth2Client();

  if (autoSyncConfig.enabled && missingAutoSyncConfig.length > 0) {
    console.warn(`[Config Warning] Automatic sync is enabled but missing: ${missingAutoSyncConfig.join(', ')}`);
  }

  // Save raw body for webhook signature verification
  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(cors({ origin: process.env.APP_URL || 'http://localhost:3000' }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      plaidConfigured: !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
      googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      autoSyncConfigured: autoSyncConfig.enabled && missingAutoSyncConfig.length === 0
    });
  });

  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
    try {
      const token = authHeader.split(" ")[1];
      const decoded = await getAdminAuth().verifyIdToken(token);
      (req as any).user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  const requireCloudTaskAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!autoSyncConfig.enabled || missingAutoSyncConfig.length > 0) {
      return res.status(503).json({ error: "Automatic sync is not configured" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing task identity" });
    }

    try {
      const ticket = await taskOidcVerifier.verifyIdToken({
        idToken: authHeader.slice("Bearer ".length),
        audience: autoSyncConfig.audience,
      });
      const payload = ticket.getPayload() as unknown as Record<string, unknown> | undefined;
      if (!isAuthorizedTaskIdentity(payload, autoSyncConfig.serviceAccountEmail)) {
        return res.status(403).json({ error: "Invalid task identity" });
      }

      const uid = typeof req.body?.uid === 'string' ? req.body.uid.trim() : '';
      if (!uid) return res.status(400).json({ error: "Missing sync user" });
      (req as any).user = { uid };
      (req as any).isCloudTask = true;
      next();
    } catch (error) {
      console.error("Cloud Task authentication failed", error);
      res.status(401).json({ error: "Invalid task token" });
    }
  };

  const enqueueAutomaticSync = async (uid: string, itemId: string) => {
    if (!autoSyncConfig.enabled) return { queued: false, reason: 'disabled' };
    if (missingAutoSyncConfig.length > 0) {
      throw new Error(`Automatic sync configuration missing: ${missingAutoSyncConfig.join(', ')}`);
    }

    const request = buildCloudTaskRequest(autoSyncConfig, { uid, itemId });
    const authClient = await taskApiAuth.getClient();
    await authClient.request({
      url: `https://cloudtasks.googleapis.com/v2/${request.parent}/tasks`,
      method: 'POST',
      data: { task: request.task },
    });
    return { queued: true, reason: 'queued' };
  };

  // --- GOOGLE OAUTH ROUTES ---

  app.get("/api/auth/google/url", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const nonce = crypto.randomBytes(32).toString('hex');
      
      // Opportunistic cleanup of expired states
      try {
        const expiredSnap = await db.collection('oauth_states')
          .where('expires_at', '<', new Date())
          .limit(10)
          .get();
        const batch = db.batch();
        expiredSnap.docs.forEach(doc => batch.delete(doc.ref));
        if (!expiredSnap.empty) await batch.commit();
      } catch(e) {
        // Ignore cleanup errors
      }

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
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data() || {};
      
      let migrationRan = false;
      if (!userData.migrationVersion || userData.migrationVersion < CURRENT_MIGRATION_VERSION) {
        // Run USER-SCOPED idempotent migration
        const itemsToMigrate = await db.collection('plaid_items').where('userId', '==', uid).get();
        for (const doc of itemsToMigrate.docs) {
          const data = doc.data();
          let needsUpdate = false;
          let updates: any = {};

          if (!data.health && data.status) {
            updates.health = normalizeItemHealth(data);
            if (data.status === 'sync_available') {
              updates.has_updates = true;
            }
            updates.status = FieldValue.delete();
            needsUpdate = true;
          }

          if (needsUpdate) {
            await doc.ref.update(updates);
          }

          // Backfill plaid_item_index without guessing environment
          if (data.item_id) {
            const indexRef = db.collection('plaid_item_index').doc(data.item_id);
            const indexDoc = await indexRef.get();
            if (!indexDoc.exists) {
              await indexRef.set({
                internal_id: doc.id,
                user_id: uid,
                env: "unknown",
                requires_reconciliation: true
              });
            }
          }
        }
        await userRef.set({ migrationVersion: CURRENT_MIGRATION_VERSION }, { merge: true });
        migrationRan = true;
      }

      const productionSessions = db.collection('plaid_sessions')
        .where('userId', '==', uid)
        .where('mode', '==', 'new_item')
        .where('environment', '==', 'production');
      const [itemsSnap, confirmedSessionsCount, unresolvedSessionsCount] = await Promise.all([
        db.collection('plaid_items').where('userId', '==', uid).get(),
        productionSessions.where('quota_state', '==', 'exchanged').count().get(),
        productionSessions.where('quota_state', '==', 'exchange_in_progress').count().get()
      ]);
      
      const items = itemsSnap.docs
        .map(d => ({ internal_id: d.id, ...(d.data() as any) }))
        .map((d: any) => ({
          internal_id: d.internal_id,
          institution_id: d.institution_id,
          institution_name: d.institution_name,
          health: normalizeItemHealth(d),
          has_updates: !!d.has_updates,
          auto_sync_status: d.auto_sync_status || null,
          auto_sync_error: d.auto_sync_error || null,
          accounts: d.accounts || []
        }))
        .filter((d: any) => d.health !== 'disconnected');
          
      // Exact quota totals without downloading every historical session document.
      const confirmedTrialItems = confirmedSessionsCount.data().count;
      const unresolvedTrialItems = unresolvedSessionsCount.data().count;

      res.json({
        items,
        trialItemsConfirmed: confirmedTrialItems,
        trialItemsUnresolved: unresolvedTrialItems,
        googleConnected: !!userData.google_refresh_token,
        migrationRan
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
      
      // Block new Production connections if an unresolved Production exchange exists
      if (!internalItemId && (process.env.PLAID_ENV === 'production')) {
        const lockDoc = await db.collection('users').doc(uid).collection('locks').doc('plaid_new_item').get();
        if (lockDoc.exists) {
          return res.status(409).json({
            code: "UNRESOLVED_PRODUCTION_EXCHANGE",
            error: "A previous Production connection attempt has an unresolved outcome. Reconcile it before connecting another bank."
          });
        }

        const unresolvedSnap = await db.collection('plaid_sessions')
          .where('userId', '==', uid)
          .where('mode', '==', 'new_item')
          .where('environment', '==', 'production')
          .where('quota_state', '==', 'exchange_in_progress')
          .limit(1)
          .get();

        if (!unresolvedSnap.empty) {
          return res.status(409).json({
            code: "UNRESOLVED_PRODUCTION_EXCHANGE",
            error: "A previous Production connection attempt has an unresolved outcome. Reconcile it before connecting another bank."
          });
        }
      }
      
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

      if (process.env.PLAID_ENV === 'production' || process.env.NODE_ENV === 'production') {
        if (!process.env.APP_URL) {
          return res.status(500).json({ error: "APP_URL is required in Production mode." });
        }
        request.webhook = `${process.env.APP_URL}/api/plaid/webhook`;
      } else if (process.env.APP_URL) {
        request.webhook = `${process.env.APP_URL}/api/plaid/webhook`;
      }

      const response = await client.linkTokenCreate(request);
      
      // Implement plaid_sessions ledger
      const sessionId = db.collection('plaid_sessions').doc().id;
      const mode = internalItemId ? 'repair' : 'new_item';
      const environment = process.env.PLAID_ENV || "sandbox";
      // Repair mode reuses the existing Plaid Item and creates no additional Trial Item.
      const quota_state = internalItemId ? 'repair_started' : 'link_started';

      await db.collection('plaid_sessions').doc(sessionId).set({
        userId: uid,
        link_token: response.data.link_token,
        internalItemId: internalItemId || null,
        mode,
        environment,
        quota_state,
        status: "started",
        createdAt: FieldValue.serverTimestamp()
      });

      res.json({ link_token: response.data.link_token, session_id: sessionId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create link token" });
    }
  });

  app.post("/api/plaid/confirm_duplicate", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { session_id } = req.body;
      if (!session_id) return res.status(400).json({ error: "Missing session_id" });
      
      const sessionRef = db.collection('plaid_sessions').doc(session_id);
      await db.runTransaction(async (t) => {
        const sDoc = await t.get(sessionRef);
        if (!sDoc.exists) throw new Error("Session not found");
        const sData = sDoc.data()!;
        if (sData.userId !== uid) throw new Error("Unauthorized");
        if (sData.mode !== 'new_item') throw new Error("Invalid session mode for duplicate confirmation");
        if (sData.quota_state !== 'link_started') throw new Error(`Session is in state ${sData.quota_state}, cannot confirm duplicate`);
        if (!sData.duplicate_review?.required) throw new Error("No duplicate review required for this session");
        if (sData.duplicate_review?.confirmed === true) throw new Error("Duplicate review already confirmed");
        if (!sData.duplicate_review?.account_fingerprint) throw new Error("Missing duplicate review fingerprint");
        
        t.update(sessionRef, {
          'duplicate_review.confirmed': true,
          'duplicate_review.confirmed_at': FieldValue.serverTimestamp()
        });
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error(error);
      res.status(400).json({ error: error.message || "Failed to confirm duplicate" });
    }
  });

  app.post("/api/plaid/reconcile_session", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { session_id, outcome, note } = req.body;
      if (!session_id || !outcome) {
        return res.status(400).json({ error: "Missing session_id or outcome" });
      }
      if (outcome !== 'confirmed_exchanged' && outcome !== 'confirmed_failed') {
        return res.status(400).json({ error: "Invalid outcome. Must be confirmed_exchanged or confirmed_failed." });
      }
      
      const sessionRef = db.collection('plaid_sessions').doc(session_id);
      const lockRef = db.collection('users').doc(uid).collection('locks').doc('plaid_new_item');

      await db.runTransaction(async (t) => {
        const sDoc = await t.get(sessionRef);
        const lockDoc = await t.get(lockRef);

        if (!sDoc.exists) throw new Error("Session not found");
        const sData = sDoc.data()!;
        if (sData.userId !== uid) throw new Error("Unauthorized");
        if (sData.mode !== 'new_item') throw new Error("Only new_item sessions can be reconciled");
        if (sData.quota_state !== 'exchange_in_progress') throw new Error(`Session is in state ${sData.quota_state}, not exchange_in_progress`);
        
        if (sData.environment === 'production') {
          if (lockDoc.exists) {
            const lockData = lockDoc.data()!;
            if (lockData.session_id === session_id) {
              t.delete(lockRef);
            } else {
              const err = new Error("The shared Production lock belongs to a different session and cannot be released by this reconciliation.");
              (err as any).code = "PLAID_PRODUCTION_LOCK_RECONCILIATION_REQUIRED";
              throw err;
            }
          }
        }

        const newQuotaState = outcome === 'confirmed_exchanged' ? 'exchanged' : 'exchange_failed';
        t.update(sessionRef, {
          quota_state: newQuotaState,
          reconciled_at: FieldValue.serverTimestamp(),
          reconciliation_result: outcome,
          reconciliation_note: note || null
        });
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error(error);
      const code = error.code || error.message;
      if (code === 'PLAID_PRODUCTION_LOCK_RECONCILIATION_REQUIRED') {
        return res.status(409).json({ error: error.message, code });
      }
      res.status(400).json({ error: error.message || "Failed to reconcile session" });
    }
  });

  app.post("/api/plaid/reconcile_legacy_item", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { internalItemId, outcome, note } = req.body;
      if (!internalItemId || !outcome) {
        return res.status(400).json({ error: "Missing internalItemId or outcome" });
      }
      if (outcome !== 'confirmed_production' && outcome !== 'confirmed_sandbox') {
        return res.status(400).json({ error: "Invalid outcome. Must be confirmed_production or confirmed_sandbox." });
      }

      const itemRef = db.collection('plaid_items').doc(internalItemId);
      const itemDocSnap = await itemRef.get();
      if (!itemDocSnap.exists || itemDocSnap.data()?.userId !== uid) {
        return res.status(404).json({ error: "Item not found" });
      }
      const itemData = itemDocSnap.data()!;
      const itemId = itemData.item_id;

      const targetEnv = outcome === 'confirmed_production' ? 'production' : 'sandbox';
      const deterministicSessionId = `legacy_${itemId || internalItemId}`;
      const legacySessionRef = db.collection('plaid_sessions').doc(deterministicSessionId);
      const indexRef = itemId ? db.collection('plaid_item_index').doc(itemId) : null;
      const existingSessionQuery = db.collection('plaid_sessions')
        .where('userId', '==', uid)
        .where('internalItemId', '==', internalItemId)
        .where('environment', '==', 'production')
        .where('quota_state', '==', 'exchanged');

      await db.runTransaction(async (t) => {
        // All reads must come before any writes in Firestore transactions
        const itemDoc = await t.get(itemRef);
        if (!itemDoc.exists || itemDoc.data()?.userId !== uid) {
          throw new Error("Item not found");
        }
        const idxDoc = indexRef ? await t.get(indexRef) : null;
        const legacyDoc = await t.get(legacySessionRef);
        const existingSnap = outcome === 'confirmed_production' ? await t.get(existingSessionQuery) : null;

        // Perform writes
        if (idxDoc && idxDoc.exists) {
          t.update(indexRef!, {
            env: targetEnv,
            requires_reconciliation: false,
            reconciled_at: FieldValue.serverTimestamp(),
            reconciliation_outcome: outcome
          });
        }

        if (outcome === 'confirmed_production') {
          const nonLegacyExisting = existingSnap ? existingSnap.docs.filter(d => d.id !== deterministicSessionId) : [];
          if (nonLegacyExisting.length > 0) {
            // Already represented by an ordinary session, do not double-count!
            if (legacyDoc.exists) {
              t.delete(legacySessionRef);
            }
          } else {
            // Write or update the deterministic legacy session
            t.set(legacySessionRef, {
              userId: uid,
              source: 'legacy_item',
              legacy_internal_item_id: internalItemId,
              legacy_item_id: itemId || null,
              internalItemId: internalItemId,
              mode: 'new_item',
              environment: 'production',
              quota_state: 'exchanged',
              legacy_migration: true,
              status: 'success',
              reconciled_at: FieldValue.serverTimestamp(),
              reconciliation_note: note || null,
              createdAt: itemData.createdAt || FieldValue.serverTimestamp()
            }, { merge: true });
          }
        } else if (outcome === 'confirmed_sandbox') {
          // If confirmed sandbox, delete deterministic legacy session so it does not count toward the Production Trial limit
          if (legacyDoc.exists) {
            t.delete(legacySessionRef);
          }
        }
      });

      res.json({ success: true, outcome, internalItemId });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Failed to reconcile legacy item" });
    }
  });

  app.post("/api/plaid/exchange_public_token", requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { public_token, institution_id, institution_name, accounts, session_id } = req.body;
      if (!session_id) return res.status(400).json({ error: "Missing session_id" });
      
      const sessionRef = db.collection('plaid_sessions').doc(session_id);
      const lockRef = db.collection('users').doc(uid).collection('locks').doc('plaid_new_item');
      const fingerprint = computeAccountFingerprint(institution_id, accounts || []);
      
      // Server-side duplicate policy evaluation (across all active non-disconnected items for this user at the same institution)
      let isDefiniteDuplicate = false;
      let isProbableDuplicate = false;
      let isAmbiguousIdentity = false;
      let duplicateReason = "";

      if (institution_id) {
        const itemsSnap = await db.collection('plaid_items').where('userId', '==', uid).get();
        for (const doc of itemsSnap.docs) {
          const item = doc.data();
          if (item.institution_id !== institution_id) continue;
          const health = normalizeItemHealth(item);
          if (health === 'disconnected') continue;
          
          const existingAccounts = item.accounts || [];
          const newAccounts = accounts || [];
          
          if (newAccounts.length === 0 || existingAccounts.length === 0) {
            isAmbiguousIdentity = true;
            duplicateReason = "Insufficient account metadata to differentiate institution accounts.";
            break;
          }
          
          for (const newAcc of newAccounts) {
            for (const extAcc of existingAccounts) {
              if (!newAcc.mask || !extAcc.mask) {
                isAmbiguousIdentity = true;
                duplicateReason = "One or more accounts have missing/null masks.";
                continue;
              }
              if (newAcc.mask === extAcc.mask) {
                const normNewName = (newAcc.name || '').trim().toLowerCase();
                const normExtName = (extAcc.name || '').trim().toLowerCase();
                if (normNewName && normExtName && normNewName === normExtName) {
                  isDefiniteDuplicate = true;
                  duplicateReason = `Exact match detected for account ${newAcc.name} (mask: ${newAcc.mask}) at ${item.institution_name || 'same institution'}.`;
                } else {
                  isProbableDuplicate = true;
                  duplicateReason = `Same account mask (${newAcc.mask}) detected with different/missing name at ${item.institution_name || 'same institution'}.`;
                }
              }
            }
          }
        }
      }

      // Definite duplicate -> Atomic abort transition
      if (isDefiniteDuplicate) {
        await db.runTransaction(async (t) => {
          const sDoc = await t.get(sessionRef);
          if (sDoc.exists) {
            const sData = sDoc.data()!;
            if (sData.userId === uid && sData.quota_state === 'link_started') {
              t.update(sessionRef, {
                quota_state: 'duplicate_aborted',
                status: 'duplicate_aborted',
                duplicate_reason: duplicateReason,
                duplicate_detected_at: FieldValue.serverTimestamp(),
                institution_id: institution_id || null,
                account_fingerprint: fingerprint
              });
            }
          }
        });
        return res.status(409).json({
          code: "DUPLICATE_ABORTED",
          error: `Duplicate connection detected: ${duplicateReason} Aborted to preserve Trial quota.`
        });
      }

      // Probable / Ambiguous duplicate review requirement
      if (isProbableDuplicate || isAmbiguousIdentity) {
        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) return res.status(400).json({ error: "Session not found" });
        const sessionData = sessionDoc.data()!;
        
        const review = sessionData.duplicate_review;
        if (!review?.required || !review?.confirmed) {
          // Persist review requirement BEFORE returning 409
          await db.runTransaction(async (t) => {
            const sDoc = await t.get(sessionRef);
            if (!sDoc.exists) throw new Error("Session not found");
            const sData = sDoc.data()!;
            if (sData.userId !== uid) throw new Error("Unauthorized");
            if (sData.mode !== 'new_item') throw new Error("Invalid session mode");
            if (sData.quota_state !== 'link_started') throw new Error("Invalid session state");
            
            t.update(sessionRef, {
              duplicate_review: {
                required: true,
                confirmed: false,
                reason: duplicateReason,
                institution_id: institution_id || null,
                account_fingerprint: fingerprint,
                requested_at: FieldValue.serverTimestamp()
              }
            });
          });
          return res.status(409).json({
            code: "DUPLICATE_CONFIRMATION_REQUIRED",
            error: duplicateReason,
            reason: duplicateReason,
            fingerprint
          });
        }
      }

      // Atomic Pre-exchange Reservation & Shared Production Lock Guard
      let sessionEnv = "sandbox";
      await db.runTransaction(async (t) => {
        // Read all documents first
        const sDoc = await t.get(sessionRef);
        const lockDoc = await t.get(lockRef);

        if (!sDoc.exists) throw new Error("Session not found");
        const sData = sDoc.data()!;
        if (sData.userId !== uid) throw new Error("Unauthorized");
        if (sData.mode !== 'new_item') throw new Error("Invalid mode: repair mode cannot exchange public token");

        sessionEnv = sData.environment || "sandbox";
        const currentEnv = process.env.PLAID_ENV || "sandbox";
        if (sessionEnv !== currentEnv) {
          const err = new Error("This Plaid Link session was created in a different environment. Start a new connection.");
          (err as any).code = "PLAID_ENVIRONMENT_MISMATCH";
          throw err;
        }

        if (sData.quota_state === 'exchange_in_progress') {
          const err = new Error("This connection attempt is already being processed or requires reconciliation.");
          (err as any).code = "EXCHANGE_ALREADY_IN_PROGRESS";
          throw err;
        }
        if (sData.quota_state === 'exchanged') {
          const err = new Error("This connection has already been exchanged.");
          (err as any).code = "EXCHANGE_ALREADY_COMPLETED";
          throw err;
        }
        if (sData.quota_state !== 'link_started') {
          throw new Error(`Invalid session state: ${sData.quota_state}`);
        }

        // If duplicate review was required, verify confirmation and fingerprint match
        if (sData.duplicate_review?.required) {
          if (!sData.duplicate_review.confirmed) {
            const err = new Error(sData.duplicate_review.reason || "Duplicate confirmation required before exchange.");
            (err as any).code = "DUPLICATE_CONFIRMATION_REQUIRED";
            throw err;
          }
          if (sData.duplicate_review.account_fingerprint !== fingerprint) {
            const err = new Error("Account metadata changed after confirmation. Please review again.");
            (err as any).code = "DUPLICATE_FINGERPRINT_MISMATCH";
            throw err;
          }
        }

        // Shared per-user Production Item reservation lock check and write
        if (sessionEnv === 'production') {
          if (lockDoc.exists) {
            const lockData = lockDoc.data()!;
            if (lockData.session_id !== session_id) {
              const err = new Error("A previous Production connection attempt has an unresolved outcome. Reconcile it before connecting another bank.");
              (err as any).code = "UNRESOLVED_PRODUCTION_EXCHANGE";
              throw err;
            }
          }

          t.set(lockRef, {
            session_id: session_id,
            uid: uid,
            state: 'exchange_in_progress',
            environment: 'production',
            acquired_at: FieldValue.serverTimestamp()
          });
        }

        t.update(sessionRef, {
          quota_state: 'exchange_in_progress',
          exchange_started_at: FieldValue.serverTimestamp()
        });
      });

      const client = getPlaidClient();
      let access_token: string, item_id: string;
      try {
        const exchangeResponse = await client.itemPublicTokenExchange({ public_token });
        access_token = exchangeResponse.data.access_token;
        item_id = exchangeResponse.data.item_id;
      } catch (exchangeError: any) {
        // A definitive 4xx proves this exchange call was rejected.
        // This classification depends on the pre-exchange session reservation
        // preventing the same public token from being submitted twice.
        // Do not weaken or remove that reservation guard.
        const isDefinitivePlaidRejection =
          !!exchangeError?.response &&
          exchangeError.response.status >= 400 &&
          exchangeError.response.status < 500 &&
          !!exchangeError.response.data?.error_code;

        if (isDefinitivePlaidRejection) {
          await db.runTransaction(async (t) => {
            const sDoc = await t.get(sessionRef);
            const lockDoc = sessionEnv === 'production' ? await t.get(lockRef) : null;

            if (!sDoc.exists) {
              throw new Error("Session not found");
            }
            const sData = sDoc.data()!;
            if (sData.userId !== uid) {
              throw new Error("Unauthorized");
            }
            if (sData.mode !== 'new_item') {
              throw new Error("Invalid mode: repair mode cannot exchange public token");
            }
            if (sData.quota_state !== 'exchange_in_progress') {
              throw new Error(`Invalid session state: ${sData.quota_state}`);
            }

            if (sessionEnv === 'production') {
              validateProductionLockOwnership(lockDoc, session_id);
              t.delete(lockRef);
            }

            t.update(sessionRef, {
              quota_state: 'exchange_failed',
              status: 'exchange_failed',
              exchange_error: exchangeError.response.data,
              exchange_failed_at: FieldValue.serverTimestamp()
            });
          });

          return res.status(400).json({
            error: exchangeError.response.data.error_message || "Plaid exchange rejected",
            code: exchangeError.response.data.error_code
          });
        } else {
          // Everything else remains exchange_in_progress (unresolved)
          // KEEP shared Production lock!
          console.error("Ambiguous Plaid exchange failure, preserving quota_state as exchange_in_progress:", exchangeError);
          return res.status(500).json({
            code: "PLAID_EXCHANGE_OUTCOME_UNKNOWN",
            error: "Plaid may have created this connection. Do not reconnect this bank until the attempt is reconciled."
          });
        }
      }
      
      // Final Persistence (P0) - Atomic multi-collection transaction
      const indexRef = db.collection('plaid_item_index').doc(item_id);
      
      let internalId: string | null = null;
      let persistSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          internalId = await db.runTransaction(async (t) => {
            // All reads first
            const idxDoc = await t.get(indexRef);
            let existingItemDoc: FirebaseFirestore.DocumentSnapshot | null = null;
            if (idxDoc.exists) {
              const data = idxDoc.data()!;
              const itemRef = db.collection('plaid_items').doc(data.internal_id);
              existingItemDoc = await t.get(itemRef);
            }
            const sDoc = await t.get(sessionRef);
            const lockDoc = sessionEnv === 'production' ? await t.get(lockRef) : null;

            if (!sDoc.exists) throw new Error("Session not found");
            const sData = sDoc.data()!;
            if (sData.userId !== uid) throw new Error("Unauthorized");
            if (sData.mode !== 'new_item') throw new Error("Invalid mode: repair mode cannot exchange public token");
            if (sData.quota_state !== 'exchange_in_progress') {
              throw new Error(`Invalid session state: ${sData.quota_state}`);
            }

            if (sessionEnv === 'production') {
              validateProductionLockOwnership(lockDoc, session_id);
            }

            let targetInternalId: string | null = null;
            
            if (idxDoc.exists) {
              const data = idxDoc.data()!;
              if (!existingItemDoc || !existingItemDoc.exists) {
                // True orphan reference, repair inline
                targetInternalId = db.collection('plaid_items').doc().id;
                t.set(indexRef, {
                  internal_id: targetInternalId,
                  user_id: uid,
                  env: sessionEnv,
                  updatedAt: FieldValue.serverTimestamp()
                });
              } else if (existingItemDoc.data()?.userId !== uid) {
                // Cross-user ownership conflict detected: do not overwrite!
                const err = new Error("Cross-user index ownership conflict detected");
                (err as any).code = 'PLAID_ITEM_INDEX_OWNERSHIP_CONFLICT';
                throw err;
              } else {
                targetInternalId = data.internal_id;
              }
            } else {
              targetInternalId = db.collection('plaid_items').doc().id;
              t.set(indexRef, {
                internal_id: targetInternalId,
                user_id: uid,
                env: sessionEnv,
                createdAt: FieldValue.serverTimestamp()
              });
            }
            
            const newInternalRef = db.collection('plaid_items').doc(targetInternalId);
            t.set(newInternalRef, {
              userId: uid,
              access_token,
              item_id,
              institution_id: institution_id || null,
              institution_name: institution_name || "Unknown",
              accounts: accounts || [],
              createdAt: FieldValue.serverTimestamp(),
              cursor: null,
              health: "healthy",
              has_updates: false
            }, { merge: true });
            
            t.update(sessionRef, {
              quota_state: 'exchanged',
              status: 'success',
              internalItemId: targetInternalId,
              exchanged_at: FieldValue.serverTimestamp()
            });

            // Atomically release shared Production lock upon successful persistence
            if (sessionEnv === 'production') {
              t.delete(lockRef);
            }
            
            return targetInternalId;
          });
          persistSuccess = true;
          break;
        } catch (e: any) {
          if (e.code === 'PLAID_ITEM_INDEX_OWNERSHIP_CONFLICT' || e.code === 'PLAID_PRODUCTION_LOCK_RECONCILIATION_REQUIRED') {
            throw e;
          }
          console.error(`Persistence attempt ${attempt} failed:`, e);
          if (attempt === 3) break;
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
        }
      }

      if (!persistSuccess || !internalId) {
        // Leave quota_state as exchange_in_progress (unresolved) for reconciliation
        // /item/remove does NOT restore a Plaid Trial Item slot.
        try { await client.itemRemove({ access_token }); } catch(e) {}
        return res.status(500).json({
          code: "PLAID_PERSISTENCE_FAILED",
          error: "Failed to durably store access token. Attempt remains unresolved in quota accounting."
        });
      }
      
      // Best-effort Bookkeeping
      res.json({ success: true, internalItemId: internalId });
      
      try {
        const itemRes = await client.itemGet({ access_token });
        const authInstitutionId = itemRes.data.item.institution_id;
        let authInstitutionName = institution_name || "Unknown";
        if (authInstitutionId) {
          const instRes = await client.institutionsGetById({ 
            institution_id: authInstitutionId, 
            country_codes: ['US'] as any 
          });
          authInstitutionName = instRes.data.institution.name;
        }
        const accRes = await client.accountsGet({ access_token });
        const authAccounts = accRes.data.accounts.map(a => ({
          id: a.account_id,
          mask: a.mask,
          name: a.name,
          subtype: a.subtype,
          type: a.type
        }));
        
        await db.collection('plaid_items').doc(internalId).update({
          institution_id: authInstitutionId,
          institution_name: authInstitutionName,
          accounts: authAccounts
        });
      } catch (e) {
        console.warn("Could not fetch authoritative Plaid metadata, connection is safe but incomplete.", e);
      }
    } catch (error: any) {
      console.error(error);
      const code = error.code || error.message;
      if (code === 'DUPLICATE_CONFIRMATION_REQUIRED' || code === 'EXCHANGE_ALREADY_IN_PROGRESS' || code === 'PLAID_ITEM_INDEX_OWNERSHIP_CONFLICT' || code === 'DUPLICATE_FINGERPRINT_MISMATCH' || code === 'UNRESOLVED_PRODUCTION_EXCHANGE' || code === 'PLAID_PRODUCTION_LOCK_RECONCILIATION_REQUIRED') {
        return res.status(409).json({ error: error.message || code, code });
      }
      if (code === 'PLAID_ENVIRONMENT_MISMATCH' || code === 'EXCHANGE_ALREADY_COMPLETED') {
        return res.status(400).json({ error: error.message || code, code });
      }
      res.status(500).json({ error: error.message || "Failed to exchange token" });
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
        console.error("Plaid itemRemove failed", e);
        return res.status(500).json({ error: "Failed to remove item from Plaid. Please try again." });
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
      if (typeof payload.iat !== 'number') {
        return res.status(401).send("Missing or invalid iat");
      }
      if (payload.iat < now - 300) {
        return res.status(401).send("JWT expired");
      }
      if (payload.iat > now + 60) {
        return res.status(401).send("JWT in the future");
      }

      const rawBodyBuf = (req as any).rawBody;
      const bodyHash = crypto.createHash('sha256').update(rawBodyBuf).digest('hex');
      const expectedHash = payload.request_body_sha256 as string;
      if (!expectedHash || expectedHash.length !== bodyHash.length) {
        return res.status(400).send("Invalid body hash format");
      }
      if (!crypto.timingSafeEqual(Buffer.from(expectedHash, 'utf8'), Buffer.from(bodyHash, 'utf8'))) {
        return res.status(401).send("Invalid body hash");
      }

      const { webhook_type, webhook_code, item_id, error } = req.body;
      
      // Fetch by item_id using the index
      const idxDoc = await db.collection('plaid_item_index').doc(item_id).get();
      
      // Unknown item_id evidence is trusted only because Plaid webhook
      // signature/body verification completed successfully before this branch.
      // Do not move orphan capture ahead of signature verification.
      if (!idxDoc.exists) {
        try {
          const orphanRef = db.collection('orphan_items').doc(item_id);
          const existingOrphan = await orphanRef.get();
          
          // Match candidate sessions without guessing on timestamp alone
          const webhookEnv = (payload as any).environment || (req.body as any).environment || process.env.PLAID_ENV || "sandbox";
          const unresolvedSnap = await db.collection('plaid_sessions')
            .where('mode', '==', 'new_item')
            .where('quota_state', '==', 'exchange_in_progress')
            .where('environment', '==', webhookEnv)
            .get();
          
          const candidateSessions = unresolvedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          let reconStatus = "unmatched";
          const candidateIds = candidateSessions.map(s => s.id);
          
          if (candidateSessions.length === 1) {
            reconStatus = "single_candidate";
          } else if (candidateSessions.length > 1) {
            reconStatus = "needs_review";
          }
          
          // Discovering an orphaned item_id from a webhook proves the Plaid Item exists,
          // but does NOT recover the missing access_token.
          const serverNow = FieldValue.serverTimestamp();
          if (!existingOrphan.exists) {
            await orphanRef.set({
              item_id,
              webhook_type: webhook_type || null,
              webhook_code: webhook_code || null,
              environment: webhookEnv,
              first_seen_at: serverNow,
              last_seen_at: serverNow,
              candidate_session_ids: candidateIds,
              reconciliation_status: reconStatus,
              evidence_webhooks: [{ webhook_type, webhook_code, error: error || null, timestamp: new Date().toISOString() }]
            });
          } else {
            await orphanRef.update({
              last_seen_at: serverNow,
              candidate_session_ids: candidateIds,
              reconciliation_status: reconStatus,
              evidence_webhooks: FieldValue.arrayUnion({ webhook_type, webhook_code, error: error || null, timestamp: new Date().toISOString() })
            });
          }
        } catch (orphanErr) {
          console.error("Failed to capture orphan webhook evidence", orphanErr);
        }
        return res.status(200).send("Orphan evidence captured");
      }

      const internalId = idxDoc.data()!.internal_id;
      const itemRef = db.collection('plaid_items').doc(internalId);

      if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') {
        await itemRef.update({
          has_updates: true,
          auto_sync_requested_at: FieldValue.serverTimestamp(),
        });

        if (autoSyncConfig.enabled) {
          const indexedUid = idxDoc.data()?.user_id;
          const itemDoc = indexedUid ? null : await itemRef.get();
          const uid = indexedUid || itemDoc?.data()?.userId;

          if (!uid) {
            await itemRef.update({
              auto_sync_status: 'enqueue_failed',
              auto_sync_error: 'Plaid item owner is missing',
            });
          } else {
            try {
              await itemRef.update({
                auto_sync_status: 'queued',
                auto_sync_error: FieldValue.delete(),
              });
              await enqueueAutomaticSync(uid, item_id);
              await itemRef.update({
                auto_sync_queued_at: FieldValue.serverTimestamp(),
              });
            } catch (enqueueError: any) {
              console.error("Failed to enqueue automatic sync", enqueueError);
              await itemRef.update({
                auto_sync_status: 'enqueue_failed',
                auto_sync_error: String(enqueueError?.message || enqueueError).slice(0, 500),
              });
            }
          }
        }
      } else if (webhook_type === 'ITEM') {
        if (webhook_code === 'ERROR') {
          if (error?.error_code === 'ITEM_LOGIN_REQUIRED') {
            await itemRef.update({ health: 'login_required' });
          }
        } else if (webhook_code === 'PENDING_DISCONNECT') {
          await itemRef.update({ health: 'pending_disconnect' });
        } else if (webhook_code === 'USER_PERMISSION_REVOKED') {
          await itemRef.update({ health: 'permission_revoked' });
        } else if (webhook_code === 'LOGIN_REPAIRED') {
          // Ideally verify via itemGet but webhook is cryptographically trusted
          await itemRef.update({ health: 'healthy' });
        }
      }

      res.status(200).send("Webhook processed");
    } catch (e) {
      console.error("Webhook error", e);
      res.status(400).send("Webhook processing failed");
    }
  });

  // --- SYNC PIPELINE ---

  const handleSyncRequest = async (req: express.Request, res: express.Response) => {
    let jobId = crypto.randomUUID();
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let lostLease = false;
    const uid = (req as any).user.uid;
    const lockRef = db.collection('users').doc(uid).collection('locks').doc('sync');

    try {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();
      const refreshToken = userDoc.data()?.google_refresh_token;
      let sheetId = userDoc.data()?.spreadsheetId;

      if (!refreshToken) {
        if ((req as any).isCloudTask) {
          return res.status(200).json({ success: false, terminal: true, error: "Google Sheets not connected" });
        }
        return res.status(400).json({ error: "Google Sheets not connected" });
      }

      // Atomic Lease Lock
      await db.runTransaction(async (t) => {
        const lockDoc = await t.get(lockRef);
        if (lockDoc.exists && lockDoc.data()?.expires_at.toDate() > new Date()) {
          const e = new Error("Sync already in progress");
          (e as any).code = 'SYNC_ALREADY_RUNNING';
          throw e;
        }
        t.set(lockRef, { 
          job_id: jobId, 
          uid, 
          started_at: FieldValue.serverTimestamp(), 
          heartbeat_at: FieldValue.serverTimestamp(), 
          expires_at: new Date(Date.now() + 60000) 
        });
      });

      heartbeatInterval = setInterval(async () => {
        if (lostLease) return;
        try {
          const ownsLock = await db.runTransaction(async (t) => {
            const lockDoc = await t.get(lockRef);
            if (lockDoc.exists && lockDoc.data()?.job_id === jobId) {
              t.update(lockRef, { 
                heartbeat_at: FieldValue.serverTimestamp(), 
                expires_at: new Date(Date.now() + 60000) 
              });
              return true;
            }
            return false;
          });
          
          if (!ownsLock) {
            lostLease = true;
            if (heartbeatInterval) clearInterval(heartbeatInterval);
          }
        } catch (e) {
          console.error("Heartbeat failed", e);
        }
      }, 30000);

      let errors: string[] = [];
      let hasRetryableErrors = false;
      let totalAdded = 0;
      let totalUpdated = 0;

      try {
        const oauth2Client = getOauth2Client();
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

        const createWorkbook = async () => {
          const createRes = await withGoogleAuth(uid, () => sheets.spreadsheets.create({
            requestBody: { properties: { title: "My Transactions Vault" } }
          }));
          sheetId = createRes.data.spreadsheetId;
          await userRef.set({ spreadsheetId: sheetId }, { merge: true });
        };

        if (!sheetId) await createWorkbook();

        let spreadsheetMeta;
        try {
          spreadsheetMeta = await withGoogleAuth(uid, () => sheets.spreadsheets.get({ spreadsheetId: sheetId }));
        } catch (sheetErr: any) {
          if (sheetErr.code === 404) {
            await createWorkbook();
            spreadsheetMeta = await withGoogleAuth(uid, () => sheets.spreadsheets.get({ spreadsheetId: sheetId }));
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
          const addRes = await withGoogleAuth(uid, () => sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
          }));
          currentSheetId = addRes.data.replies![0].addSheet!.properties!.sheetId;
        }

        const headerRes = await withGoogleAuth(uid, () => sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${sheetName}!1:1` }));
        const currentHeaders = headerRes.data.values?.[0] || [];
        
        if (currentHeaders.length === 0) {
          await withGoogleAuth(uid, () => sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            requestBody: { values: [expectedHeaders] }
          }));
          // Format Date columns as Date
          await withGoogleAuth(uid, () => sheets.spreadsheets.batchUpdate({
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
          }));
        } else if (currentHeaders.join(',') !== expectedHeaders.join(',')) {
           const e = new Error("Schema mismatch: Please rename the existing Transactions_Raw sheet to preserve it, then retry so FinSync can create a new machine-owned tab.");
           (e as any).code = 'SHEET_SCHEMA_MISMATCH';
           throw e;
        }

        // Fetch existing map
        const getRes = await withGoogleAuth(uid, () => sheets.spreadsheets.values.get({ 
           spreadsheetId: sheetId, 
           range: `${sheetName}!A:Y`,
           valueRenderOption: 'UNFORMATTED_VALUE'
        }));
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
          const h = normalizeItemHealth(d.data());
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
            if (item.has_updates) {
              await itemDoc.ref.update({
                auto_sync_status: 'running',
                auto_sync_started_at: FieldValue.serverTimestamp(),
                auto_sync_error: FieldValue.delete(),
              });
            }

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
                updateData.push({
                   range: `${sheetName}!W${rIdx}:X${rIdx}`,
                   values: [['removed', new Date().toISOString()]]
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
               if (lostLease) throw new Error("Sync lease lost, aborting...");
               await withGoogleAuth(uid, () => sheets.spreadsheets.values.batchUpdate({
                 spreadsheetId: sheetId,
                 requestBody: {
                   valueInputOption: 'RAW',
                   data: chunk
                 }
               }));
               totalUpdated += chunk.length;
            }

            const appendChunks = chunkArray(appendValues, 500);
            for (const chunk of appendChunks) {
               if (lostLease) throw new Error("Sync lease lost, aborting...");
               await withGoogleAuth(uid, () => sheets.spreadsheets.values.append({
                 spreadsheetId: sheetId,
                 range: `${sheetName}!A:Y`,
                 valueInputOption: 'RAW',
                 insertDataOption: 'INSERT_ROWS',
                 requestBody: { values: chunk }
               }));
               totalAdded += chunk.length;
            }

            // Durably commit cursor
            if (lostLease) throw new Error("Sync lease lost, aborting...");
            const syncRequestTime = item.auto_sync_requested_at?.toMillis?.() || 0;
            await db.runTransaction(async (transaction) => {
              const currentItemDoc = await transaction.get(itemDoc.ref);
              const currentRequestTime = currentItemDoc.data()?.auto_sync_requested_at?.toMillis?.() || 0;
              const newerSyncRequested = currentRequestTime > syncRequestTime;
              transaction.update(itemDoc.ref, {
                cursor: cursor,
                has_updates: newerSyncRequested,
                auto_sync_status: newerSyncRequested ? 'queued' : 'idle',
                auto_sync_completed_at: FieldValue.serverTimestamp(),
                auto_sync_error: FieldValue.delete(),
              });
            });

            // Balances are separate from the transaction ledger. Refresh the free,
            // cached Plaid account data only after the transaction cursor is safe.
            // A balance failure must never roll back or retry a successful ledger sync.
            const balanceFetchedAt = new Date().toISOString();
            try {
              const accountsResponse = await client.accountsGet({
                access_token: item.access_token,
              });
              const balanceSnapshot = buildStoredBalanceSnapshot({
                institutionName: item.institution_name,
                fetchedAt: balanceFetchedAt,
                accounts: accountsResponse.data.accounts.map(account => ({
                  account_id: account.account_id,
                  name: account.name,
                  mask: account.mask,
                  type: account.type,
                  subtype: account.subtype,
                  balances: account.balances,
                })),
              });

              if (balanceSnapshot) {
                const accountInventory = balanceSnapshot.accounts.map(account => ({
                  id: account.accountId,
                  name: account.accountName,
                  mask: account.accountMask,
                  type: account.accountType,
                  subtype: account.accountSubtype,
                }));
                const balanceDate = getDateForDateInTimezone(
                  new Date(balanceFetchedAt),
                  process.env.FINANCE_TIME_ZONE || "America/New_York"
                );

                await Promise.all([
                  itemDoc.ref.set({
                    accounts: accountInventory,
                    balance_snapshot: balanceSnapshot,
                    balance_last_attempted_at: balanceFetchedAt,
                    balance_last_error: FieldValue.delete(),
                  }, { merge: true }),
                  userRef.collection('balance_snapshots').doc(balanceDate).set({
                    date: balanceDate,
                    updatedAt: balanceFetchedAt,
                    source: 'plaid_accounts_get',
                    items: {
                      [itemDoc.id]: balanceSnapshot,
                    },
                  }, { merge: true }),
                ]);
              }
            } catch (balanceError: any) {
              console.warn(`Could not refresh cached balances for ${item.institution_name}`, balanceError);
              await itemDoc.ref.set({
                balance_last_attempted_at: balanceFetchedAt,
                balance_last_error: 'Balance temporarily unavailable',
              }, { merge: true }).catch(console.warn);
            }

          } catch (itemErr: any) {
             console.error(`Failed syncing item ${item.institution_name}`, itemErr);
             await itemDoc.ref.update({
               auto_sync_status: 'failed',
               auto_sync_error: String(itemErr?.message || itemErr).slice(0, 500),
             }).catch(console.warn);
             
             if (itemErr.code === 'GOOGLE_REAUTH_REQUIRED' || itemErr.code === 401 || itemErr.response?.data?.error === 'invalid_grant' || itemErr.message?.includes('invalid_grant')) {
                await userRef.update({ google_refresh_token: FieldValue.delete() }).catch(console.warn);
                const e = new Error("Google reauthorization required");
                (e as any).code = 'GOOGLE_REAUTH_REQUIRED';
                throw e; // abort outer loop
             }

             if (itemErr.message === "Sync lease lost, aborting...") throw itemErr;

             errors.push(`${item.institution_name}: ${itemErr.message}`);
             if (itemErr.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
                await itemDoc.ref.update({ health: 'login_required' });
             } else {
                hasRetryableErrors = true;
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

      dashboardCache.invalidate(uid);
      if ((req as any).isCloudTask && hasRetryableErrors) {
        return res.status(500).json({ success: false, error: 'Automatic sync encountered a retryable error', errors });
      }
      res.json({ success: true, added: totalAdded, updated: totalUpdated, errors });
    } catch (error: any) {
      console.error(error);
      const code = error.code || 'PLAID_SYNC_FAILED';
      const msg = error.message || "Sync failed completely";
      if (code === 'SYNC_ALREADY_RUNNING') {
        return res.status(409).json({ code: 'SYNC_ALREADY_RUNNING', error: 'A transaction sync is already in progress.' });
      }
      if (code === 'GOOGLE_REAUTH_REQUIRED') {
        if ((req as any).isCloudTask) {
          return res.status(200).json({ success: false, terminal: true, code, error: 'Google reauthorization required' });
        }
        return res.status(401).json({ code: 'GOOGLE_REAUTH_REQUIRED', error: 'Google reauthorization required' });
      }
      if ((req as any).isCloudTask && (code === 'SHEET_SCHEMA_MISMATCH' || code === 'GOOGLE_OAUTH_CONFIG_MISSING')) {
        return res.status(200).json({ success: false, terminal: true, code, error: msg });
      }
      res.status(500).json({ error: msg, code });
    }
  };

  app.post("/api/sync", requireAuth, handleSyncRequest);
  app.post("/api/internal/sync", requireCloudTaskAuth, handleSyncRequest);

  
async function fetchNormalizedTransactions(
  uid: string,
  options: { allowCredentialCleanup?: boolean } = {}
): Promise<NormalizedTransaction[]> {
  return dashboardCache.getOrLoad(uid, async () => {
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    if (!userData?.google_refresh_token || !userData?.spreadsheetId) {
      throw new Error('Google Sheets not connected');
    }

    const oauth2Client = getOauth2Client();
    oauth2Client.setCredentials({ refresh_token: userData.google_refresh_token });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const fetchRows = () => sheets.spreadsheets.values.get({
      spreadsheetId: userData.spreadsheetId,
      range: 'Transactions_Raw!A:Y',
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const rowsPromise = options.allowCredentialCleanup === false
      ? fetchRows()
      : withGoogleAuth(uid, fetchRows);
    const overridesPromise = userRef.collection('transaction_overrides').get();
    const rulesPromise = userRef.collection('classification_rules').get();
    const [getRes, overridesSnapshot, rulesSnapshot] = await Promise.all([
      rowsPromise,
      overridesPromise,
      rulesPromise,
    ]);

    const overrides = new Map<string, TransactionOverride>();
    for (const document of overridesSnapshot.docs) {
      const override = parseStoredTransactionOverride(document.data());
      if (override) overrides.set(document.id, override);
    }

    const rules = rulesSnapshot.docs.flatMap(document => {
      const rule = parseStoredClassificationRule(document.id, document.data());
      return rule ? [rule] : [];
    });

    const rows = getRes.data.values || [];
    return applyClassificationSuggestions(
      deduplicateAndNormalizeTransactions(rows, overrides),
      rules
    );
  });
}

const transactionOverrideDependencies: TransactionOverrideServiceDependencies = {
  loadTransactions: fetchNormalizedTransactions,
  persistOverride: async (
    uid,
    transactionId,
    override,
    rememberedRule,
    appliedSuggestionRuleId
  ) => {
    const userRef = db.collection('users').doc(uid);
    const batch = db.batch();
    batch.set(userRef.collection('transaction_overrides').doc(transactionId), override);

    if (rememberedRule) {
      const { ruleId, ...ruleData } = rememberedRule;
      batch.set(
        userRef.collection('classification_rules').doc(ruleId),
        { ...ruleData, timesApplied: FieldValue.increment(0) },
        { merge: true }
      );
    }
    if (appliedSuggestionRuleId) {
      batch.update(
        userRef.collection('classification_rules').doc(appliedSuggestionRuleId),
        { timesApplied: FieldValue.increment(1) }
      );
    }

    await batch.commit();
  },
  deleteOverride: async (uid, transactionId) => {
    await db.collection('users').doc(uid)
      .collection('transaction_overrides').doc(transactionId)
      .delete();
  },
  invalidateCache: uid => dashboardCache.invalidate(uid),
  reviewedAt: () => Timestamp.now(),
};

const classificationRuleDependencies: ClassificationRuleServiceDependencies = {
  deleteRule: async (uid, ruleId) => {
    await db.collection('users').doc(uid)
      .collection('classification_rules').doc(ruleId)
      .delete();
  },
  invalidateCache: uid => dashboardCache.invalidate(uid),
};

const recurringDecisionDependencies: RecurringDecisionServiceDependencies = {
  loadDetected: async uid => (
    detectLikelyRecurringObligations(await fetchNormalizedTransactions(uid))
  ),
  setDecision: async (uid, obligationId, decision) => {
    await db.collection('users').doc(uid)
      .collection('recurring_obligations').doc(obligationId)
      .set(decision);
  },
  deleteDecision: async (uid, obligationId) => {
    await db.collection('users').doc(uid)
      .collection('recurring_obligations').doc(obligationId)
      .delete();
  },
  updatedAt: () => Timestamp.now(),
};



async function fetchRawTransactionsRows(uid: string): Promise<any[]> {
  const userRef = db.collection('users').doc(uid);
  const userDoc = await userRef.get();
  const userData = userDoc.data();
  if (!userData?.google_refresh_token || !userData?.spreadsheetId) {
    throw new Error('Google Sheets not connected');
  }

  const oauth2Client = getOauth2Client();
  oauth2Client.setCredentials({ refresh_token: userData.google_refresh_token });
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  
  const getRes = await withGoogleAuth(uid, () => sheets.spreadsheets.values.get({ 
    spreadsheetId: userData.spreadsheetId, 
    range: 'Transactions_Raw!A:Y',
    valueRenderOption: 'UNFORMATTED_VALUE'
  }));
  
  return getRes.data.values || [];
}


app.get("/api/dev/accounts-preflight", requireAuth, async (req: express.Request, res: express.Response) => {
  if (process.env.PLAID_ENV !== 'sandbox' || process.env.ENABLE_SANDBOX_ACCEPTANCE !== 'true') {
    return res.status(403).json({ error: "Only available in Sandbox" });
  }

  try {
    const uid = (req as any).user.uid;
    const plaidItemsSnap = await db.collection("plaid_items").where("userId", "==", uid).get();
    
    const items = plaidItemsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        institutionName: data.institution_name,
        health: normalizeItemHealth(data),
        accounts: data.accounts
      };
    });
    const txs = await fetchNormalizedTransactions(uid, { allowCredentialCleanup: false });

    res.json(buildAccountsPreflightReport(items, txs));
  } catch (error: any) {
    console.error("Accounts Preflight Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dev/sandbox-acceptance", requireAuth, async (req: express.Request, res: express.Response) => {
  if (process.env.PLAID_ENV !== 'sandbox' || process.env.ENABLE_SANDBOX_ACCEPTANCE !== 'true') {
    return res.status(403).json({ error: "Only available in Sandbox" });
  }
  try {
    const uid = (req as any).user.uid;
    const rawRows = await fetchRawTransactionsRows(uid);
    // Dynamic import to avoid CJS require issue if sandbox-acceptance uses ES syntax in dev
    // Wait, the typescript server is compiled to CJS eventually, but during dev it's tsx.
    // So import() works. Actually just standard ES import or require.
    // In server.ts we use import at the top. Let's add an import at the top instead!
    const { generateAcceptanceReport } = await import("./server/lib/sandbox-acceptance");
    const report = generateAcceptanceReport(rawRows);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/dev/sandbox-refresh", requireAuth, async (req: express.Request, res: express.Response) => {
  if (process.env.PLAID_ENV !== 'sandbox' || process.env.ENABLE_SANDBOX_ACCEPTANCE !== 'true') {
    return res.status(403).json({ error: "Only available in Sandbox" });
  }
  try {
    const uid = (req as any).user.uid;
    const { internalItemId } = req.body;
    
    if (!internalItemId) {
      return res.status(400).json({ error: "internalItemId is required." });
    }

    const itemSnap = await db.collection("plaid_items").doc(internalItemId).get();
    if (!itemSnap.exists) {
      return res.status(404).json({ error: "Connected item not found." });
    }
    
    const itemData = itemSnap.data()!;
    if (itemData.userId !== uid) {
      return res.status(403).json({ error: "Unauthorized access to item." });
    }
    if (!itemData.access_token) {
      return res.status(400).json({ error: "No access token found." });
    }
    if (['pending_disconnect', 'permission_revoked', 'login_required'].includes(itemData.health || '')) {
       return res.status(400).json({ error: "Item is disconnected or requires repair." });
    }

    const plaidClient = getPlaidClient();
    await plaidClient.transactionsRefresh({
      access_token: itemData.access_token,
    });
    
    res.json({ success: true, message: "Sandbox refresh triggered. Webhook will arrive shortly." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dashboard/summary", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const txs = await fetchNormalizedTransactions((req as any).user.uid);
    const financeTz = process.env.FINANCE_TIME_ZONE || "America/New_York";
    const summary = aggregateSummary(txs, financeTz);
    res.json(summary);
  } catch (error: any) {
    console.error("Dashboard Summary Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dashboard/categories", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const txs = await fetchNormalizedTransactions((req as any).user.uid);
    const categories = aggregateCategories(txs);
    res.json({ categories });
  } catch (error: any) {
    console.error("Dashboard Categories Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dashboard/merchants", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const txs = await fetchNormalizedTransactions((req as any).user.uid);
    const merchants = aggregateMerchants(txs);
    res.json({ merchants: merchants.slice(0, 50) });
  } catch (error: any) {
    console.error("Dashboard Merchants Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dashboard/trends", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const validRanges = ['6m', '12m', 'ytd'];
    const rangeParam = req.query.range as string || '12m';
    if (!validRanges.includes(rangeParam)) {
      return res.status(400).json({ error: "Invalid range parameter. Allowed: 6m, 12m, ytd" });
    }
    
    const txs = await fetchNormalizedTransactions((req as any).user.uid);
    const financeTz = process.env.FINANCE_TIME_ZONE || "America/New_York";
    const trends = aggregateTrends(txs, rangeParam, financeTz);
    res.json({ monthly: trends });
  } catch (error: any) {
    console.error("Dashboard Trends Error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function loadRecurringPlanning(uid: string) {
  const [txs, snapshot] = await Promise.all([
    fetchNormalizedTransactions(uid),
    db.collection('users').doc(uid).collection('recurring_obligations').get(),
  ]);
  const decisions = new Map<string, StoredRecurringObligationDecision>();
  for (const document of snapshot.docs) {
    const decision = parseStoredRecurringDecision(document.data());
    if (decision) decisions.set(document.id, decision);
  }
  const financeTz = process.env.FINANCE_TIME_ZONE || "America/New_York";
  const now = new Date();
  const currentMonth = getMonthForDateInTimezone(now, financeTz);
  const recurringObligations = buildRecurringPlanningReport(
    detectLikelyRecurringObligations(txs),
    decisions,
    currentMonth
  );
  return { txs, recurringObligations, financeTz, now };
}

async function loadAccountBalanceSummary(uid: string, now = new Date()) {
  const snapshot = await db.collection('plaid_items').where('userId', '==', uid).get();
  return buildAccountBalanceSummary(snapshot.docs.map(document => {
    const item = document.data();
    return {
      itemId: document.id,
      institutionName: item.institution_name,
      health: normalizeItemHealth(item),
      accounts: item.accounts,
      balanceSnapshot: item.balance_snapshot,
    };
  }), now.toISOString());
}

app.get("/api/dashboard/overview", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const validRanges = ['6m', '12m', 'ytd'];
    const rangeParam = req.query.range as string || '12m';
    if (!validRanges.includes(rangeParam)) {
      return res.status(400).json({ error: "Invalid range parameter. Allowed: 6m, 12m, ytd" });
    }

    const uid = (req as any).user.uid;
    const [{ txs, recurringObligations, financeTz, now }, accountBalances] = await Promise.all([
      loadRecurringPlanning(uid),
      loadAccountBalanceSummary(uid),
    ]);
    const verification = buildVerificationReport(txs, financeTz);

    res.json({
      summary: verification.summary,
      categories: verification.categories,
      merchants: verification.merchants.slice(0, 50),
      trends: aggregateTrends(txs, rangeParam, financeTz),
      recurringObligations,
      householdInsights: buildHouseholdInsights(
        txs,
        recurringObligations.obligations,
        getDateForDateInTimezone(now, financeTz)
      ),
      verification,
      postedTransactions: buildTransactionsPage(txs, { status: 'posted', limit: 6 }).transactions,
      pendingTransactions: buildTransactionsPage(txs, { status: 'pending', limit: 4 }).transactions,
      accountBalances,
    });
  } catch (error: any) {
    console.error("Dashboard Overview Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dashboard/household-insights", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const { txs, recurringObligations, financeTz, now } = await loadRecurringPlanning(uid);
    res.json({
      recurringObligations,
      insights: buildHouseholdInsights(
        txs,
        recurringObligations.obligations,
        getDateForDateInTimezone(now, financeTz)
      ),
    });
  } catch (error: any) {
    console.error("Household Insights Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dashboard/recurring-obligations", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const { recurringObligations } = await loadRecurringPlanning(uid);
    res.json(recurringObligations);
  } catch (error: any) {
    console.error("Recurring Obligations Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/recurring-obligations/:obligationId", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const obligationId = req.params.obligationId;
    const decision = await saveRecurringDecision(
      recurringDecisionDependencies,
      uid,
      obligationId,
      req.body
    );
    res.json({ obligationId, decision });
  } catch (error: any) {
    if (error instanceof RecurringObligationRequestError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Recurring Obligation Write Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/recurring-obligations/:obligationId", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const obligationId = req.params.obligationId;
    await removeRecurringDecision(recurringDecisionDependencies, uid, obligationId);
    res.json({ success: true, obligationId });
  } catch (error: any) {
    if (error instanceof RecurringObligationRequestError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Recurring Obligation Delete Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dashboard/verification", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const txs = await fetchNormalizedTransactions((req as any).user.uid);
    const financeTz = process.env.FINANCE_TIME_ZONE || "America/New_York";
    const report = buildVerificationReport(txs, financeTz);
    res.json(report);
  } catch (error: any) {
    console.error("Verification Report Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/transactions/overrides", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const snapshot = await db.collection('users').doc(uid)
      .collection('transaction_overrides')
      .orderBy('reviewedAt', 'desc')
      .get();

    const overrides = snapshot.docs.flatMap(document => {
      const data = document.data();
      const parsed = parseStoredTransactionOverride(data);
      if (!parsed) return [];
      return [{
        transactionId: document.id,
        ...parsed,
        reviewedAt: data.reviewedAt,
        reviewedBy: data.reviewedBy,
      }];
    });

    res.json({ overrides });
  } catch (error: any) {
    console.error("Transaction Overrides List Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/classification-rules", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const snapshot = await db.collection('users').doc(uid)
      .collection('classification_rules')
      .get();
    const rules = snapshot.docs.flatMap(document => {
      const rule = parseStoredClassificationRule(document.id, document.data());
      return rule ? [rule] : [];
    });
    rules.sort((a, b) => a.merchantKey.localeCompare(b.merchantKey));
    res.json({ rules });
  } catch (error: any) {
    console.error("Classification Rules List Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/classification-rules/:ruleId", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const ruleId = req.params.ruleId;
    await removeClassificationRule(classificationRuleDependencies, uid, ruleId);
    res.json({ success: true, ruleId });
  } catch (error: any) {
    if (error instanceof ClassificationRuleRequestError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Classification Rule Delete Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/transactions/:transactionId/override", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const transactionId = req.params.transactionId;
    const override = await saveTransactionOverride(
      transactionOverrideDependencies,
      uid,
      transactionId,
      req.body
    );

    res.json({ transactionId, override });
  } catch (error: any) {
    if (error instanceof TransactionOverrideRequestError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Transaction Override Write Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/transactions/:transactionId/override", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const transactionId = req.params.transactionId;
    await removeTransactionOverride(transactionOverrideDependencies, uid, transactionId);
    res.json({ success: true, transactionId });
  } catch (error: any) {
    if (error instanceof TransactionOverrideRequestError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Transaction Override Delete Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/transactions", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const txs = await fetchNormalizedTransactions((req as any).user.uid);

    // This in-memory sort/pagination is appropriate for the current cached ledger size.
    // If the ledger grows substantially, it should move closer to the data/cache layer.
    res.json(buildTransactionsPage(txs, req.query));
  } catch (error: any) {
    console.error("Transactions Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Connected account inventory. Source of truth for connected accounts. Represents accounts present in connected Plaid items. Do not repurpose as the ledger-account source.
app.get("/api/connected-accounts", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const plaidItemsSnap = await db.collection("plaid_items").where("userId", "==", uid).get();
    const accounts = buildConnectedAccounts(plaidItemsSnap.docs.map(doc => {
      const item = doc.data();
      return {
        institutionName: item.institution_name,
        health: normalizeItemHealth(item),
        accounts: item.accounts
      };
    }));

    res.json(accounts);
  } catch (error: any) {
    console.error("Connected Accounts Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Ledger account inventory. Used by Transactions filters. Represents accounts present in normalized transaction history. Do not repurpose as the connected-account source.
app.get("/api/accounts", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const txs = await fetchNormalizedTransactions(uid);
    
    // Fetch plaidItems for health from plaid_items collection
    const plaidItemsSnap = await db.collection("plaid_items").where("userId", "==", uid).get();
    const plaidItemsData = plaidItemsSnap.docs.map(doc => doc.data());
    const itemHealthMap = buildAccountHealthMap(plaidItemsData);
    
    const accountsMap: Record<string, any> = {};
    for (const t of txs) {
      if (!accountsMap[t.accountId]) {
        accountsMap[t.accountId] = {
          accountId: t.accountId,
          institutionName: t.institutionName,
          accountName: t.accountName,
          accountMask: t.accountMask,
          accountType: t.accountType,
          accountSubtype: t.accountSubtype,
          health: itemHealthMap.get(t.accountId) || "unknown"
        };
      }
    }
    
    res.json(Object.values(accountsMap));
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
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
