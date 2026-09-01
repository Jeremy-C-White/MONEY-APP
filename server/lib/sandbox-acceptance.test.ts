import { describe, it, expect } from 'vitest';
import { generateAcceptanceReport } from './sandbox-acceptance';

function buildRawRow(overrides: Record<string, string>): any[] {
  const row = new Array(24).fill('');
  row[0] = overrides.txId || 'test_tx';
  row[1] = 'acc_1';
  row[6] = overrides.accountType || 'depository';
  row[7] = overrides.accountSubtype || 'checking';
  row[8] = '45000'; // Date
  row[10] = overrides.name || 'Test Merchant';
  row[11] = overrides.merchantName || overrides.name || 'Test Merchant';
  row[13] = overrides.plaidAmount || '0';
  row[14] = overrides.cashFlowAmount || '-50';
  row[16] = overrides.catPrimary || 'FOOD_AND_DRINK';
  row[17] = overrides.catDetailed || 'FOOD_AND_DRINK_RESTAURANT';
  row[20] = overrides.pending || 'FALSE';
  row[21] = overrides.pendingTransactionId || '';
  row[22] = overrides.status || 'posted';
  row[23] = overrides.removedAt || '';
  return row;
}

describe('Sandbox Acceptance Logic', () => {
  it('exact pending->posted ID matching requires Removed At and proper status/pending flags', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'TRUE', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'FALSE', cashFlowAmount: '-50', pendingTransactionId: 'old_1' });
    
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('PASS');
    expect(report.scenarios.pendingToPosted.oldId).toBe('old_1');
    expect(report.scenarios.pendingToPosted.newId).toBe('new_1');
  });

  it('unrelated removed + unrelated posted row does NOT pass', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'TRUE', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_2', pending: 'FALSE', cashFlowAmount: '-50', pendingTransactionId: 'old_2' });
    
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('NOT EXERCISED');
  });

  it('missing Removed At causes FAIL for pendingToPosted', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'TRUE', cashFlowAmount: '-50', status: 'removed', removedAt: '' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'FALSE', cashFlowAmount: '-50', pendingTransactionId: 'old_1' });
    
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('FAIL');
  });

  it('missing scenario returns NOT EXERCISED', () => {
    const report = generateAcceptanceReport([['Transaction ID']]);
    expect(report.scenarios.cashWithdrawal.status).toBe('NOT EXERCISED');
    expect(report.scenarios.payrollIncome.status).toBe('NOT EXERCISED');
  });

  it('explicit cash withdrawal returns PASS', () => {
    const rawWithdrawal = buildRawRow({ txId: 'w_1', cashFlowAmount: '-100', catPrimary: 'TRANSFER_OUT', catDetailed: 'TRANSFER_OUT_WITHDRAWAL' });
    const report = generateAcceptanceReport([['Transaction ID'], rawWithdrawal]);
    expect(report.scenarios.cashWithdrawal.status).toBe('PASS');
  });

  it('ATM fee does NOT exercise cash-withdrawal scenario', () => {
    const rawAtmFee = buildRawRow({ txId: 'w_1', name: 'ATM FEE', cashFlowAmount: '-5', catDetailed: 'BANK_FEES_ATM_FEE' });
    const report = generateAcceptanceReport([['Transaction ID'], rawAtmFee]);
    expect(report.scenarios.cashWithdrawal.status).toBe('NOT EXERCISED');
  });

  it('actual other positive returns PASS for ambiguous positive', () => {
    const rawOtherPos = buildRawRow({ txId: 'op_1', cashFlowAmount: '50', catDetailed: 'OTHER_MISCELLANEOUS' });
    const report = generateAcceptanceReport([['Transaction ID'], rawOtherPos]);
    expect(report.scenarios.ambiguousPositive.status).toBe('PASS');
  });

  it('ambiguous merchant_credit does NOT exercise ambiguous-positive scenario', () => {
    const rawSpend = buildRawRow({ txId: 'mc_0', cashFlowAmount: '-50', catDetailed: 'OTHER_MISCELLANEOUS', name: 'AMAZON CREDIT' });
    const rawCredit = buildRawRow({ txId: 'mc_1', cashFlowAmount: '50', catDetailed: 'OTHER_MISCELLANEOUS', name: 'AMAZON CREDIT' });
    const report = generateAcceptanceReport([['Transaction ID'], rawSpend, rawCredit]);
    expect(report.scenarios.ambiguousPositive.status).toBe('NOT EXERCISED');
  });

  it('interest_earned does NOT exercise ambiguous-positive scenario', () => {
    const rawInterest = buildRawRow({ txId: 'ie_1', cashFlowAmount: '5', catDetailed: 'INCOME_INTEREST_EARNED', name: 'INTEREST' });
    const report = generateAcceptanceReport([['Transaction ID'], rawInterest]);
    expect(report.scenarios.ambiguousPositive.status).toBe('NOT EXERCISED');
  });

  it('pending superseded row does NOT automatically satisfy independent Removed/Reversed scenario', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'TRUE', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'FALSE', cashFlowAmount: '-50', pendingTransactionId: 'old_1' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    
    expect(report.scenarios.removedReversed.status).toBe('NOT EXERCISED');
    expect(report.scenarios.pendingToPosted.status).toBe('PASS');
  });

  it('independent removed row satisfies Removed/Reversed scenario', () => {
    const rawRemoved = buildRawRow({ txId: 'rm_1', pending: 'FALSE', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const report = generateAcceptanceReport([['Transaction ID'], rawRemoved]);
    
    expect(report.scenarios.removedReversed.status).toBe('PASS');
    expect(report.scenarios.removedReversed.count).toBe(1);
  });
});


