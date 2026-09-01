import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// I need to change:
// });
// 
//   try {
//     const uid = (req as any).user.uid;
//     const txs = await fetchNormalizedTransactions(uid);

// No, let's just restore server.ts from the previous version I can grep it or I can just fix it carefully.

// Let's find the string that I messed up.
const brokenString = `app.get("/api/accounts", requireAuth, async (req: express.Request, res: express.Response) => {

// Connected account inventory.
// Used by the Accounts page.
// Represents account metadata persisted on Plaid Item documents.
// Does not derive account existence from transaction history.
app.get("/api/connected-accounts", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const plaidItemsSnap = await db.collection("users").doc(uid).collection("plaid_items").get();
    const plaidItems = plaidItemsSnap.docs.map(doc => doc.data());
    
    const connectedAccounts = buildConnectedAccounts(plaidItems);
    
    // For preflight/debugging locally
    plaidItems.forEach(item => {
      let health = item.health || 'unknown';
      if (item.accounts && item.accounts.length === 0 && health !== 'disconnected') {
        console.warn('ACTIVE EMPTY/MISSING ACCOUNTS ITEM FOUND:', item.institution_name, health);
      }
    });

    res.json(connectedAccounts);
  } catch (err: any) {
    console.error("Error fetching connected accounts:", err);
    res.status(500).json({ error: err.message });
  }
});

  try {`;

// Replace it with:
const correctString = `// Connected account inventory.
// Used by the Accounts page.
// Represents account metadata persisted on Plaid Item documents.
// Does not derive account existence from transaction history.
app.get("/api/connected-accounts", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const uid = (req as any).user.uid;
    const plaidItemsSnap = await db.collection("users").doc(uid).collection("plaid_items").get();
    const plaidItems = plaidItemsSnap.docs.map(doc => doc.data());
    
    const connectedAccounts = buildConnectedAccounts(plaidItems);
    
    // For preflight/debugging locally
    plaidItems.forEach(item => {
      let health = item.health || 'unknown';
      if (item.accounts && item.accounts.length === 0 && health !== 'disconnected') {
        console.warn('ACTIVE EMPTY/MISSING ACCOUNTS ITEM FOUND:', item.institution_name, health);
      }
    });

    res.json(connectedAccounts);
  } catch (err: any) {
    console.error("Error fetching connected accounts:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/accounts", requireAuth, async (req: express.Request, res: express.Response) => {
  try {`;

content = content.replace(brokenString, correctString);
fs.writeFileSync('server.ts', content);
