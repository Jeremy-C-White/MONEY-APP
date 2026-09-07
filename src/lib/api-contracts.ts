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
  WalmartInsightsResponse,
  WalmartSourceStatus,
  HouseholdPlan,
  SafeToSpend,
  SafeToSpendDeduction,
  OverviewVerdicts,
  SavingsContributionsResponse,
  SavingsDestination,
  ContributionStream,
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

export function extractWalmartSourceStatus(data: unknown): WalmartSourceStatus {
  const record = requireRecord(data, 'Walmart source');
  if (typeof record.connected !== 'boolean') {
    throw new Error('Invalid Walmart source response.');
  }
  if (record.connected && (
    typeof record.spreadsheetId !== 'string' ||
    typeof record.spreadsheetTitle !== 'string' ||
    typeof record.spreadsheetUrl !== 'string'
  )) {
    throw new Error('Invalid Walmart source response.');
  }
  return record as unknown as WalmartSourceStatus;
}

function isWalmartMonthlyInsight(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.month === 'string' &&
    typeof value.totalSpend === 'number' &&
    typeof value.fuelSpend === 'number' &&
    typeof value.orderCount === 'number';
}

function isWalmartTopItem(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.productName === 'string' &&
    validNullableString(value.productUrl) &&
    typeof value.purchaseCount === 'number' &&
    typeof value.quantity === 'number' &&
    typeof value.spend === 'number' &&
    typeof value.lastPurchased === 'string';
}

function isWalmartOrderItem(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.productName === 'string' &&
    validNullableString(value.productUrl) &&
    typeof value.quantity === 'number' &&
    typeof value.price === 'number' &&
    typeof value.fuel === 'boolean';
}

function isWalmartPriceHistoryPoint(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.month === 'string' &&
    typeof value.averageUnitPrice === 'number' &&
    typeof value.lowUnitPrice === 'number' &&
    typeof value.highUnitPrice === 'number' &&
    typeof value.purchaseCount === 'number';
}

function isWalmartPriceTrend(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.productName === 'string' &&
    validNullableString(value.productUrl) &&
    typeof value.purchaseCount === 'number' &&
    typeof value.firstPurchased === 'string' &&
    typeof value.lastPurchased === 'string' &&
    typeof value.firstUnitPrice === 'number' &&
    typeof value.latestUnitPrice === 'number' &&
    typeof value.lowUnitPrice === 'number' &&
    typeof value.highUnitPrice === 'number' &&
    typeof value.changeAmount === 'number' &&
    validNullableNumber(value.changePercentage) &&
    Array.isArray(value.history) &&
    value.history.every(isWalmartPriceHistoryPoint);
}

function isWalmartRecentOrder(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.orderNumber === 'string' &&
    typeof value.date === 'string' &&
    ['delivery', 'pickup', 'shipping', 'in_store', 'online'].includes(String(value.channel)) &&
    typeof value.total === 'number' &&
    typeof value.tip === 'number' &&
    typeof value.savings === 'number' &&
    typeof value.itemCount === 'number' &&
    typeof value.fuel === 'boolean' &&
    Array.isArray(value.items) &&
    value.items.every(isWalmartOrderItem);
}

