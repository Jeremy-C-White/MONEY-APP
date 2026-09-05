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
  TransactionOverrideRecord,
  ClassificationRuleRecord,
  RecurringObligationsResponse,
  AppStatusResponse,
  HouseholdInsights,
  HouseholdInsightPeriod,
  HouseholdPlanningResponse,
  AccountBalanceSummary,
  CashFlowForecast,
  DashboardOverviewResponse,
  CategoryBreakdownResponse,
  CategoryBreakdownCategory,
  CategoryBreakdownDetail,
  CategoryBreakdownMerchant,
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

const CATEGORY_PERIODS = ['this_month', 'last_month', 'last_3_months', 'this_year', 'all_time'];

function isCategoryBreakdownMerchant(value: unknown): value is CategoryBreakdownMerchant {
  return (
    isRecord(value) &&
    typeof value.merchant === 'string' &&
    typeof value.netSpending === 'number' &&
    typeof value.transactionCount === 'number'
  );
}

function isCategoryBreakdownDetail(value: unknown): value is CategoryBreakdownDetail {
  return (
    isRecord(value) &&
    typeof value.categoryDetailed === 'string' &&
    typeof value.netSpending === 'number' &&
    typeof value.transactionCount === 'number' &&
    Array.isArray(value.merchants) &&
    value.merchants.every(isCategoryBreakdownMerchant)
  );
}

function isCategoryBreakdownCategory(value: unknown): value is CategoryBreakdownCategory {
  return (
    isRecord(value) &&
    typeof value.category === 'string' &&
    typeof value.netSpending === 'number' &&
    typeof value.transactionCount === 'number' &&
    typeof value.percentage === 'number' &&
    validNullableNumber(value.previousSpending) &&
    validNullableNumber(value.change) &&
    Array.isArray(value.details) &&
    value.details.every(isCategoryBreakdownDetail)
  );
}

export function extractCategoryBreakdownResponse(data: unknown): CategoryBreakdownResponse {
  const record = requireRecord(data, 'category breakdown');

  if (
    !CATEGORY_PERIODS.includes(String(record.period)) ||
    !validNullableString(record.startMonth) ||
    !validNullableString(record.endMonth) ||
    !Array.isArray(record.categories) ||
    !record.categories.every(isCategoryBreakdownCategory) ||
    !Array.isArray(record.merchants) ||
    !record.merchants.every(isCategoryBreakdownMerchant)
  ) {
    throw new Error('Invalid category breakdown response.');
  }

  return record as unknown as CategoryBreakdownResponse;
}

export function extractTrendsResponse(data: unknown): TrendPoint[] {
  return requireArrayField<TrendPoint>(
    data,
    'monthly',
    'dashboard trends'
  );
}

export function extractRecurringObligationsResponse(
  data: unknown
): RecurringObligationsResponse {
  const record = requireRecord(data, 'recurring obligations');
  if (
    !Array.isArray(record.obligations) ||
    typeof record.estimatedMonthlyTotal !== 'number' ||
    typeof record.confirmedMonthlyTotal !== 'number' ||
    typeof record.suggestionCount !== 'number' ||
    !Array.isArray(record.forecast) ||
    !(typeof record.analyzedThrough === 'string' || record.analyzedThrough === null)
  ) {
    throw new Error('Invalid recurring obligations response.');
  }
  return record as unknown as RecurringObligationsResponse;
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

export function extractTransactionOverridesResponse(data: unknown): TransactionOverrideRecord[] {
  return requireArrayField<TransactionOverrideRecord>(
    data,
    'overrides',
    'transaction overrides'
  );
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

function validNullableNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function validNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

export function extractAccountBalanceSummary(data: unknown): AccountBalanceSummary {
  const record = requireRecord(data, 'account balances');
  const numericFields = [
    'connectedItemCount',
    'reportingItemCount',
    'freshItemCount',
    'missingCurrentBalanceCount',
    'currencyIssueCount',
  ];
  const nullableNumberFields = [
    'cashCurrent',
    'cashAvailable',
    'creditBalance',
    'creditOwed',
    'creditCredits',
    'loanBalance',
    'investmentValue',
    'connectedPosition',
  ];

  if (
    !['complete', 'partial', 'unavailable'].includes(String(record.status)) ||
    !validNullableString(record.currency) ||
    !validNullableString(record.oldestFetchedAt) ||
    !validNullableString(record.newestFetchedAt) ||
    numericFields.some(field => typeof record[field] !== 'number') ||
    nullableNumberFields.some(field => !validNullableNumber(record[field])) ||
    !Array.isArray(record.issues) ||
    record.issues.some(issue => (
      !isRecord(issue) ||
      typeof issue.itemId !== 'string' ||
      typeof issue.institutionName !== 'string' ||
      !['missing', 'stale', 'connection'].includes(String(issue.reason))
    )) ||
    !Array.isArray(record.accounts) ||
    record.accounts.some(account => (
      !isRecord(account) ||
      typeof account.accountId !== 'string' ||
      typeof account.institutionName !== 'string' ||
      typeof account.accountName !== 'string' ||
      typeof account.accountMask !== 'string' ||
      typeof account.accountType !== 'string' ||
      typeof account.accountSubtype !== 'string' ||
      typeof account.health !== 'string' ||
      !validNullableNumber(account.current) ||
      !validNullableNumber(account.available) ||
      !validNullableNumber(account.limit) ||
      !validNullableString(account.isoCurrencyCode) ||
      !validNullableString(account.unofficialCurrencyCode) ||
      !validNullableString(account.fetchedAt) ||
      !['fresh', 'stale', 'missing'].includes(String(account.balanceStatus))
    ))
  ) {
    throw new Error('Invalid account balances response.');
  }

  return record as unknown as AccountBalanceSummary;
}

function isPaycheckStream(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.streamId === 'string' &&
    typeof value.source === 'string' &&
    typeof value.accountId === 'string' &&
    typeof value.typicalAmount === 'number' &&
    value.cadence === 'biweekly' &&
    typeof value.occurrenceCount === 'number' &&
    typeof value.lastDate === 'string' &&
    typeof value.nextDate === 'string'
  );
}

function isScheduledCashEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.eventId === 'string' &&
    typeof value.date === 'string' &&
    (value.kind === 'paycheck' || value.kind === 'bill') &&
    (value.direction === 'inflow' || value.direction === 'outflow') &&
    typeof value.label === 'string' &&
    typeof value.amount === 'number' &&
    validNullableString(value.accountId) &&
    validNullableString(value.accountName) &&
    typeof value.affectsForecastBalance === 'boolean'
  );
}

