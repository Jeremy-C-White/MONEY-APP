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
  it('exact pending->posted ID matching requires Removed At', () => {
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

  it('present correct scenario returns PASS', () => {
    const rawWithdrawal = buildRawRow({ txId: 'w_1', cashFlowAmount: '-100', catDetailed: 'TRANSFER_OUT_WITHDRAWAL' });
    const report = generateAcceptanceReport([['Transaction ID'], rawWithdrawal]);
    expect(report.scenarios.cashWithdrawal.status).toBe('PASS');
  });

  it('present incorrect scenario returns FAIL', () => {
    // A withdrawal that we somehow incorrectly mapped to spending (mocked by overriding classification - well, classification is derived from row)
    // To simulate FAIL, we need a row that looks like withdrawal to the acceptance script but gets classified differently by financial.ts
    // Wait, financial.ts treats TRANSFER_OUT_WITHDRAWAL as cash_withdrawal.
    // If we make it an ATM purchase? 'ATM FEE' -> bank_fee. But our acceptance looks for 'atm' in name.
    const rawAtmFee = buildRawRow({ txId: 'w_1', name: 'ATM FEE', cashFlowAmount: '-5', catDetailed: 'BANK_FEES_ATM_FEE' });
    // financial.ts classifies BANK_FEES as bank_fee (countsTowardSpending).
    // The acceptance logic isCashWithdrawal matches 'atm'.
    // So it will see it as a candidate for cash withdrawal but its classification is bank_fee. Thus FAIL.
    const report = generateAcceptanceReport([['Transaction ID'], rawAtmFee]);
    expect(report.scenarios.cashWithdrawal.status).toBe('FAIL');
  });
});