export function extractWalmartInsightsResponse(data: unknown): WalmartInsightsResponse {
  const record = requireRecord(data, 'Walmart insights');
  if (
    !isRecord(record.source) ||
    typeof record.source.spreadsheetTitle !== 'string' ||
    typeof record.source.spreadsheetUrl !== 'string' ||
    !['last_12_months', 'this_year', 'all_time'].includes(String(record.period)) ||
    !(typeof record.startDate === 'string' || record.startDate === null) ||
    !(typeof record.endDate === 'string' || record.endDate === null) ||
    !isRecord(record.summary) ||
    typeof record.summary.totalSpend !== 'number' ||
    typeof record.summary.orderCount !== 'number' ||
    typeof record.summary.averageOrder !== 'number' ||
    typeof record.summary.onlineSpend !== 'number' ||
    typeof record.summary.inStoreSpend !== 'number' ||
    typeof record.summary.tips !== 'number' ||
    typeof record.summary.savings !== 'number' ||
    typeof record.summary.fuelSpend !== 'number' ||
    typeof record.summary.fuelGallons !== 'number' ||
    !(typeof record.summary.averageFuelPricePerGallon === 'number' || record.summary.averageFuelPricePerGallon === null) ||
    typeof record.summary.fuelPurchaseCount !== 'number' ||
    typeof record.summary.returnAmount !== 'number' ||
    typeof record.summary.returnCount !== 'number' ||
    !Array.isArray(record.monthly) ||
    !record.monthly.every(isWalmartMonthlyInsight) ||
    !Array.isArray(record.topItems) ||
    !record.topItems.every(isWalmartTopItem) ||
    !Array.isArray(record.priceTrends) ||
    !record.priceTrends.every(isWalmartPriceTrend) ||
    !Array.isArray(record.recentOrders) ||
    !record.recentOrders.every(isWalmartRecentOrder) ||
    !isRecord(record.quality) ||
    typeof record.quality.canceledItemRowsExcluded !== 'number' ||
    typeof record.quality.statusDuplicateRowsExcluded !== 'number' ||
    typeof record.quality.zeroDollarOrdersExcluded !== 'number' ||
    typeof record.quality.incompleteOrderStubsExcluded !== 'number'
  ) {
    throw new Error('Invalid Walmart insights response.');
  }
  return record as unknown as WalmartInsightsResponse;
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
    typeof value.affectsForecastBalance === 'boolean' &&
    validNullableString(value.pendingTransactionId)
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
    typeof record.migrationRan !== 'boolean' ||
    (
      record.deploymentRevision !== undefined &&
      record.deploymentRevision !== null &&
      typeof record.deploymentRevision !== 'string'
    )
  ) {
    throw new Error('Invalid status response.');
  }

  return {
    ...(record as unknown as Omit<AppStatusResponse, 'deploymentRevision'>),
    // Keep rolling deploys compatible with the previous server response.
    deploymentRevision: typeof record.deploymentRevision === 'string'
      ? record.deploymentRevision
      : null,
  };
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
}

export interface NormalizedOverviewData {
  summary: DashboardSummary;
  categories: DashboardCategory[];
  merchants: DashboardMerchant[];
  trends: TrendPoint[];
  recurringObligations: RecurringObligationsResponse;
  householdInsights: HouseholdInsights;
  verification: DashboardVerificationResponse;
}

export function normalizeOverviewPayloads(
  payloads: OverviewPayloads
): NormalizedOverviewData {
  const planning = extractHouseholdPlanningResponse(payloads.householdPlanning);

  return {
    summary: extractSummaryResponse(payloads.summary),
    categories: extractCategoriesResponse(payloads.categories),
    merchants: extractMerchantsResponse(payloads.merchants),
    trends: extractTrendsResponse(payloads.trends),
    recurringObligations: planning.recurringObligations,
    householdInsights: planning.insights,
    verification: extractVerificationResponse(payloads.verification),
  };
}

const SAFE_TO_SPEND_BLOCKERS = [
  'no_connected_cash',
  'no_operating_cash',
  'operating_account_unresolved',
  'missing_cash_balance',
  'stale_cash_balance',
  'connection_needs_attention',
  'mixed_currency',
];
const VERDICT_TONES = ['positive', 'caution', 'neutral'];

export function extractHouseholdPlan(data: unknown): HouseholdPlan {
  const record = requireRecord(data, 'household plan');
  const plan = isRecord(record.householdPlan) ? record.householdPlan : record;

  if (
    typeof plan.safeToSpendBuffer !== 'number' ||
    !validNullableNumber(plan.monthlySpendingTarget)
  ) {
    throw new Error('Invalid household plan response.');
  }

  return {
    safeToSpendBuffer: plan.safeToSpendBuffer,
    monthlySpendingTarget: plan.monthlySpendingTarget as number | null,
  };
}

function isSafeToSpendDeduction(value: unknown): value is SafeToSpendDeduction {
  return (
    isRecord(value) &&
    typeof value.deductionId === 'string' &&
    ['bill', 'pending', 'buffer'].includes(String(value.kind)) &&
    typeof value.label === 'string' &&
    typeof value.amount === 'number' &&
    validNullableString(value.date) &&
    validNullableString(value.accountName)
  );
}

