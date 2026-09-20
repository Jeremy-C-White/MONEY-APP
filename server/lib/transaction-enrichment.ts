import { createHash } from 'crypto';
import type { NormalizedTransaction } from './financial';
import { buildMerchantKeyForTransaction, normalizeMerchantKey } from './merchant-prefix';

export const CATEGORY_CONFIDENCE_LEVELS = ['VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const;
export type CategoryConfidence = typeof CATEGORY_CONFIDENCE_LEVELS[number];

export type MerchantLabelRule = {
  ruleId: string;
  merchantKey: string;
  label: string;
  createdFromTransactionId: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export type EnrichedTransaction = NormalizedTransaction & {
  categoryConfidence: CategoryConfidence | null;
  householdLabel: string | null;
  merchantKey: string | null;
  merchantLabelRuleId: string | null;
};

export class MerchantLabelRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'MerchantLabelRequestError';
  }
}

function normalizeConfidence(value: unknown): CategoryConfidence | null {
  const normalized = String(value || '').trim().toUpperCase();
  return CATEGORY_CONFIDENCE_LEVELS.includes(normalized as CategoryConfidence)
    ? normalized as CategoryConfidence
    : null;
}

export function merchantLabelRuleIdForKey(merchantKey: string): string {
  return createHash('sha256').update(normalizeMerchantKey(merchantKey)).digest('hex');
}

export function parseMerchantLabelRule(ruleId: string, value: unknown): MerchantLabelRule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const merchantKey = normalizeMerchantKey(record.merchantKey);
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  if (!merchantKey || !label || label.length > 40 || typeof record.createdFromTransactionId !== 'string') {
    return null;
  }
  return {
    ruleId,
    merchantKey,
    label,
    createdFromTransactionId: record.createdFromTransactionId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function normalizeMerchantLabel(rawLabel: unknown): string {
  const label = typeof rawLabel === 'string' ? rawLabel.trim().replace(/\s+/g, ' ') : '';
  if (!label) throw new MerchantLabelRequestError('Enter a household label.', 400);
  if (label.length > 40) throw new MerchantLabelRequestError('Household labels must be 40 characters or fewer.', 400);
  return label;
}

export function buildMerchantLabelRule(
  transaction: NormalizedTransaction,
  rawLabel: unknown,
  now: unknown
): MerchantLabelRule {
  const label = normalizeMerchantLabel(rawLabel);
  if (transaction.pending || transaction.removed) {
    throw new MerchantLabelRequestError('Only posted transactions can create a household label.', 400);
  }
  const merchantKey = buildMerchantKeyForTransaction(transaction);
  if (!merchantKey) {
    throw new MerchantLabelRequestError("This transaction doesn't have a stable merchant name to label.", 400);
  }
  return {
    ruleId: merchantLabelRuleIdForKey(merchantKey),
    merchantKey,
    label,
    createdFromTransactionId: transaction.transactionId,
    createdAt: now,
    updatedAt: now,
  };
}

export function enrichTransactions(
  transactions: NormalizedTransaction[],
  rawRows: unknown[][],
  merchantLabels: MerchantLabelRule[]
): EnrichedTransaction[] {
  const confidenceByTransaction = new Map<string, CategoryConfidence | null>();
  for (const row of rawRows) {
    const transactionId = String(row?.[0] || '');
    if (!transactionId || transactionId === 'Transaction ID') continue;
    confidenceByTransaction.set(transactionId, normalizeConfidence(row?.[18]));
  }
  const labelsByMerchant = new Map(merchantLabels.map(rule => [rule.merchantKey, rule]));

  return transactions.map(transaction => {
    const merchantKey = buildMerchantKeyForTransaction(transaction);
    const rule = merchantKey ? labelsByMerchant.get(merchantKey) : undefined;
    return {
      ...transaction,
      categoryConfidence: confidenceByTransaction.get(transaction.transactionId) ?? null,
      householdLabel: rule?.label || null,
      merchantKey,
      merchantLabelRuleId: rule?.ruleId || null,
    };
  });
}

export function filterTransactionEnrichment(
  transactions: EnrichedTransaction[],
  filters: { categoryConfidence?: unknown; unlabeled?: unknown; householdLabel?: unknown }
): EnrichedTransaction[] {
  let result = transactions;
  if (typeof filters.categoryConfidence === 'string' && filters.categoryConfidence.trim()) {
    const confidence = normalizeConfidence(filters.categoryConfidence);
    result = confidence ? result.filter(transaction => transaction.categoryConfidence === confidence) : [];
  }
  if (String(filters.unlabeled || '').toLowerCase() === 'true') {
    result = result.filter(transaction => !transaction.householdLabel);
  }
  if (typeof filters.householdLabel === 'string' && filters.householdLabel.trim()) {
    const label = filters.householdLabel.trim().toLowerCase();
    result = result.filter(transaction => transaction.householdLabel?.toLowerCase() === label);
  }
  return result;
}
