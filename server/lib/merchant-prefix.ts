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