export function extractSafeToSpend(data: unknown): SafeToSpend {
  const record = requireRecord(data, 'safe to spend');

  if (
    !['ready', 'unavailable'].includes(String(record.status)) ||
    typeof record.asOfDate !== 'string' ||
    typeof record.throughDate !== 'string' ||
    !validNullableString(record.currency) ||
    !['available', 'current', null].includes(record.cashBasis as 'available' | 'current' | null) ||
    !validNullableNumber(record.cashOnHand) ||
    typeof record.cashAccountCount !== 'number' ||
    typeof record.excludedCashAccountCount !== 'number' ||
    typeof record.unassignedCashAccountCount !== 'number' ||
    !validNullableNumber(record.billsDue) ||
    !validNullableNumber(record.pendingOutflow) ||
    typeof record.buffer !== 'number' ||
    !validNullableNumber(record.amount) ||
    !Array.isArray(record.deductions) ||
    !record.deductions.every(isSafeToSpendDeduction) ||
    typeof record.pendingReflectedInBalance !== 'boolean' ||
    !Array.isArray(record.blockers) ||
    !record.blockers.every(blocker => SAFE_TO_SPEND_BLOCKERS.includes(String(blocker))) ||
    !validNullableString(record.warning)
  ) {
    throw new Error('Invalid safe to spend response.');
  }

  // A "ready" figure the server did not actually populate would render as a
  // confident number built on nothing.
  if (record.status === 'ready' && (record.amount === null || record.cashOnHand === null)) {
    throw new Error('Invalid safe to spend response.');
  }

  return record as unknown as SafeToSpend;
}

function isSpendingTargetProgress(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.month === 'string' &&
    typeof value.target === 'number' &&
    typeof value.spentToDate === 'number' &&
    typeof value.remaining === 'number' &&
    typeof value.expectedToDate === 'number' &&
    typeof value.paceDifference === 'number' &&
    typeof value.projectedMonthEndSpending === 'number' &&
    typeof value.projectedDifference === 'number' &&
    ['early', 'developing', 'established'].includes(String(value.projectionMaturity)) &&
    ['under', 'on_track', 'over'].includes(String(value.verdict))
  );
}

export function extractOverviewVerdicts(data: unknown): OverviewVerdicts {
  const record = requireRecord(data, 'overview verdicts');
  const monthProgress = record.monthProgress;

  if (
    !isRecord(monthProgress) ||
    typeof monthProgress.month !== 'string' ||
    typeof monthProgress.dayOfMonth !== 'number' ||
    typeof monthProgress.daysInMonth !== 'number' ||
    typeof monthProgress.spending !== 'number' ||
    typeof monthProgress.income !== 'number' ||
    typeof monthProgress.netCashFlow !== 'number' ||
    !VERDICT_TONES.includes(String(monthProgress.tone))
  ) {
    throw new Error('Invalid overview verdicts response.');
  }

  const lastCompletedMonth = record.lastCompletedMonth;
  if (lastCompletedMonth !== null && !(
    isRecord(lastCompletedMonth) &&
    typeof lastCompletedMonth.month === 'string' &&
    typeof lastCompletedMonth.netCashFlow === 'number' &&
    ['best', 'tightest', 'middle'].includes(String(lastCompletedMonth.rank)) &&
    typeof lastCompletedMonth.comparedMonthCount === 'number' &&
    validNullableString(lastCompletedMonth.previousMonth) &&
    validNullableNumber(lastCompletedMonth.previousNetCashFlow) &&
    validNullableNumber(lastCompletedMonth.difference) &&
    VERDICT_TONES.includes(String(lastCompletedMonth.tone))
  )) {
    throw new Error('Invalid overview verdicts response.');
  }

  const pacing = record.pacing;
  if (pacing !== null && !(
    isRecord(pacing) &&
    typeof pacing.dayOfMonth === 'number' &&
    typeof pacing.daysInMonth === 'number' &&
    typeof pacing.previousMonthToDateSpending === 'number' &&
    typeof pacing.spendingDifference === 'number' &&
    validNullableNumber(pacing.spendingPercentageChange) &&
    ['ahead', 'behind', 'level'].includes(String(pacing.direction)) &&
    (pacing.driver === null || (
      isRecord(pacing.driver) &&
      typeof pacing.driver.category === 'string' &&
      typeof pacing.driver.difference === 'number' &&
      typeof pacing.driver.share === 'number'
    )) &&
    VERDICT_TONES.includes(String(pacing.tone))
  )) {
    throw new Error('Invalid overview verdicts response.');
  }

  if (
    !Array.isArray(record.categoryDrivers) ||
    !record.categoryDrivers.every(driver => (
      isRecord(driver) &&
      typeof driver.category === 'string' &&
      typeof driver.currentSpending === 'number' &&
      typeof driver.previousSpending === 'number' &&
      typeof driver.difference === 'number' &&
      validNullableNumber(driver.percentageChange) &&
      ['new', 'up', 'down', 'stopped'].includes(String(driver.movement)) &&
      VERDICT_TONES.includes(String(driver.tone))
    )) ||
    (record.targetProgress !== null && !isSpendingTargetProgress(record.targetProgress))
  ) {
    throw new Error('Invalid overview verdicts response.');
  }

  return record as unknown as OverviewVerdicts;
}

