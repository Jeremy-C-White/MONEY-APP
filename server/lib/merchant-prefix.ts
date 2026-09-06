const MIN_PREFIX_LENGTH = 6;
const MIN_PREFIX_TOKENS = 2;

const DATE_LIKE_TOKEN = /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/;
const DIGIT_RUN = /\d{4,}/;

// Transaction-specific noise: a long digit run, a date, or a reference code
// mixing letters and digits. Anything before the first such token is what
// repeats across transactions from the same merchant.
function isNoiseToken(token: string): boolean {
  const stripped = token.replace(/[^a-zA-Z0-9/-]/g, '');
  if (!stripped) return false;
  if (DATE_LIKE_TOKEN.test(stripped)) return true;
  if (DIGIT_RUN.test(stripped)) return true;
  return /[a-zA-Z]/.test(stripped) && /[0-9]/.test(stripped);
}

export function normalizeMerchantKey(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function deriveMerchantPrefix(rawName: unknown): string | null {
  const tokens = String(rawName || '').trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const token of tokens) {
    if (isNoiseToken(token)) break;
    kept.push(token);
  }

  const trimmed = kept.join(' ').replace(/[\s,;:\-*#/.]+$/, '');
  const normalized = normalizeMerchantKey(trimmed);
  const tokenCount = normalized ? normalized.split(' ').length : 0;
  if (normalized.length < MIN_PREFIX_LENGTH || tokenCount < MIN_PREFIX_TOKENS) {
    return null;
  }
  return normalized;
}

export function buildMerchantKeyForTransaction(transaction: {
  name: string;
  normalizedMerchant: string;
}): string | null {
  const merchantKey = normalizeMerchantKey(transaction.normalizedMerchant);
  const rawNameKey = normalizeMerchantKey(transaction.name);

  // Normalized transactions fall back to the raw description when Plaid did
  // not supply a merchant name. In that case, try to remove the changing
  // reference tokens instead of treating the full description as stable.
  if (merchantKey && merchantKey !== rawNameKey) {
    return merchantKey;
  }

  const derivedPrefix = deriveMerchantPrefix(transaction.name);
  if (derivedPrefix) return derivedPrefix;

  // A clean raw description can legitimately be the merchant name. Reject it
  // only when it contains reference-like noise and no stable prefix survived.
  const hasNoise = String(transaction.name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .some(isNoiseToken);
  return merchantKey && !hasNoise ? merchantKey : null;
}

// --- Contribution grouping -------------------------------------------------
//
// ACH descriptions from savings and investment originators are shaped
// differently from retail merchant descriptions, and `deriveMerchantPrefix`
// reads them wrongly:
//
//   "2400 FSAGGTR03 INVESTMENT 260706 000000002088697 JEREMY WHITE" -> null
//   "SOFI SECURITIES ACH Jun 09 20260605726664 JEREMY WHITE"
//                                        -> "sofi securities ach jun 09"
//
// The originator code (FSAGGTR03) is the identity here, but it mixes letters
// and digits, which `isNoiseToken` treats as a reference code. And the ACH
// date lands before the trace number, so it survives into the prefix and
// changes every transaction.
//
// These rules are deliberately kept separate rather than folded into
// `deriveMerchantPrefix`: stored classification rules are keyed by that
// function's output, so changing it would silently orphan them.

const MONTH_NAME = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/i;
// Trace numbers, reference numbers and YYMMDD/YYYYMMDD dates all run to six
// digits or more. Originator codes carry shorter digit suffixes (FSAGGTR03,
// FSAGTR1213), so this separates identity from reference.
const LONG_DIGIT_RUN = /\d{6,}/;

function isVaryingContributionToken(token: string): boolean {
  const stripped = token.replace(/[^a-zA-Z0-9/-]/g, '');
  if (!stripped) return false;
  if (LONG_DIGIT_RUN.test(stripped)) return true;
  if (DATE_LIKE_TOKEN.test(stripped)) return true;
  return MONTH_NAME.test(stripped);
}

/**
 * The stable identity of a recurring ACH contribution, or null when nothing
 * stable survives. Everything before the first per-transaction token is kept,
 * so two transfers to the same destination collapse to one key regardless of
 * their trace numbers and dates.
 */
export function deriveContributionKey(rawName: unknown): string | null {
  const tokens = String(rawName || '').trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const token of tokens) {
    if (isVaryingContributionToken(token)) break;
    kept.push(token);
  }

  const trimmed = kept.join(' ').replace(/[\s,;:\-*#/.]+$/, '');
  const normalized = normalizeMerchantKey(trimmed);
  return normalized.length >= MIN_PREFIX_LENGTH ? normalized : null;
}

/**
 * ACH descriptions carry the settlement date as a bare YYMMDD or YYYYMMDD run.
 * That is not a stream identifier, and two transfers settling on the same day
 * would otherwise make it look like one.
 */
function isCompactDateDigits(digits: string): boolean {
  if (digits.length !== 6 && digits.length !== 8) return false;
  const month = Number(digits.slice(-4, -2));
  const day = Number(digits.slice(-2));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * The per-transaction tokens that follow the stable key. A token repeated
 * across several transactions in a group is a stream identifier (an ACH trace
 * number); one that appears once is just a reference.
 */
export function extractContributionReferenceTokens(rawName: unknown): string[] {
  const tokens = String(rawName || '').trim().split(/\s+/).filter(Boolean);
  const startIndex = tokens.findIndex(isVaryingContributionToken);
  if (startIndex === -1) return [];

  return tokens.slice(startIndex).flatMap(token => {
    const stripped = token.replace(/[^a-zA-Z0-9]/g, '');
    if (!LONG_DIGIT_RUN.test(stripped) || DATE_LIKE_TOKEN.test(stripped)) return [];
    const digits = stripped.replace(/\D/g, '');
    return isCompactDateDigits(digits) ? [] : [stripped.toLowerCase()];
  });
}
