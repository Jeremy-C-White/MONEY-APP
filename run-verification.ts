import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { deduplicateAndNormalizeTransactions } from "./server/lib/financial.js";
import { buildVerificationReport } from "./server/lib/aggregations.js";

async function run() {
  const firebaseApp = initializeApp({
    credential: applicationDefault(),
  });
  const db = getFirestore(firebaseApp, "ai-studio-3aabea25-37f3-4131-89c3-c2aaa9384046");
  
  // Find a user who has transactions
  const txsSnap = await db.collection("Transactions_Raw").limit(10).get();
  if (txsSnap.empty) {
    console.log("No transactions found.");
    return;
  }
  const anyTx = txsSnap.docs[0].data();
  const uid = anyTx.userId;
  
  const allTxsSnap = await db.collection("Transactions_Raw").where("userId", "==", uid).get();
  const rawRows = allTxsSnap.docs.map(d => d.data().row);
  console.log(`Found ${rawRows.length} raw rows for user ${uid}.`);
  
  const txs = deduplicateAndNormalizeTransactions(rawRows);
  const report = buildVerificationReport(txs, 'America/New_York');
  
  console.log(JSON.stringify(report.reconciliation, null, 2));
}

run().catch(console.error);
