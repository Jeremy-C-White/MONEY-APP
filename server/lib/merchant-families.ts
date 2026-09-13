type MerchantTransaction = {
  name: string;
  normalizedMerchant: string;
};

const MAJOR_RETAILER_FAMILIES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Walmart', pattern: /^wal[\s-]*mart(?:\b|\.)/i },
  { label: "Sam's Club", pattern: /^sam(?:'|’)?s(?:\s+club|club)?(?:\b|\.)/i },
  { label: 'Target', pattern: /^target(?:\b|\.)/i },
  { label: 'CVS', pattern: /^cvs(?:\b|\/)/i },
];

function cleanMerchantName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

/**
 * Collapses only unambiguous name variants for large mixed-basket retailers.
 * This changes the reporting label, never the transaction category or amount.
 */
export function getMerchantFamily(merchant: unknown, fallbackName?: unknown): string {
  const merchantName = cleanMerchantName(merchant);
  const fallback = cleanMerchantName(fallbackName);

  for (const candidate of [merchantName, fallback]) {
    if (!candidate) continue;
    const family = MAJOR_RETAILER_FAMILIES.find(entry => entry.pattern.test(candidate));
    if (family) return family.label;
  }

  return merchantName || fallback || 'Unknown';
}

export function applyMerchantFamilies<T extends MerchantTransaction>(transactions: readonly T[]): T[] {
  return transactions.map(transaction => {
    const normalizedMerchant = getMerchantFamily(transaction.normalizedMerchant, transaction.name);
    return normalizedMerchant === transaction.normalizedMerchant
      ? transaction
      : { ...transaction, normalizedMerchant };
  });
}