export function extractCashFlowForecast(data: unknown): CashFlowForecast {
  const record = requireRecord(data, 'cash flow forecast');
  const forecastAccountValid = record.forecastAccount === null || (
    isRecord(record.forecastAccount) &&
    typeof record.forecastAccount.accountId === 'string' &&
    typeof record.forecastAccount.institutionName === 'string' &&
    typeof record.forecastAccount.accountName === 'string' &&
    typeof record.forecastAccount.accountMask === 'string'
  );
  if (
    !['ready', 'stale', 'unavailable'].includes(String(record.status)) ||
    typeof record.asOfDate !== 'string' ||
    typeof record.throughDate !== 'string' ||
    !['available', 'current', null].includes(record.balanceBasis as 'available' | 'current' | null) ||
    !validNullableNumber(record.startingBalance) ||
    !forecastAccountValid ||
    !Array.isArray(record.paycheckStreams) ||
    record.paycheckStreams.some(stream => !isPaycheckStream(stream)) ||
    !Array.isArray(record.upcomingBills) ||
    record.upcomingBills.some(event => !isScheduledCashEvent(event)) ||
    !Array.isArray(record.scheduledEvents) ||
    record.scheduledEvents.some(event => !isScheduledCashEvent(event)) ||
    !Array.isArray(record.dailyBalances) ||
    record.dailyBalances.some(point => !(
      isRecord(point) && typeof point.date === 'string' && typeof point.balance === 'number'
    )) ||
    !validNullableNumber(record.minimumBalance) ||
    !validNullableString(record.minimumBalanceDate) ||
    !validNullableString(record.warning)
  ) {
    throw new Error('Invalid cash flow forecast response.');
  }
  return record as unknown as CashFlowForecast;
}

export function extractClassificationRulesResponse(data: unknown): ClassificationRuleRecord[] {
  return requireArrayField<ClassificationRuleRecord>(
    data,
    'rules',
    'classification rules'
  );
}

export function extractStatusResponse(data: unknown): AppStatusResponse {
  const record = requireRecord(data, 'status');
  if (
    !Array.isArray(record.items) ||
    typeof record.trialItemsConfirmed !== 'number' ||
    typeof record.trialItemsUnresolved !== 'number' ||
    typeof record.googleConnected !== 'boolean' ||
    typeof record.migrationRan !== 'boolean'
  ) {
    throw new Error('Invalid status response.');
  }

  return record as unknown as AppStatusResponse;
}

function isHouseholdInsightPeriod(value: unknown): value is HouseholdInsightPeriod {
  if (!isRecord(value)) return false;
  return (
    typeof value.startDate === 'string' &&
    typeof value.endDate === 'string' &&
    typeof value.spending === 'number' &&
    typeof value.income === 'number' &&
    typeof value.netCashFlow === 'number'
  );
}

function isNullableNumber(value: unknown): boolean {
  return typeof value === 'number' || value === null;
}

function isCategorySpendingChange(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.category === 'string' &&
    typeof value.currentSpending === 'number' &&
    typeof value.previousSpending === 'number' &&
    typeof value.difference === 'number' &&
    isNullableNumber(value.percentageChange)
  );
}

