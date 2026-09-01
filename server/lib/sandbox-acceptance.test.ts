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
