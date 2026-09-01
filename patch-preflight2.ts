import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// I need to find the old preflight and replace it.
const preflightStart = "app.get('/api/dev/preflight', async (req: any, res: any) => {";
const preflightEnd = "  if (process.env.NODE_ENV !== \"production\") {";

// Since I just want to replace the whole preflight block, let's just use string replacement.
const newPreflight = `app.get('/api/dev/preflight', async (req: any, res: any) => {
  try {
    const users = await db.collection('users').limit(1).get();
    if (users.empty) {
      return res.json({ error: "No users found" });
    }
    const uid = users.docs[0].id;
    
    const plaidItemsSnap = await db.collection('plaid_items').where("userId", "==", uid).get();
    const plaidItems = plaidItemsSnap.docs.map(d => d.data());
    
    const txs = await fetchNormalizedTransactions(uid);
    
    let totalItems = plaidItems.length;
    let activeItems = 0;
    let disconnectedItems = 0;
    let activeNonEmpty = 0;
    let activeEmpty = 0;
    
    const persistedAccountIds = new Set();
    
    plaidItems.forEach(item => {
       let health = normalizeItemHealth(item);
       if (health === 'disconnected') {
         disconnectedItems++;
       } else {
         activeItems++;
         if (item.accounts && item.accounts.length > 0) {
           activeNonEmpty++;
         } else {
           activeEmpty++;
         }
       }
       
       if (item.accounts) {
         item.accounts.forEach((a: any) => persistedAccountIds.add(a.id || a.account_id || a.accountId));
       }
    });
    
    const ledgerAccountIds = new Set(txs.map(t => t.account_id || t.accountId));
    
    const both = [...persistedAccountIds].filter(id => ledgerAccountIds.has(id));
    const persistedNoLedger = [...persistedAccountIds].filter(id => !ledgerAccountIds.has(id));
    const ledgerNoLedger = [...ledgerAccountIds].filter(id => !persistedAccountIds.has(id));
    
    const itemHealths = plaidItems.map(i => normalizeItemHealth(i));
    
    res.json({
      totalItems,
      activeItems,
      disconnectedItems,
      activeNonEmpty,
      activeEmpty,
      uniquePersisted: persistedAccountIds.size,
      uniqueLedger: ledgerAccountIds.size,
      both: both.length,
      persistedNoLedger: persistedNoLedger.length,
      ledgerNoLedger: ledgerNoLedger.length,
      itemHealths
    });
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

  if (process.env.NODE_ENV !== "production") {`;

// Replace from app.get('/api/dev/preflight to if (process.env.NODE_ENV
const regex = /app\.get\('\/api\/dev\/preflight'[\s\S]*?if \(process\.env\.NODE_ENV !== "production"\) {/;
content = content.replace(regex, newPreflight);
fs.writeFileSync('server.ts', content);
