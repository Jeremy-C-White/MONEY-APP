import { describe, expect, it } from 'vitest';
import {
  buildMerchantKeyForTransaction,
  deriveContributionKey,
  deriveMerchantPrefix,
  extractContributionReferenceTokens,
  normalizeMerchantKey,
} from './merchant-prefix';

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

describe('deriveContributionKey', () => {
  it('groups ACH transfers that differ only by trace number and date', () => {
    const first = deriveContributionKey(
      '2400 FSAGGTR03 INVESTMENT 260706 000000002088697 JEREMY WHITE'
    );
    const second = deriveContributionKey(
      '2400 FSAGGTR03 INVESTMENT 260806 000000002102387 JEREMY WHITE'
    );

    expect(first).toBe('2400 fsaggtr03 investment');
    expect(second).toBe(first);
  });

  it('keeps the originator code that deriveMerchantPrefix discards', () => {
    const description = '2400 FSAGGTR03 INVESTMENT 260706 000000002088697 JEREMY WHITE';
    expect(deriveMerchantPrefix(description)).toBeNull();
    expect(deriveContributionKey(description)).toBe('2400 fsaggtr03 investment');
  });

  it('stops at a month name so a SoFi transfer does not carry its date', () => {
    const june = deriveContributionKey('SOFI SECURITIES ACH Jun 09 20260605726664 JEREMY WHITE');
    const july = deriveContributionKey('SOFI SECURITIES ACH Jul 23 20260723726664 JEREMY WHITE');

    expect(june).toBe('sofi securities ach');
    expect(july).toBe(june);
  });

  it('keeps two different originator codes apart', () => {
    expect(deriveContributionKey('2400 FSAGTR1213 INVESTMENT 241201 000000001234567 JEREMY WHITE'))
      .toBe('2400 fsagtr1213 investment');
    expect(deriveContributionKey('2400 FSAGGTR03 INVESTMENT 260706 000000002088697 JEREMY WHITE'))
      .not.toBe('2400 fsagtr1213 investment');
  });

  it('stops at an embedded long reference in a DES/ID description', () => {
    expect(deriveContributionKey('Uphold Inc DES:UPHOLD ID:1234567890 INDN:JEREMY WHITE'))
      .toBe('uphold inc des:uphold');
  });

  it('returns null when nothing stable precedes the reference noise', () => {
    expect(deriveContributionKey('000000002088697 JEREMY WHITE')).toBeNull();
    expect(deriveContributionKey('')).toBeNull();
    expect(deriveContributionKey('AB 20260605726664')).toBeNull();
  });
});

describe('extractContributionReferenceTokens', () => {
  it('returns the long reference tokens that follow the stable key', () => {
    expect(extractContributionReferenceTokens(
      '2400 FSAGGTR03 INVESTMENT 260706 000000002088697 JEREMY WHITE'
    )).toEqual(['000000002088697']);
  });

  it('excludes the bare ACH settlement date so a shared date is not read as a stream', () => {
    expect(extractContributionReferenceTokens(
      '2400 FSAGGTR03 INVESTMENT 260706 000000002102387 JEREMY WHITE'
    )).toEqual(['000000002102387']);
    expect(extractContributionReferenceTokens(
      'SOFI SECURITIES ACH Jun 09 20260605726664 JEREMY WHITE'
    )).toEqual(['20260605726664']);
  });

  it('returns nothing when the description carries no reference tokens', () => {
    expect(extractContributionReferenceTokens('Vanguard Buy')).toEqual([]);
  });
});
