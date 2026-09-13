import { describe, expect, it } from 'vitest';
import { applyMerchantFamilies, getMerchantFamily } from './merchant-families';

describe('getMerchantFamily', () => {
  it.each([
    ['Walmart.com', 'Walmart'],
    ['WAL-MART #1847', 'Walmart'],
    ["Sam's Club 8123", "Sam's Club"],
    ['SAMSCLUB.COM', "Sam's Club"],
    ['TARGET DEBIT CRD ACH TRAN', 'Target'],
    ['CVS/PHARMACY #02134', 'CVS'],
  ])('groups %s under %s', (merchant, expected) => {
    expect(getMerchantFamily(merchant)).toBe(expected);
  });

  it('uses the raw description when the normalized merchant is missing', () => {
    expect(getMerchantFamily('', 'WALMART GROCERY 1234')).toBe('Walmart');
  });

  it('does not collapse unrelated merchant names', () => {
    expect(getMerchantFamily('Bullseye Market')).toBe('Bullseye Market');
  });
});

describe('applyMerchantFamilies', () => {
  it('changes only the reporting merchant label', () => {
    const transaction = {
      transactionId: 'tx-1',
      name: 'WAL-MART #1847',
      normalizedMerchant: 'Walmart Supercenter',
      spendingAdjustment: 42.19,
      normalizedCategory: 'GENERAL_MERCHANDISE',
    };

    expect(applyMerchantFamilies([transaction])).toEqual([{
      ...transaction,
      normalizedMerchant: 'Walmart',
    }]);
    expect(transaction.normalizedMerchant).toBe('Walmart Supercenter');
  });
});
