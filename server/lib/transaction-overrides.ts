import {
  isClassification,
  type NormalizedTransaction,
  type TransactionOverride,
} from './financial';
import {
  buildClassificationRule,
  ClassificationRuleRequestError,
  type StoredClassificationRule,
} from './classification-rules';

type UnknownRecord = Record<string, unknown>;

export type StoredTransactionOverride = TransactionOverride & {
  reviewedAt: unknown;
  reviewedBy: string;
};

export class TransactionOverrideRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'TransactionOverrideRequestError';
  }
}
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseTransactionOverrideInput(value: unknown): TransactionOverride {
  if (!isRecord(value) || !isClassification(value.classification)) {
    throw new TransactionOverrideRequestError('Invalid transaction classification.', 400);
  }

  if (value.classification === 'pending' || value.classification === 'removed') {
    throw new TransactionOverrideRequestError('Pending and removed classifications cannot be overridden.', 400);
  }

  let offsetCategory: string | null = null;
  if (value.offsetCategory !== undefined && value.offsetCategory !== null) {
    if (value.classification !== 'refund') {
      throw new TransactionOverrideRequestError('offsetCategory is only valid for refund overrides.', 400);
    }
    if (typeof value.offsetCategory !== 'string' || value.offsetCategory.trim() === '') {
      throw new TransactionOverrideRequestError('offsetCategory must be a non-empty string.', 400);
    }
    offsetCategory = value.offsetCategory.trim();
  }

  let note: string | null = null;
  if (value.note !== undefined && value.note !== null) {
    if (typeof value.note !== 'string') {
      throw new TransactionOverrideRequestError('note must be a string or null.', 400);
    }
    if (value.note.length > 500) {
      throw new TransactionOverrideRequestError('note must be 500 characters or fewer.', 400);
    }
    note = value.note.trim() || null;
  }

  return {
    classification: value.classification,
    offsetCategory,
    note,
  };
}

export function parseStoredTransactionOverride(value: unknown): TransactionOverride | null {
  try {
    return parseTransactionOverrideInput(value);
  } catch {
    return null;
  }
}

export type TransactionOverrideServiceDependencies = {
  loadTransactions: (uid: string) => Promise<NormalizedTransaction[]>;
  persistOverride: (
    uid: string,
    transactionId: string,
    override: StoredTransactionOverride,
    rememberedRule: StoredClassificationRule | null,
    appliedSuggestionRuleId: string | null
  ) => Promise<void>;
  deleteOverride: (uid: string, transactionId: string) => Promise<void>;
  invalidateCache: (uid: string) => void;
  reviewedAt: () => unknown;
};

async function requireOverridableTransaction(
  dependencies: TransactionOverrideServiceDependencies,
  uid: string,
  transactionId: string
): Promise<NormalizedTransaction> {
  const transaction = (await dependencies.loadTransactions(uid))
    .find(candidate => candidate.transactionId === transactionId);

  if (!transaction) {
    throw new TransactionOverrideRequestError('Transaction not found.', 404);
  }
  if (transaction.pending || transaction.removed) {
    throw new TransactionOverrideRequestError('Pending or removed transactions cannot be overridden.', 400);
  }

  return transaction;
}

export async function saveTransactionOverride(
  dependencies: TransactionOverrideServiceDependencies,
  uid: string,
  transactionId: string,
  value: unknown
): Promise<StoredTransactionOverride> {
  const parsed = parseTransactionOverrideInput(value);
  const transaction = await requireOverridableTransaction(dependencies, uid, transactionId);
  const input = isRecord(value) ? value : {};
  if (input.rememberRule !== undefined && typeof input.rememberRule !== 'boolean') {
    throw new TransactionOverrideRequestError('rememberRule must be a boolean.', 400);
  }
  if (input.suggestionRuleId !== undefined &&
      (typeof input.suggestionRuleId !== 'string' || !input.suggestionRuleId.trim())) {
    throw new TransactionOverrideRequestError('suggestionRuleId must be a non-empty string.', 400);
  }
  if (input.rememberRule === true && input.suggestionRuleId) {
    throw new TransactionOverrideRequestError('A confirmed suggestion cannot create another rule.', 400);
  }

  const appliedSuggestionRuleId = typeof input.suggestionRuleId === 'string'
    ? input.suggestionRuleId.trim()
    : null;
  if (appliedSuggestionRuleId) {
    const suggestion = transaction.classificationSuggestion;
    if (!suggestion ||
        suggestion.ruleId !== appliedSuggestionRuleId ||
        suggestion.classification !== parsed.classification ||
        suggestion.offsetCategory !== parsed.offsetCategory) {
      throw new TransactionOverrideRequestError('This remembered suggestion is no longer valid.', 400);
    }
  }

  const reviewedAt = dependencies.reviewedAt();

  const stored: StoredTransactionOverride = {
    ...parsed,
    reviewedAt,
    reviewedBy: uid,
  };

  let rememberedRule: StoredClassificationRule | null = null;
  if (input.rememberRule === true) {
    try {
      rememberedRule = buildClassificationRule(transaction, parsed, reviewedAt);
    } catch (error) {
      if (error instanceof ClassificationRuleRequestError) {
        throw new TransactionOverrideRequestError(error.message, error.status);
      }
      throw error;
    }
  }

  await dependencies.persistOverride(
    uid,
    transactionId,
    stored,
    rememberedRule,
    appliedSuggestionRuleId
  );
  dependencies.invalidateCache(uid);
  return stored;
}

export async function removeTransactionOverride(
  dependencies: TransactionOverrideServiceDependencies,
  uid: string,
  transactionId: string
): Promise<void> {
  await requireOverridableTransaction(dependencies, uid, transactionId);
  await dependencies.deleteOverride(uid, transactionId);
  dependencies.invalidateCache(uid);
}
