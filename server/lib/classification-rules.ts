import { createHash } from 'crypto';
import {
  isClassification,
  type ClassificationSuggestion,
  type NormalizedTransaction,
  type TransactionOverride,
} from './financial';
import { buildMerchantKeyForTransaction, normalizeMerchantKey } from './merchant-prefix';

type UnknownRecord = Record<string, unknown>;

export type RuleDirection = 'inflow' | 'outflow';
export type SuggestedClassification = 'income' | 'spending' | 'refund' | 'internal_transfer';

export type StoredClassificationRule = {
  ruleId: string;
  merchantKey: string;
  category: string | null;
  direction: RuleDirection;
  classification: SuggestedClassification;
  offsetCategory: string | null;
  createdFromTransactionId: string;
  createdAt: unknown;
  timesApplied: number;
};

export class ClassificationRuleRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ClassificationRuleRequestError';
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSuggestedClassification(value: unknown): value is SuggestedClassification {
  return isClassification(value) && (
    value === 'income' ||
    value === 'spending' ||
    value === 'refund' ||
    value === 'internal_transfer'
  );
}

export function getRuleDirection(cashFlowAmount: number): RuleDirection {
  return cashFlowAmount >= 0 ? 'inflow' : 'outflow';
}

export function isProvisionalDisputeCredit(transaction: NormalizedTransaction): boolean {
  const description = `${transaction.name} ${transaction.normalizedMerchant}`.toLowerCase();
  return description.includes('conditional credit for dispute');
}

function isSuggestionCandidate(transaction: NormalizedTransaction): boolean {
  return !transaction.pending &&
    !transaction.removed &&
    !transaction.isOverridden &&
    (transaction.classification === 'other' || transaction.classification === 'unclassified_deposit') &&
    !isProvisionalDisputeCredit(transaction);
}

export function buildClassificationRule(
  transaction: NormalizedTransaction,
  override: TransactionOverride,
  createdAt: unknown
): StoredClassificationRule {
  if (!isSuggestionCandidate(transaction)) {
    throw new ClassificationRuleRequestError(
      'Only posted transactions that need review can create a remembered suggestion.',
      400
    );
  }
  if (!isSuggestedClassification(override.classification)) {
    throw new ClassificationRuleRequestError('This classification cannot be remembered.', 400);
  }

  const merchantKey = buildMerchantKeyForTransaction(transaction);
  if (!merchantKey) {
    throw new ClassificationRuleRequestError(
      "This description doesn't have a stable merchant name to remember.",
      400
    );
  }

  const category = normalizeMerchantKey(transaction.normalizedCategory) || null;
  const direction = getRuleDirection(transaction.cashFlowAmount);
  const ruleId = createHash('sha256')
    .update(`${merchantKey}\n${category || ''}\n${direction}`)
    .digest('hex');

  return {
    ruleId,
    merchantKey,
    category,
    direction,
    classification: override.classification,
    offsetCategory: override.classification === 'refund' ? override.offsetCategory : null,
    createdFromTransactionId: transaction.transactionId,
    createdAt,
    timesApplied: 0,
  };
}

export function parseStoredClassificationRule(
  ruleId: string,
  value: unknown
): StoredClassificationRule | null {
  if (!isRecord(value) ||
      typeof value.merchantKey !== 'string' ||
      !value.merchantKey.trim() ||
      (value.category !== null && typeof value.category !== 'string') ||
      (value.direction !== 'inflow' && value.direction !== 'outflow') ||
      !isSuggestedClassification(value.classification) ||
      typeof value.createdFromTransactionId !== 'string') {
    return null;
  }
  if (value.classification === 'refund' &&
      (typeof value.offsetCategory !== 'string' || !value.offsetCategory.trim())) {
    return null;
  }

  return {
    ruleId,
    merchantKey: normalizeMerchantKey(value.merchantKey),
    category: typeof value.category === 'string'
      ? normalizeMerchantKey(value.category) || null
      : null,
    direction: value.direction,
    classification: value.classification,
    offsetCategory: value.classification === 'refund'
      ? String(value.offsetCategory).trim()
      : null,
    createdFromTransactionId: value.createdFromTransactionId,
    createdAt: value.createdAt,
    timesApplied: typeof value.timesApplied === 'number' && Number.isFinite(value.timesApplied)
      ? value.timesApplied
      : 0,
  };
}

export function applyClassificationSuggestions(
  transactions: NormalizedTransaction[],
  rules: StoredClassificationRule[]
): NormalizedTransaction[] {
  return transactions.map(transaction => {
    if (!isSuggestionCandidate(transaction)) return transaction;

    const merchantKey = buildMerchantKeyForTransaction(transaction);
    const category = normalizeMerchantKey(transaction.normalizedCategory) || null;
    const direction = getRuleDirection(transaction.cashFlowAmount);
    const rule = rules.find(candidate =>
      candidate.merchantKey === merchantKey &&
      candidate.direction === direction &&
      (candidate.category === null || candidate.category === category)
    );
    if (!rule) return transaction;

    const suggestion: ClassificationSuggestion = {
      ruleId: rule.ruleId,
      classification: rule.classification,
      offsetCategory: rule.offsetCategory,
    };
    return { ...transaction, classificationSuggestion: suggestion };
  });
}

export type ClassificationRuleServiceDependencies = {
  deleteRule: (uid: string, ruleId: string) => Promise<void>;
  invalidateCache: (uid: string) => void;
};

export async function removeClassificationRule(
  dependencies: ClassificationRuleServiceDependencies,
  uid: string,
  ruleId: string
): Promise<void> {
  if (!ruleId) throw new ClassificationRuleRequestError('Rule ID is required.', 400);
  await dependencies.deleteRule(uid, ruleId);
  dependencies.invalidateCache(uid);
}
