import type {
  DashboardCategory,
  DashboardMerchant,
  DashboardSummary,
  DashboardVerificationResponse,
  Transaction,
  TransactionsResponse,
  TrendPoint,
  AccountSummary,
  ConnectedAccount,
} from '../types/finance';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${label} response.`);
  }
  return value;
}

function requireArrayField<T>(
  value: unknown,
  field: string,
  label: string
): T[] {
  const record = requireRecord(value, label);
  const fieldValue = record[field];

  if (!Array.isArray(fieldValue)) {
    throw new Error(`Invalid ${label} response.`);
  }

  return fieldValue as T[];
}

export function extractSummaryResponse(data: unknown): DashboardSummary {
  const record = requireRecord(data, 'dashboard summary');

  if (
    !isRecord(record.allTime) ||
    !isRecord(record.currentMonth) ||
    !isRecord(record.previousMonth) ||
    !isRecord(record.comparison) ||
    !isRecord(record.pacing)
  ) {
    throw new Error('Invalid dashboard summary response.');
  }

  return record as unknown as DashboardSummary;
}

export function extractCategoriesResponse(data: unknown): DashboardCategory[] {
  return requireArrayField<DashboardCategory>(
    data,
    'categories',
    'dashboard categories'
  );
}

export function extractMerchantsResponse(data: unknown): DashboardMerchant[] {
  return requireArrayField<DashboardMerchant>(
    data,
    'merchants',
    'dashboard merchants'
  );
}

export function extractTrendsResponse(data: unknown): TrendPoint[] {
  return requireArrayField<TrendPoint>(
    data,
    'monthly',
    'dashboard trends'
  );
}

export function extractVerificationResponse(
  data: unknown
): DashboardVerificationResponse {
  const record = requireRecord(data, 'dashboard verification');

  if (!isRecord(record.reconciliation)) {
    throw new Error('Invalid dashboard verification response.');
  }

  return record as unknown as DashboardVerificationResponse;
}

export function extractTransactionsResponse(
  data: unknown
): TransactionsResponse {
  const record = requireRecord(data, 'transactions');

  if (!Array.isArray(record.transactions)) {
    throw new Error('Invalid transactions response.');
  }

  if (
    typeof record.total !== 'number' ||
    typeof record.page !== 'number' ||
    typeof record.limit !== 'number' ||
    typeof record.totalPages !== 'number'
  ) {
    throw new Error('Invalid transactions response.');
  }

  return record as unknown as TransactionsResponse;
}

export function extractAccountsResponse(data: unknown): AccountSummary[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid accounts response.');
  }
  return data as AccountSummary[];
}

export function extractConnectedAccountsResponse(data: unknown): ConnectedAccount[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid connected accounts response.');
  }

  const requiredFields = [
    'accountId',
    'institutionName',
    'accountName',
    'accountMask',
    'accountType',
    'accountSubtype',
    'health',
  ];

  if (data.some(account => (
    !isRecord(account) || requiredFields.some(field => typeof account[field] !== 'string')
  ))) {
    throw new Error('Invalid connected accounts response.');
  }

  return data as ConnectedAccount[];
}

export interface OverviewPayloads {
  summary: unknown;
  categories: unknown;
  merchants: unknown;
  trends: unknown;
  verification: unknown;
  postedTransactions: unknown;
  pendingTransactions: unknown;
}

export interface NormalizedOverviewData {
  summary: DashboardSummary;
  categories: DashboardCategory[];
  merchants: DashboardMerchant[];
  trends: TrendPoint[];
  verification: DashboardVerificationResponse;
  postedTransactions: Transaction[];
  pendingTransactions: Transaction[];
}

export function normalizeOverviewPayloads(
  payloads: OverviewPayloads
): NormalizedOverviewData {
  const posted = extractTransactionsResponse(payloads.postedTransactions);
  const pending = extractTransactionsResponse(payloads.pendingTransactions);

  return {
    summary: extractSummaryResponse(payloads.summary),
    categories: extractCategoriesResponse(payloads.categories),
    merchants: extractMerchantsResponse(payloads.merchants),
    trends: extractTrendsResponse(payloads.trends),
    verification: extractVerificationResponse(payloads.verification),
    postedTransactions: posted.transactions,
    pendingTransactions: pending.transactions,
  };
}
