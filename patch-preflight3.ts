import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

const newPreflight = `app.get('/api/dev/preflight', async (req: any, res: any) => {
  try {
    const plaidItemsSnap = await db.collection('plaid_items').get();
    const plaidItems = plaidItemsSnap.docs.map(d => d.data());
    
    // I can't easily fetch transactions since it requires UID.
    // Let's just return the plaidItems preflight
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
    
    const itemHealths = plaidItems.map(i => normalizeItemHealth(i));
    
    res.json({
      totalItems,
      activeItems,
      disconnectedItems,
      activeNonEmpty,
      activeEmpty,
      uniquePersisted: persistedAccountIds.size,
      itemHealths
    });
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

  if (process.env.NODE_ENV !== "production") {`;

const regex = /app\.get\('\/api\/dev\/preflight'[\s\S]*?if \(process\.env\.NODE_ENV !== "production"\) {/;
content = content.replace(regex, newPreflight);
fs.writeFileSync('server.ts', content);