const CONTRIBUTION_CADENCES = ['weekly', 'biweekly', 'twice_monthly', 'monthly', 'irregular'];
const CONTRIBUTION_STATUSES = ['active', 'paused', 'ended'];

function isContributionStream(value: unknown): value is ContributionStream {
  return (
    isRecord(value) &&
    typeof value.streamKey === 'string' &&
    validNullableString(value.reference) &&
    typeof value.totalContributed === 'number' &&
    typeof value.contributionCount === 'number' &&
    typeof value.firstContribution === 'string' &&
    typeof value.lastContribution === 'string' &&
    typeof value.typicalAmount === 'number' &&
    validNullableNumber(value.currentMonthlyRate) &&
    CONTRIBUTION_CADENCES.includes(String(value.cadence)) &&
    CONTRIBUTION_STATUSES.includes(String(value.status))
  );
}

function isSavingsDestination(value: unknown): value is SavingsDestination {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.destinationId === 'string' &&
    typeof value.displayName === 'string' &&
    typeof value.isNamed === 'boolean' &&
    typeof value.totalContributed === 'number' &&
    typeof value.contributionCount === 'number' &&
    typeof value.firstContribution === 'string' &&
    typeof value.lastContribution === 'string' &&
    typeof value.monthlyAverage === 'number' &&
    validNullableNumber(value.currentMonthlyRate) &&
    CONTRIBUTION_CADENCES.includes(String(value.cadence)) &&
    CONTRIBUTION_STATUSES.includes(String(value.status)) &&
    Array.isArray(value.monthlyHistory) &&
    value.monthlyHistory.every(point => (
      isRecord(point) &&
      typeof point.month === 'string' &&
      typeof point.amount === 'number' &&
      typeof point.count === 'number'
    )) &&
    (value.rateChange === null || (
      isRecord(value.rateChange) &&
      typeof value.rateChange.previousAmount === 'number' &&
      typeof value.rateChange.currentAmount === 'number' &&
      typeof value.rateChange.changedOnMonth === 'string'
    )) &&
    typeof value.mergedStreamCount === 'number' &&
    Array.isArray(value.streams) &&
    value.streams.every(isContributionStream)
  );
}

export function extractSavingsContributions(data: unknown): SavingsContributionsResponse {
  const record = requireRecord(data, 'savings contributions');
  const totals = record.totals;

  if (
    typeof record.asOfDate !== 'string' ||
    !Array.isArray(record.destinations) ||
    !record.destinations.every(isSavingsDestination) ||
    !isRecord(totals) ||
    typeof totals.totalContributed !== 'number' ||
    typeof totals.contributionCount !== 'number' ||
    typeof totals.monthlyAverage !== 'number' ||
    !validNullableNumber(totals.currentMonthlyRate) ||
    !validNullableNumber(totals.investmentFundingRateOfIncome) ||
    !validNullableNumber(totals.incomeConsidered) ||
    !validNullableString(totals.incomeFromMonth)
  ) {
    throw new Error('Invalid savings contributions response.');
  }

  return record as unknown as SavingsContributionsResponse;
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
  });

  return {
    ...normalized,
    accountBalances: extractAccountBalanceSummary(record.accountBalances),
    cashFlowForecast: extractCashFlowForecast(record.cashFlowForecast),
    householdPlan: extractHouseholdPlan(record.householdPlan),
    safeToSpend: extractSafeToSpend(record.safeToSpend),
    verdicts: extractOverviewVerdicts(record.verdicts),
  };
}