function extractHouseholdInsights(data: unknown): HouseholdInsights {
  const record = requireRecord(data, 'household insights');
  if (
    typeof record.asOfDate !== 'string' ||
    !isRecord(record.weekly) ||
    !isRecord(record.monthly) ||
    !isRecord(record.forecast) ||
    !isHouseholdInsightPeriod(record.weekly.current) ||
    !isHouseholdInsightPeriod(record.weekly.previousComparable) ||
    !isHouseholdInsightPeriod(record.weekly.previousFull) ||
    typeof record.weekly.pendingSpending !== 'number' ||
    typeof record.weekly.spendingDifference !== 'number' ||
    !isNullableNumber(record.weekly.spendingPercentageChange) ||
    !isHouseholdInsightPeriod(record.monthly.current) ||
    !isHouseholdInsightPeriod(record.monthly.previousComparable) ||
    !isHouseholdInsightPeriod(record.monthly.previousFull) ||
    typeof record.monthly.spendingDifference !== 'number' ||
    !isNullableNumber(record.monthly.spendingPercentageChange) ||
    !Array.isArray(record.monthly.categoryChanges) ||
    record.monthly.categoryChanges.some(change => !isCategorySpendingChange(change)) ||
    typeof record.forecast.month !== 'string' ||
    typeof record.forecast.daysElapsed !== 'number' ||
    typeof record.forecast.daysRemaining !== 'number' ||
    !['early', 'developing', 'established'].includes(String(record.forecast.maturity)) ||
    typeof record.forecast.postedSpending !== 'number' ||
    typeof record.forecast.pendingSpending !== 'number' ||
    typeof record.forecast.confirmedRecurringMonthly !== 'number' ||
    typeof record.forecast.confirmedRecurringRemaining !== 'number' ||
    typeof record.forecast.variableSpendingToDate !== 'number' ||
    typeof record.forecast.projectedVariableRemaining !== 'number' ||
    typeof record.forecast.projectedMonthEndSpending !== 'number'
  ) {
    throw new Error('Invalid household insights response.');
  }
  return record as unknown as HouseholdInsights;
}

export function extractHouseholdPlanningResponse(
  data: unknown
): HouseholdPlanningResponse {
  const record = requireRecord(data, 'household planning');
  return {
    recurringObligations: extractRecurringObligationsResponse(record.recurringObligations),
    insights: extractHouseholdInsights(record.insights),
  };
}

export interface OverviewPayloads {
  summary: unknown;
  categories: unknown;
  merchants: unknown;
  trends: unknown;
  householdPlanning: unknown;
  verification: unknown;
  postedTransactions: unknown;
  pendingTransactions: unknown;
}

export interface NormalizedOverviewData {
  summary: DashboardSummary;
  categories: DashboardCategory[];
  merchants: DashboardMerchant[];
  trends: TrendPoint[];
  recurringObligations: RecurringObligationsResponse;
  householdInsights: HouseholdInsights;
  verification: DashboardVerificationResponse;
  postedTransactions: Transaction[];
  pendingTransactions: Transaction[];
}

export function normalizeOverviewPayloads(
  payloads: OverviewPayloads
): NormalizedOverviewData {
  const posted = extractTransactionsResponse(payloads.postedTransactions);
  const pending = extractTransactionsResponse(payloads.pendingTransactions);
  const planning = extractHouseholdPlanningResponse(payloads.householdPlanning);

  return {
    summary: extractSummaryResponse(payloads.summary),
    categories: extractCategoriesResponse(payloads.categories),
    merchants: extractMerchantsResponse(payloads.merchants),
    trends: extractTrendsResponse(payloads.trends),
    recurringObligations: planning.recurringObligations,
    householdInsights: planning.insights,
    verification: extractVerificationResponse(payloads.verification),
    postedTransactions: posted.transactions,
    pendingTransactions: pending.transactions,
  };
}

export function extractOverviewResponse(data: unknown): DashboardOverviewResponse {
  const record = requireRecord(data, 'dashboard overview');
  const normalized = normalizeOverviewPayloads({
    summary: record.summary,
    categories: { categories: record.categories },
    merchants: { merchants: record.merchants },
    trends: { monthly: record.trends },
    householdPlanning: {
      recurringObligations: record.recurringObligations,
      insights: record.householdInsights,
    },
    verification: record.verification,
    postedTransactions: {
      transactions: record.postedTransactions,
      total: Array.isArray(record.postedTransactions) ? record.postedTransactions.length : 0,
      page: 1,
      limit: 6,
      totalPages: 1,
    },
    pendingTransactions: {
      transactions: record.pendingTransactions,
      total: Array.isArray(record.pendingTransactions) ? record.pendingTransactions.length : 0,
      page: 1,
      limit: 4,
      totalPages: 1,
    },
  });

  return {
    ...normalized,
    accountBalances: extractAccountBalanceSummary(record.accountBalances),
    cashFlowForecast: extractCashFlowForecast(record.cashFlowForecast),
  };
}