describe('Sandbox Acceptance - Pending Parser', () => {
  it('recognizes Yes and No', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'Yes', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'No', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'active' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('PASS');
  });

  it('recognizes TRUE and FALSE', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'TRUE', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'FALSE', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'active' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('PASS');
  });

  it('recognizes true and false', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'true', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'false', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'active' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('PASS');
  });

  it('recognizes case-insensitive yes and no', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'yes', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'no', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'active' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('PASS');
  });

  it('fails if Old Pending = No', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'No', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'No', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'active' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('FAIL');
  });

  it('fails if New Pending = Yes', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'Yes', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'Yes', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'active' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('NOT EXERCISED'); // filtered out early
  });

  it('fails if Old Status = active', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'Yes', cashFlowAmount: '-50', status: 'active', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'No', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'active' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('FAIL');
  });

  it('fails if Missing Removed At', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'Yes', cashFlowAmount: '-50', status: 'removed', removedAt: '' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'No', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'active' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('FAIL');
  });

  it('fails if Wrong Pending Transaction ID', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'Yes', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'No', cashFlowAmount: '-50', pendingTransactionId: 'wrong_id', status: 'active' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('NOT EXERCISED'); // because postedWithPendingId won't find old_1
  });

  it('fails if New Status = removed', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'Yes', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'No', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'removed' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.pendingToPosted.status).toBe('NOT EXERCISED'); // filtered out early
  });
});

describe('Sandbox Acceptance - Removed Supersessions', () => {
  it('excludes superseded pending removals from independent removedReversed', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'Yes', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'No', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'active' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted]);
    expect(report.scenarios.removedReversed.status).toBe('NOT EXERCISED');
  });

  it('an actually independent removed transaction can still cause removedReversed = PASS', () => {
    const rawPending = buildRawRow({ txId: 'old_1', pending: 'Yes', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-15' });
    const rawPosted = buildRawRow({ txId: 'new_1', pending: 'No', cashFlowAmount: '-50', pendingTransactionId: 'old_1', status: 'active' });
    const indRemoved = buildRawRow({ txId: 'ind_1', pending: 'No', cashFlowAmount: '-50', status: 'removed', removedAt: '2026-08-16' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPending, rawPosted, indRemoved]);
    expect(report.scenarios.removedReversed.status).toBe('PASS');
    expect(report.scenarios.removedReversed.count).toBe(1);
  });
});

describe('Sandbox Acceptance - Posted Acceptance Buckets', () => {
  it('excludes pending credit-card-payment transactions from the Acceptance Credit Card Payment posted count', () => {
    const rawPosted = buildRawRow({ txId: 'new_1', name: 'AUTOMATIC PAYMENT - THANK', cashFlowAmount: '-500', accountType: 'credit', pending: 'No' });
    const rawPendingCC = buildRawRow({ txId: 'pend_1', name: 'AUTOMATIC PAYMENT - THANK', cashFlowAmount: '-50', accountType: 'credit', pending: 'Yes' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPosted, rawPendingCC]);
    expect(report.scenarios.creditCardPayment.count).toBe(1);
    expect(report.scenarios.creditCardPayment.amount).toBe(500);
  });

  it('Credit Card Payment Acceptance matches reconciliation', () => {
    const rawPosted = buildRawRow({ txId: 'new_1', name: 'AUTOMATIC PAYMENT - THANK', cashFlowAmount: '-500', accountType: 'credit', pending: 'No' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPosted]);
    expect(report.scenarios.creditCardPayment.count).toBe(report.reconciliation.creditCardCount);
    expect(report.scenarios.creditCardPayment.amount).toBe(report.reconciliation.creditCardAmount);
  });

  it('Merchant Credit Acceptance count/amount equal the authoritative posted reconciliation values', () => {
    const rawPurchase = buildRawRow({ txId: 'p1', name: 'United Airlines', catPrimary: 'TRAVEL', cashFlowAmount: '-500', pending: 'No' });
    const rawCredit = buildRawRow({ txId: 'c1', name: 'United Airlines', catPrimary: 'TRAVEL', cashFlowAmount: '500', pending: 'No' });
    const report = generateAcceptanceReport([['Transaction ID'], rawPurchase, rawCredit]);
    expect(report.scenarios.merchantCredit.count).toBe(report.reconciliation.merchantCreditsCount);
    expect(report.scenarios.merchantCredit.amount).toBe(report.reconciliation.merchantCreditsAmount);
  });
});
