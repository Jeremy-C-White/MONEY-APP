import { describe, expect, it } from 'vitest';
import { buildMerchantKeyForTransaction, deriveMerchantPrefix, normalizeMerchantKey } from './merchant-prefix';

describe('deriveMerchantPrefix', () => {
  it('truncates a Plaid ACH description at the first reference-number token', () => {
    const description = 'TARGET DEBIT CRD ACH TRAN 250601 000018701232302 3S5540 TARGET 1870 SIMPSONVILLE S';
    expect(deriveMerchantPrefix(description)).toBe('target debit crd ach tran');
  });

  it('derives the same key for two transactions that differ only by reference number', () => {
    const first = 'TARGET DEBIT CRD ACH TRAN 250601 000018701232302 3S5540 TARGET 1870 SIMPSONVILLE S';
    const second = 'TARGET DEBIT CRD ACH TRAN 250815 000029813309213 7K1122 TARGET 1870 SIMPSONVILLE S';
    expect(deriveMerchantPrefix(first)).toBe(deriveMerchantPrefix(second));
    expect(deriveMerchantPrefix(first)).toBe('target debit crd ach tran');
  });

  it('truncates at a slash-delimited date token', () => {
    expect(deriveMerchantPrefix('ACME HARDWARE STORE 06/01 PURCHASE')).toBe('acme hardware store');
  });

  it('rejects a derivation shorter than the minimum length or token count', () => {
    expect(deriveMerchantPrefix('SQ *A1 208402')).toBeNull();
    expect(deriveMerchantPrefix('AMZN 4728901234')).toBeNull();
    expect(deriveMerchantPrefix('')).toBeNull();
  });

  it('derives a stable key for a non-numeric ACH description with an embedded owner name', () => {
    const description = 'One Finance, Inc ACH Trans Jeremy White';
    const derived = deriveMerchantPrefix(description);
    expect(derived).toBe('one finance, inc ach trans jeremy white');
    expect(deriveMerchantPrefix(description)).toBe(derived);
  });
});

describe('buildMerchantKeyForTransaction', () => {
  it('uses a clean Plaid merchant name unchanged, without deriving a prefix', () => {
    expect(buildMerchantKeyForTransaction({
      name: 'WALMART DEBIT CRD ACH TRAN 250601 3S5540',
      normalizedMerchant: 'Walmart',
    })).toBe(normalizeMerchantKey('Walmart'));
  });

  it('falls back to the derived prefix when there is no Plaid merchant name', () => {
    expect(buildMerchantKeyForTransaction({
      name: 'TARGET DEBIT CRD ACH TRAN 250601 000018701232302 3S5540 TARGET 1870 SIMPSONVILLE S',
      normalizedMerchant: '',
    })).toBe('target debit crd ach tran');
  });

  it('derives a prefix when normalization has copied the raw description into the merchant field', () => {
    const description = 'TARGET DEBIT CRD ACH TRAN 250601 000018701232302 3S5540 TARGET 1870 SIMPSONVILLE S';
    expect(buildMerchantKeyForTransaction({
      name: description,
      normalizedMerchant: description,
    })).toBe('target debit crd ach tran');
  });

  it('keeps a clean raw description when it is also the normalized merchant', () => {
    expect(buildMerchantKeyForTransaction({ name: 'Walmart', normalizedMerchant: 'Walmart' })).toBe('walmart');
  });

  it('returns null when neither a merchant name nor a stable derivation exists', () => {
    expect(buildMerchantKeyForTransaction({ name: 'SQ *A1 208402', normalizedMerchant: '' })).toBeNull();
  });
});
