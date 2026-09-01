import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { normalizeItemHealth } from './server/lib/financial';

const FIREBASE_PROJECT_ID = "gen-lang-client-0864937792";
const FIRESTORE_DATABASE_ID = "ai-studio-3aabea25-37f3-4131-89c3-c2aaa9384046";

let db: any;
try {
  const firebaseApp = initializeApp({
    credential: applicationDefault(),
    projectId: FIREBASE_PROJECT_ID,
  });
  db = getFirestore(firebaseApp, FIRESTORE_DATABASE_ID);
} catch (e) {
  console.error("Firebase init failed:", e);
}

async function run() {
  const users = await db.collection('users').limit(1).get();
  if (users.empty) {
    console.log("No users found");
    return;
  }
  const uid = users.docs[0].id;
  
  const itemsSnapshot = await db.collection('users').doc(uid).collection('plaid_items').get();
  const plaidItems = itemsSnapshot.docs.map((d: any) => d.data());
  
  const txsSnapshot = await db.collection('users').doc(uid).collection('transactions').get();
  const txs = txsSnapshot.docs.map((d: any) => d.data());
  
  let totalItems = plaidItems.length;
  let activeItems = 0;
  let disconnectedItems = 0;
  let activeNonEmpty = 0;
  let activeEmpty = 0;
  
  const persistedAccountIds = new Set();
  
  plaidItems.forEach((item: any) => {
     let health = normalizeItemHealth(item);
     if (health === 'disconnected') {
       disconnectedItems++;
     } else {
       activeItems++;
       if (item.accounts && item.accounts.length > 0) {
         activeNonEmpty++;
       } else {
         activeEmpty++;
         console.log(`ACTIVE EMPTY/MISSING ACCOUNTS ITEM FOUND: ${item.institution_name}, health: ${health}`);
       }
     }
     
     if (item.accounts) {
       item.accounts.forEach((a: any) => persistedAccountIds.add(a.id || a.account_id || a.accountId));
     }
  });
  
  const ledgerAccountIds = new Set(txs.map((t: any) => t.account_id || t.accountId));
  
  const both = [...persistedAccountIds].filter(id => ledgerAccountIds.has(id));
  const persistedNoLedger = [...persistedAccountIds].filter(id => !ledgerAccountIds.has(id));
  const ledgerNoLedger = [...ledgerAccountIds].filter(id => !persistedAccountIds.has(id));
  
  console.log('--- PREFLIGHT REPORT ---');
  console.log(`Total Plaid Items: ${totalItems}`);
  console.log(`Active Items: ${activeItems}`);
  console.log(`Disconnected Items: ${disconnectedItems}`);
  console.log(`Active non-empty accounts: ${activeNonEmpty}`);
  console.log(`Active empty accounts: ${activeEmpty}`);
  console.log(`Unique persisted account IDs: ${persistedAccountIds.size}`);
  console.log(`Unique ledger account IDs: ${ledgerAccountIds.size}`);
  console.log(`IDs in both: ${both.length}`);
  console.log(`Persisted IDs with no ledger: ${persistedNoLedger.length}`);
  console.log(`Ledger IDs with no persisted: ${ledgerNoLedger.length}`);
  
  const itemHealths = plaidItems.map((i: any) => normalizeItemHealth(i));
  console.log(`Raw item healths: ${itemHealths.join(', ')}`);
}
run().catch(console.error);
