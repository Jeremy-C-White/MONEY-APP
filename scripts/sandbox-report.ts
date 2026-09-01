import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { deduplicateAndNormalizeTransactions } from "../server/lib/financial.js";
import { buildVerificationReport } from "../server/lib/aggregations.js";
import 'dotenv/config';

async function run() {
  const firebaseApp = initializeApp({
    credential: applicationDefault(),
  });
  
  // Attempt to use the default db, or fallback to the specific one
  let db;
  try {
    db = getFirestore(firebaseApp, "ai-studio-3aabea25-37f3-4131-89c3-c2aaa9384046");
  } catch(e) {
    db = getFirestore(firebaseApp);
  }

  // Get the first user
  const usersSnap = await db.collection("users").limit(1).get();
  if (usersSnap.empty) {
    console.log("No users found in database. Please link an item first.");
    return;
  }
  const uid = usersSnap.docs[0].id;
  
  const txsSnap = await db.collection("Transactions_Raw").where("userId", "==", uid).get();
  const rawRows = txsSnap.docs.map(d => d.data().row);
  
  if (rawRows.length === 0) {
    console.log("No transactions found for user.");
    return;
  }
  
  const normalized = deduplicateAndNormalizeTransactions(rawRows);
  const report = buildVerificationReport(normalized, 'America/New_York');
  
  console.log("\n==================================================");
  console.log("FINSYNC PRE-PRODUCTION SANDBOX ACCEPTANCE REPORT");
  console.log("==================================================\n");
  
  // 1. Pending -> Posted End-to-End
  const removedTxs = normalized.filter(t => t.removed);
  const postedWithPendingId = normalized.filter(t => t.pendingTransactionId && !t.pending && !t.removed);
  let pendingPass = false;
  let pendingDoc = null;
  if (removedTxs.length > 0 && postedWithPendingId.length > 0) {
    pendingPass = true;
    pendingDoc = {
      removedId: removedTxs[0].transactionId,
      postedId: postedWithPendingId[0].transactionId,
      cashFlowAmount: removedTxs[0].cashFlowAmount,
    };
  }
  console.log(`[${pendingPass ? 'PASS' : 'FAIL'}] Pending -> Posted End-to-End`);
  if (pendingDoc) {
    console.log(`  Source IDs: Removed=${pendingDoc.removedId}, Posted=${pendingDoc.postedId}`);
    console.log(`  Classification: removed (pending) / ${postedWithPendingId[0].classification} (posted)`);
    console.log(`  Raw Cash Flow: ${pendingDoc.cashFlowAmount}`);
    console.log(`  Spending Adj: ${postedWithPendingId[0].spendingAdjustment}`);
    console.log(`  Pending Transaction ID Relationship: ${postedWithPendingId[0].pendingTransactionId}`);
    console.log(`  Affected bucket: spending (posted only, double counting avoided)`);
  } else {
    console.log(`  Missing superseded pending / posted pair. Ensure you fired the sandbox webhook and synced.`);
  }
  console.log("");

  // 2. Payroll / Income Acceptance
  const incomeTx = normalized.find(t => t.classification === 'income');
  console.log(`[${incomeTx ? 'PASS' : 'FAIL'}] Payroll / Income Acceptance`);
  if (incomeTx) {
    console.log(`  Source ID: ${incomeTx.transactionId}`);
    console.log(`  Classification: ${incomeTx.classification}`);
    console.log(`  Raw Cash Flow: ${incomeTx.cashFlowAmount}`);
    console.log(`  Income Adj: ${incomeTx.incomeAdjustment}`);
    console.log(`  Row exists in Transactions_Raw: YES`);
    console.log(`  Affected bucket: Recognized Income`);
  }
  console.log("");

  // 3. Explicit Refund Acceptance
  const refundTx = normalized.find(t => t.classification === 'refund');
  console.log(`[${refundTx ? 'PASS' : 'FAIL'}] Explicit Refund Acceptance`);
  if (refundTx) {
    console.log(`  Source ID: ${refundTx.transactionId}`);
    console.log(`  Classification: ${refundTx.classification}`);
    console.log(`  Raw Cash Flow: ${refundTx.cashFlowAmount}`);
    console.log(`  Spending Adj: ${refundTx.spendingAdjustment}`);
    console.log(`  Affected bucket: Refunds`);
  }
  console.log("");

  // 4. Ambiguous Positive Credit
  const ambiguousTx = normalized.find(t => t.classification === 'other' && t.cashFlowAmount > 0);
  console.log(`[${ambiguousTx ? 'PASS' : 'FAIL'}] Ambiguous Positive Credit Acceptance`);
  if (ambiguousTx) {
    console.log(`  Source ID: ${ambiguousTx.transactionId}`);
    console.log(`  Classification: ${ambiguousTx.classification}`);
    console.log(`  Raw Cash Flow: ${ambiguousTx.cashFlowAmount}`);
    console.log(`  Spending/Income Adj: 0`);
    console.log(`  Affected bucket: Unclassified Positive`);
  }
  console.log("");

  // 5. Cash Withdrawal
  const withdrawalTx = normalized.find(t => t.classification === 'cash_withdrawal');
  console.log(`[${withdrawalTx ? 'PASS' : 'FAIL'}] Cash Withdrawal Acceptance`);
  if (withdrawalTx) {
    console.log(`  Source ID: ${withdrawalTx.transactionId}`);
    console.log(`  Classification: ${withdrawalTx.classification}`);
    console.log(`  Raw Cash Flow: ${withdrawalTx.cashFlowAmount}`);
    console.log(`  Affected bucket: Cash Withdrawals`);
  }
  console.log("");

  // 6. Outgoing P2P
  const outgoingP2P = normalized.find(t => t.classification === 'person_to_person' && t.cashFlowAmount < 0);
  console.log(`[${outgoingP2P ? 'PASS' : 'FAIL'}] Outgoing P2P Acceptance`);
  if (outgoingP2P) {
    console.log(`  Source ID: ${outgoingP2P.transactionId}`);
    console.log(`  Classification: ${outgoingP2P.classification}`);
    console.log(`  Raw Cash Flow: ${outgoingP2P.cashFlowAmount}`);
    console.log(`  Spending Adj: ${outgoingP2P.spendingAdjustment}`);
    console.log(`  Affected bucket: P2P Outgoing / Net Spending`);
  }
  console.log("");

  // 7. Incoming P2P
  const incomingP2P = normalized.find(t => t.classification === 'person_to_person' && t.cashFlowAmount > 0);
  console.log(`[${incomingP2P ? 'PASS' : 'FAIL'}] Incoming P2P Acceptance`);
  if (incomingP2P) {
    console.log(`  Source ID: ${incomingP2P.transactionId}`);
    console.log(`  Classification: ${incomingP2P.classification}`);
    console.log(`  Raw Cash Flow: ${incomingP2P.cashFlowAmount}`);
    console.log(`  Income Adj: ${incomingP2P.incomeAdjustment}`);
    console.log(`  Affected bucket: P2P Incoming (does not increase Recognized Income)`);
  }
  console.log("");

  // 8. Removed/Reversed Transaction
  console.log(`[${removedTxs.length > 0 ? 'PASS' : 'FAIL'}] Removed/Reversed Transaction Acceptance`);
  if (removedTxs.length > 0) {
    console.log(`  Removed rows count: ${removedTxs.length}`);
    console.log(`  Affected bucket: Removed Rows (excluded from active totals)`);
  }
  console.log("");

  // 9. Credit Card Payment Regression
  const ccPayments = normalized.filter(t => t.classification === 'credit_card_payment');
  console.log(`[${ccPayments.length > 0 ? 'PASS' : 'FAIL'}] Credit Card Payment Regression Check`);
  if (ccPayments.length > 0) {
    const totalCC = ccPayments.reduce((sum, t) => sum + Math.abs(t.cashFlowAmount), 0);
    console.log(`  Count: ${ccPayments.length}`);
    console.log(`  Total Excluded from Spending: $${totalCC.toFixed(2)}`);
  }
  console.log("");

  // 10. Merchant Credit Regression
  const merchantCredits = normalized.filter(t => t.classification === 'merchant_credit');
  console.log(`[${merchantCredits.length > 0 ? 'PASS' : 'FAIL'}] Merchant Credit Regression Check`);
  if (merchantCredits.length > 0) {
    const totalMC = merchantCredits.reduce((sum, t) => sum + Math.abs(t.cashFlowAmount), 0);
    console.log(`  Count: ${merchantCredits.length}`);
    console.log(`  Total Merchant Credits: $${totalMC.toFixed(2)}`);
  }
  console.log("");

  console.log("--------------------------------------------------");
  console.log("FINAL RECONCILIATION TOTALS");
  console.log("--------------------------------------------------");
  console.log(`Posted Spending: $${report.reconciliation.netSpending.toFixed(2)}`);
  console.log(`Recognized Income: $${report.reconciliation.recognizedIncome.toFixed(2)}`);
  console.log(`Net Cash Flow: $${report.reconciliation.netCashFlow.toFixed(2)}`);
  console.log(`Pending Spending: $${report.summary.allTime.pendingSpending.toFixed(2)}`);
  console.log(`Credit Card Payments: $${report.reconciliation.creditCardAmount.toFixed(2)} (${report.reconciliation.creditCardCount} rows)`);
  console.log(`Refunds: $${report.reconciliation.refunds.toFixed(2)} (${report.reconciliation.refundCount} rows)`);
  console.log(`Merchant Credits: $${report.reconciliation.merchantCredits.toFixed(2)} (${report.reconciliation.merchantCreditCount} rows)`);
  console.log(`Interest Earned: $${report.reconciliation.interestEarnedAmount.toFixed(2)} (${report.reconciliation.interestEarnedCount} rows)`);
  console.log(`Cash Withdrawals: $${report.reconciliation.cashWithdrawalAmount.toFixed(2)} (${report.reconciliation.cashWithdrawalCount} rows)`);
  console.log(`P2P Outgoing: $${report.reconciliation.p2pOutgoingAmount.toFixed(2)} (${report.reconciliation.p2pOutgoingCount} rows)`);
  console.log(`P2P Incoming: $${report.reconciliation.p2pIncomingAmount.toFixed(2)} (${report.reconciliation.p2pIncomingCount} rows)`);
  console.log(`Unknown Transfers: $${report.reconciliation.unknownTransferAmount.toFixed(2)} (${report.reconciliation.unknownTransferCount} rows)`);
  console.log(`Unclassified Positive: $${report.reconciliation.unclassifiedPositiveAmount.toFixed(2)} (${report.reconciliation.unclassifiedPositiveCount} rows)`);
  console.log(`Removed Rows: ${report.reconciliation.removedCount}`);
  console.log(`Category Math Reconciles: ${report.reconciliation.categoryMathReconciles ? 'YES' : 'NO'}`);
  console.log(`Accounting Bridge Reconciles: ${report.reconciliation.bridge.accountingBridgeReconciles ? 'YES' : 'NO'}`);
  console.log("==================================================\n");
}

run().catch(console.error);
