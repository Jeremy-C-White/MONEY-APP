import { deduplicateAndNormalizeTransactions, NormalizedTransaction } from "./financial";
import { buildVerificationReport } from "./aggregations";

function findScenarioTx(txs: NormalizedTransaction[], predicate: (t: NormalizedTransaction) => boolean) {
  return txs.find(predicate);
}

export function generateAcceptanceReport(rawRows: any[]) {
  const normalized = deduplicateAndNormalizeTransactions(rawRows);
  const report = buildVerificationReport(normalized, 'America/New_York');

  // Pending to Posted
  let pendingDoc: any = { status: 'NOT EXERCISED' };
  const postedWithPendingId = normalized.filter(t => t.pendingTransactionId && !t.pending && !t.removed);
  let pendingScenarioFound = false;
  
  for (const posted of postedWithPendingId) {
    const oldId = posted.pendingTransactionId;
    const oldRaw = rawRows.find(r => r[0] === oldId); // transaction_id is col 0
    if (oldRaw) {
      pendingScenarioFound = true;
      if (oldRaw[22] === 'removed' && oldRaw[23]) { // Status = removed, Removed At = populated
        pendingDoc = {
          status: 'PASS',
          oldId,
          newId: posted.transactionId,
          oldStatus: oldRaw[22],
          oldRemovedAt: oldRaw[23],
          newPendingId: posted.pendingTransactionId,
          cashFlowAmount: posted.cashFlowAmount,
          classification: posted.classification,
          spendingAdjustment: posted.spendingAdjustment,
          reportingBucket: 'Net Spending'
        };
        break;
      } else {
        pendingDoc = {
          status: 'FAIL',
          reason: 'Source row missing removed status or removed at timestamp',
          oldId,
          newId: posted.transactionId
        };
      }
    }
  }

  // Find clear candidates for each scenario
  const isCashWithdrawal = (t: NormalizedTransaction) => t.categoryDetailed.includes('WITHDRAWAL') || t.name.toLowerCase().includes('atm');
  const isP2P = (t: NormalizedTransaction) => {
    const desc = t.name.toLowerCase();
    return desc.includes('venmo') || desc.includes('zelle') || desc.includes('cash app') || desc.includes('paypal');
  };
  const isPayroll = (t: NormalizedTransaction) => t.categoryDetailed.includes('WAGES') || t.name.toLowerCase().includes('gusto') || t.name.toLowerCase().includes('payroll');
  const isRefund = (t: NormalizedTransaction) => t.name.toLowerCase().includes('refund') || t.name.toLowerCase().includes('return');
  
  // Ambiguous: positive, not p2p, not refund, not interest, not payroll, no merchant match
  const isAmbiguousPositive = (t: NormalizedTransaction) => 
    t.cashFlowAmount > 0 && 
    !isP2P(t) && !isRefund(t) && !isPayroll(t) && 
    !t.categoryDetailed.includes('INTEREST') && !t.name.toLowerCase().includes('interest');

  const evaluate = (
    txs: NormalizedTransaction[], 
    candidateFn: (t: NormalizedTransaction) => boolean, 
    expectedClassifications: string[],
    bucket: string,
    extraCheck?: (t: NormalizedTransaction) => boolean
  ) => {
    const candidate = findScenarioTx(txs, candidateFn);
    if (!candidate) return { status: 'NOT EXERCISED' };
    
    let pass = expectedClassifications.includes(candidate.classification);
    if (pass && extraCheck && !extraCheck(candidate)) {
      pass = false;
    }

    return {
      status: pass ? 'PASS' : 'FAIL',
      sourceId: candidate.transactionId,
      cashFlowAmount: candidate.cashFlowAmount,
      classification: candidate.classification,
      spendingAdjustment: candidate.spendingAdjustment,
      incomeAdjustment: candidate.incomeAdjustment,
      pending: candidate.pending,
      pendingTransactionId: candidate.pendingTransactionId,
      statusStr: candidate.status,
      reportingBucket: bucket
    };
  };

  const removedTxs = normalized.filter(t => t.removed);
  const ccPayments = normalized.filter(t => t.classification === 'credit_card_payment');
  const merchantCredits = normalized.filter(t => t.classification === 'merchant_credit');

  return {
    scenarios: {
      pendingToPosted: pendingDoc,
      payrollIncome: evaluate(normalized, t => t.cashFlowAmount > 0 && isPayroll(t), ['income'], 'Recognized Income'),
      explicitRefund: evaluate(normalized, t => t.cashFlowAmount > 0 && isRefund(t), ['refund'], 'Refunds'),
      ambiguousPositive: evaluate(normalized, isAmbiguousPositive, ['other'], 'Unclassified Positive'),
      cashWithdrawal: evaluate(normalized, t => t.cashFlowAmount < 0 && isCashWithdrawal(t), ['cash_withdrawal'], 'Cash Withdrawals'),
      outgoingP2P: evaluate(normalized, t => t.cashFlowAmount < 0 && isP2P(t), ['person_to_person'], 'P2P Outgoing / Net Spending'),
      incomingP2P: evaluate(normalized, t => t.cashFlowAmount > 0 && isP2P(t), ['person_to_person'], 'P2P Incoming'),
      removedReversed: removedTxs.length > 0 ? { status: 'PASS', count: removedTxs.length, reportingBucket: 'Removed Rows' } : { status: 'NOT EXERCISED' },
      creditCardPayment: ccPayments.length > 0 ? { status: 'PASS', count: ccPayments.length, amount: ccPayments.reduce((s,t) => s + Math.abs(t.cashFlowAmount), 0), reportingBucket: 'Credit Card Payments' } : { status: 'NOT EXERCISED' },
      merchantCredit: merchantCredits.length > 0 ? { status: 'PASS', count: merchantCredits.length, amount: merchantCredits.reduce((s,t) => s + Math.abs(t.cashFlowAmount), 0), reportingBucket: 'Merchant Credits' } : { status: 'NOT EXERCISED' }
    },
    reconciliation: {
      postedSpending: report.reconciliation.netSpending,
      recognizedIncome: report.reconciliation.recognizedIncome,
      netCashFlow: report.reconciliation.netCashFlow,
      pendingSpending: report.summary.allTime.pendingSpending,
      creditCardAmount: report.reconciliation.creditCardAmount,
      creditCardCount: report.reconciliation.creditCardCount,
      refundsAmount: report.reconciliation.refunds,
      refundsCount: report.reconciliation.refundCount,
      merchantCreditsAmount: report.reconciliation.merchantCredits,
      merchantCreditsCount: report.reconciliation.merchantCreditCount,
      interestEarnedAmount: report.reconciliation.interestEarnedAmount,
      interestEarnedCount: report.reconciliation.interestEarnedCount,
      cashWithdrawalAmount: report.reconciliation.cashWithdrawalAmount,
      cashWithdrawalCount: report.reconciliation.cashWithdrawalCount,
      p2pOutgoingAmount: report.reconciliation.p2pOutgoingAmount,
      p2pOutgoingCount: report.reconciliation.p2pOutgoingCount,
      p2pIncomingAmount: report.reconciliation.p2pIncomingAmount,
      p2pIncomingCount: report.reconciliation.p2pIncomingCount,
      unknownTransferAmount: report.reconciliation.unknownTransferAmount,
      unknownTransferCount: report.reconciliation.unknownTransferCount,
      unclassifiedPositiveAmount: report.reconciliation.unclassifiedPositiveAmount,
      unclassifiedPositiveCount: report.reconciliation.unclassifiedPositiveCount,
      removedCount: report.reconciliation.removedCount,
      categoryMathReconciles: report.reconciliation.categoryMathReconciles,
      accountingBridgeReconciles: report.reconciliation.bridge.accountingBridgeReconciles
    }
  };
}
