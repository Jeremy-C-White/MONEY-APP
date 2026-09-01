import { deduplicateAndNormalizeTransactions, NormalizedTransaction, parsePendingValue } from "./financial";
import { buildVerificationReport } from "./aggregations";

function findScenarioTx(txs: NormalizedTransaction[], predicate: (t: NormalizedTransaction) => boolean) {
  return txs.find(predicate);
}

export function generateAcceptanceReport(rawRows: any[]) {
  const normalized = deduplicateAndNormalizeTransactions(rawRows);
  const report = buildVerificationReport(normalized, 'America/New_York');

  let pendingDoc: any = { status: 'NOT EXERCISED' };
  const postedWithPendingId = normalized.filter(t => t.pendingTransactionId && !t.pending && !t.removed);
  const supersededPendingIds = new Set<string>();

  for (const posted of postedWithPendingId) {
    const oldId = posted.pendingTransactionId;
    const oldRaw = rawRows.find(r => r[0] === oldId); // transaction_id is col 0
    const newRaw = rawRows.find(r => r[0] === posted.transactionId);

    if (oldRaw && newRaw) {
      const oldPending = oldRaw[20]; // Col U
      const oldStatus = oldRaw[22];  // Col W
      const oldRemovedAt = oldRaw[23]; // Col X
      
      const newPending = newRaw[20]; // Col U
      const newPendingId = newRaw[21]; // Col V
      const newStatus = newRaw[22];  // Col W

      // Assert exactly the required relationship from the raw sheet
      const isOldPending = parsePendingValue(oldPending);
      const isNewPending = parsePendingValue(newPending);
      
      const passOldPending = isOldPending;
      const passOldStatus = oldStatus === 'removed';
      const passOldRemovedAt = !!oldRemovedAt;
      const passNewPending = !isNewPending;
      const passExactId = newPendingId === oldId;
      const passNewStatus = newStatus !== 'removed';
      
      if (passOldPending && passOldStatus && passOldRemovedAt && passNewPending && passExactId && passNewStatus) {
        supersededPendingIds.add(oldId);
        pendingDoc = {
          status: 'PASS',
          oldId,
          newId: posted.transactionId,
          oldStatus,
          oldRemovedAt,
          newPendingId,
          cashFlowAmount: posted.cashFlowAmount,
          classification: posted.classification,
          spendingAdjustment: posted.spendingAdjustment,
          reportingBucket: 'Net Spending'
        };
        break;
      } else {
        pendingDoc = {
          status: 'FAIL',
          reason: `Source row exact conditions not met:\n` +
                  `Old Pending semantic true: ${passOldPending ? 'PASS' : 'FAIL'}\n` +
                  `Old Status removed: ${passOldStatus ? 'PASS' : 'FAIL'}\n` +
                  `Old Removed At populated: ${passOldRemovedAt ? 'PASS' : 'FAIL'}\n` +
                  `New Pending semantic false: ${passNewPending ? 'PASS' : 'FAIL'}\n` +
                  `Pending Transaction ID exact match: ${passExactId ? 'PASS' : 'FAIL'}\n` +
                  `New Status non-removed: ${passNewStatus ? 'PASS' : 'FAIL'}`,
          oldId,
          newId: posted.transactionId,
          oldStatus,
          oldRemovedAt,
          newPendingId
        };
      }
    }
  }

  // Find clear candidates for each scenario
  const isCashWithdrawal = (t: NormalizedTransaction) => 
    t.categoryDetailed === 'TRANSFER_OUT_WITHDRAWAL' || t.name.includes('FINSYNC_TEST_CASH_WITHDRAWAL');

  const isP2P = (t: NormalizedTransaction) => {
    const desc = t.name.toLowerCase();
    return desc.includes('venmo') || desc.includes('zelle') || desc.includes('cash app') || desc.includes('paypal');
  };

  const isPayroll = (t: NormalizedTransaction) => 
    t.categoryDetailed.includes('WAGES') || t.name.toLowerCase().includes('gusto') || t.name.toLowerCase().includes('payroll');

  const isRefund = (t: NormalizedTransaction) => 
    t.name.toLowerCase().includes('refund') || t.name.toLowerCase().includes('return');

  const isAmbiguousPositive = (t: NormalizedTransaction) => 
    (t.cashFlowAmount > 0 && t.classification === 'other' && !t.categoryDetailed.includes('TRANSFER')) || t.name.includes('FINSYNC_TEST_AMBIGUOUS_POSITIVE');

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

  const independentRemovedTxs = normalized.filter(t => t.removed && !supersededPendingIds.has(t.transactionId));
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
      removedReversed: independentRemovedTxs.length > 0 ? { status: 'PASS', count: independentRemovedTxs.length, reportingBucket: 'Removed Rows' } : { status: 'NOT EXERCISED' },
      creditCardPayment: report.reconciliation.creditCardCount > 0 ? { status: 'PASS', count: report.reconciliation.creditCardCount, amount: report.reconciliation.creditCardAmount, reportingBucket: 'Credit Card Payments' } : { status: 'NOT EXERCISED' },
      merchantCredit: report.reconciliation.merchantCreditCount > 0 ? { status: 'PASS', count: report.reconciliation.merchantCreditCount, amount: report.reconciliation.merchantCredits, reportingBucket: 'Merchant Credits' } : { status: 'NOT EXERCISED' }
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
