export type TransactionClassification =
  | 'spending'
  | 'income'
  | 'internal_transfer'
  | 'investment_transfer'
  | 'cash_withdrawal'
  | 'person_to_person'
  | 'credit_card_payment'
  | 'refund'
  | 'merchant_credit'
  | 'interest_earned'
  | 'interest_paid'
  | 'bank_fee'
  | 'unclassified_deposit'
  | 'zero_amount'
  | 'pending'
  | 'removed'
  | 'other';

export interface PlaidItemStatus {
  internal_id: string;
  institution_id?: string;
  institution_name?: string;
  health: string;
  has_updates: boolean;
  auto_sync_status: string | null;
  auto_sync_error: string | null;
  accounts: unknown[];
}

export interface AppStatusResponse {
  items: PlaidItemStatus[];
  trialItemsConfirmed: number;
  trialItemsUnresolved: number;
  googleConnected: boolean;
  migrationRan: boolean;
}

export interface DashboardSummary {
  allTime: {
    spending: number;
    income: number;
    netCashFlow: number;
    savingsRate: number | null;
    pendingSpending: number;
    projectedSpending: number;
  };
  currentMonth: {
    month: string;
    spending: number;
    income: number;
    netCashFlow: number;
    savingsRate: number | null;
  };
  previousMonth: {
    month: string;
    spending: number;
    income: number;
    netCashFlow: number;
    savingsRate: number | null;
  };
  comparison: {
    spendingDifference: number;
    spendingPercentageChange: number | null;
  };
  pacing: {
    dayOfMonth: number;
    daysInMonth: number;
    previousMonthToDateSpending: number;
    previousMonthToDateIncome: number;
    spendingDifference: number;
    spendingPercentageChange: number | null;
  };
  activePostedCount: number;
}

export interface DashboardCategory {
  category: string;
  netSpending: number;
  transactionCount: number;
  grossPurchases: number;
  refunds: number;
  merchantCredits: number;
  percentage: number;
}

export interface DashboardCategoriesResponse {
  categories: DashboardCategory[];
}

export interface DashboardMerchant {
  merchant: string;
  netSpending: number;
  transactionCount: number;
}

export interface DashboardMerchantsResponse {
  merchants: DashboardMerchant[];
}

export interface TrendPoint {
  month: string;
  income: number;
  spending: number;
  netCashFlow: number;
}

export interface DashboardTrendsResponse {
  monthly: TrendPoint[];
}

export type RecurringCadence = 'weekly' | 'biweekly' | 'monthly';
export type RecurringConfidence = 'high' | 'medium';

export interface LikelyRecurringObligation {
  obligationId: string;
  merchant: string;
  category: string;
  cadence: RecurringCadence;
  confidence: RecurringConfidence;
  typicalCharge: number;
  estimatedMonthlyAmount: number;
  occurrenceCount: number;
  lastChargeDate: string;
  status: 'suggested' | 'confirmed' | 'seasonal' | 'dismissed';
  expectedMonthlyAmount: number;
  seasonStartMonth: number | null;
  seasonEndMonth: number | null;
  note: string | null;
  detected: boolean;
}

export interface RecurringForecastPoint {
  month: string;
  confirmedAmount: number;
  obligationCount: number;
}

export interface RecurringObligationsResponse {
  obligations: LikelyRecurringObligation[];
  estimatedMonthlyTotal: number;
  confirmedMonthlyTotal: number;
  suggestionCount: number;
  analyzedThrough: string | null;
  forecast: RecurringForecastPoint[];
}

export interface HouseholdInsightPeriod {
  startDate: string;
  endDate: string;
  spending: number;
  income: number;
  netCashFlow: number;
}

export interface CategorySpendingChange {
  category: string;
  currentSpending: number;
  previousSpending: number;
  difference: number;
  percentageChange: number | null;
}

export interface HouseholdInsights {
  asOfDate: string;
  weekly: {
    current: HouseholdInsightPeriod;
    previousComparable: HouseholdInsightPeriod;
    previousFull: HouseholdInsightPeriod;
    pendingSpending: number;
    spendingDifference: number;
    spendingPercentageChange: number | null;
  };
  monthly: {
    current: HouseholdInsightPeriod;
    previousComparable: HouseholdInsightPeriod;
    previousFull: HouseholdInsightPeriod;
    spendingDifference: number;
    spendingPercentageChange: number | null;
    categoryChanges: CategorySpendingChange[];
  };
  forecast: {
    month: string;
    daysElapsed: number;
    daysRemaining: number;
    maturity: 'early' | 'developing' | 'established';
    postedSpending: number;
    pendingSpending: number;
    confirmedRecurringMonthly: number;
    confirmedRecurringRemaining: number;
    variableSpendingToDate: number;
    projectedVariableRemaining: number;
    projectedMonthEndSpending: number;
  };
}

export interface HouseholdPlanningResponse {
  recurringObligations: RecurringObligationsResponse;
  insights: HouseholdInsights;
}

export interface DashboardVerificationBridge {
  activePostedRawCashFlowTotal: number;
  recognizedSpending: number;
  recognizedIncome: number;
  refundsAndCredits: number;
  creditCardPayments: number;
  internalTransfers: number;
  investmentTransfers: number;
  cashWithdrawals: number;
  p2pOutgoing: number;
  p2pIncoming: number;
  interestEarned: number;
  bankFeeInterestPaid: number;
  unknownTransfers: number;
  otherUnclassified: number;
  unclassifiedDeposits: number;
  zeroAmount: number;
  accountingBridgeReconciles: boolean;
}

export interface DashboardVerificationReconciliation {
  totalRowsParsed: number;
  activePostedRows: number;
  pendingCount: number;
  removedCount: number;
  spendingCount: number;
  incomeCount: number;
  transferCount: number;
  investmentTransferCount: number;
  investmentTransferAmount: number;
  creditCardCount: number;
  creditCardAmount: number;
  refundCount: number;
  merchantCreditCount: number;
  merchantCreditAmount: number;
  cashWithdrawalCount: number;
  cashWithdrawalAmount: number;
  interestEarnedCount: number;
  interestEarnedAmount: number;
  p2pIncomingCount: number;
  p2pIncomingAmount: number;
  p2pOutgoingCount: number;
  p2pOutgoingAmount: number;
  unclassifiedPositiveCount: number;
  unclassifiedPositiveAmount: number;
  unknownTransferCount: number;
  unknownTransferAmount: number;
  otherCount: number;
  unclassifiedDepositCount: number;
  unclassifiedDepositAmount: number;
  zeroAmountCount: number;
  zeroAmountAmount: number;
  grossPurchases: number;
  refunds: number;
  merchantCredits: number;
  netSpending: number;
  recognizedIncome: number;
  netCashFlow: number;
  categoryMathReconciles: boolean;
  bridge: DashboardVerificationBridge;
}

export interface DashboardVerificationResponse {
  summary: DashboardSummary;
  categories: DashboardCategory[];
  merchants: DashboardMerchant[];
  trends: TrendPoint[];
  reconciliation: DashboardVerificationReconciliation;
}

export interface Transaction {
  transactionId: string;
  accountId: string;
  institutionName: string;
  accountName: string;
  accountMask: string;
  accountType: string;
  accountSubtype: string;
  rawDate: string;
  normalizedDate: string;
  name: string;
  normalizedMerchant: string;
  plaidAmount: number;
  cashFlowAmount: number;
  categoryPrimary: string;
  categoryDetailed: string;
  normalizedCategory: string;
  pending: boolean;
  pendingTransactionId: string;
  status: string;
  removed: boolean;
  classification: TransactionClassification;
  countsTowardSpending: boolean;
  countsTowardIncome: boolean;
  spendingAdjustment: number;
  incomeAdjustment: number;
  isOverridden: boolean;
  overrideNote: string | null;
  overrideOffsetCategory: string | null;
  classificationSuggestion?: ClassificationSuggestion | null;
}

export interface ClassificationSuggestion {
  ruleId: string;
  classification: 'income' | 'spending' | 'refund' | 'internal_transfer';
  offsetCategory: string | null;
}

export interface TransactionOverrideRecord {
  transactionId: string;
  classification: TransactionClassification;
  offsetCategory: string | null;
  note: string | null;
  reviewedAt: unknown;
  reviewedBy: string;
}

export interface TransactionOverridesResponse {
  overrides: TransactionOverrideRecord[];
}

export interface ClassificationRuleRecord {
  ruleId: string;
  merchantKey: string;
  category: string | null;
  direction: 'inflow' | 'outflow';
  classification: ClassificationSuggestion['classification'];
  offsetCategory: string | null;
  createdFromTransactionId: string;
  createdAt: unknown;
  timesApplied: number;
}

export interface ClassificationRulesResponse {
  rules: ClassificationRuleRecord[];
}

export interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AccountSummary {
  accountId: string;
  institutionName: string;
  accountName: string;
  accountMask: string;
  accountType: string;
  accountSubtype: string;
  health: string;
}

export type ConnectedAccount = AccountSummary;

export type AccountBalanceStatus = 'fresh' | 'stale' | 'missing';

export interface AccountBalanceRecord extends AccountSummary {
  current: number | null;
  available: number | null;
  limit: number | null;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  fetchedAt: string | null;
  balanceStatus: AccountBalanceStatus;
}

export interface AccountBalanceSummary {
  status: 'complete' | 'partial' | 'unavailable';
  currency: string | null;
  oldestFetchedAt: string | null;
  newestFetchedAt: string | null;
  connectedItemCount: number;
  reportingItemCount: number;
  freshItemCount: number;
  missingCurrentBalanceCount: number;
  currencyIssueCount: number;
  cashCurrent: number | null;
  cashAvailable: number | null;
  creditBalance: number | null;
  creditOwed: number | null;
  creditCredits: number | null;
  loanBalance: number | null;
  investmentValue: number | null;
  connectedPosition: number | null;
  issues: Array<{
    itemId: string;
    institutionName: string;
    reason: 'missing' | 'stale' | 'connection';
  }>;
  accounts: AccountBalanceRecord[];
}

export type CashFlowForecastStatus = 'ready' | 'stale' | 'unavailable';

export interface PaycheckStream {
  streamId: string;
  source: string;
  accountId: string;
  typicalAmount: number;
  cadence: 'biweekly';
  occurrenceCount: number;
  lastDate: string;
  nextDate: string;
}

export interface ScheduledCashEvent {
  eventId: string;
  date: string;
  kind: 'paycheck' | 'bill';
  direction: 'inflow' | 'outflow';
  label: string;
  amount: number;
  accountId: string | null;
  accountName: string | null;
  affectsForecastBalance: boolean;
}

export interface DailyCashBalance {
  date: string;
  balance: number;
}

export interface CashFlowForecast {
  status: CashFlowForecastStatus;
  asOfDate: string;
  throughDate: string;
  balanceBasis: 'available' | 'current' | null;
  startingBalance: number | null;
  forecastAccount: {
    accountId: string;
    institutionName: string;
    accountName: string;
    accountMask: string;
  } | null;
  paycheckStreams: PaycheckStream[];
  upcomingBills: ScheduledCashEvent[];
  scheduledEvents: ScheduledCashEvent[];
  dailyBalances: DailyCashBalance[];
  minimumBalance: number | null;
  minimumBalanceDate: string | null;
  warning: string | null;
}

export type CategoryPeriod = 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'all_time';

export interface CategoryBreakdownMerchant {
  merchant: string;
  netSpending: number;
  transactionCount: number;
}

export interface CategoryBreakdownDetail {
  categoryDetailed: string;
  netSpending: number;
  transactionCount: number;
  merchants: CategoryBreakdownMerchant[];
}

export interface CategoryBreakdownCategory {
  category: string;
  netSpending: number;
  transactionCount: number;
  percentage: number;
  previousSpending: number | null;
  change: number | null;
  details: CategoryBreakdownDetail[];
}

export interface CategoryBreakdownResponse {
  period: CategoryPeriod;
  startMonth: string | null;
  endMonth: string | null;
  categories: CategoryBreakdownCategory[];
  merchants: CategoryBreakdownMerchant[];
}

export interface DashboardOverviewResponse {
  summary: DashboardSummary;
  categories: DashboardCategory[];
  merchants: DashboardMerchant[];
  trends: TrendPoint[];
  recurringObligations: RecurringObligationsResponse;
  householdInsights: HouseholdInsights;
  verification: DashboardVerificationResponse;
  accountBalances: AccountBalanceSummary;
  cashFlowForecast: CashFlowForecast;
}

export type WalmartInsightPeriod = 'last_12_months' | 'this_year' | 'all_time';

export interface WalmartSourceStatus {
  connected: boolean;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  spreadsheetUrl?: string;
}

export interface WalmartMonthlyInsight {
  month: string;
  totalSpend: number;
  fuelSpend: number;
  orderCount: number;
}

export interface WalmartTopItem {
  productName: string;
  productUrl: string | null;
  purchaseCount: number;
  quantity: number;
  spend: number;
  lastPurchased: string;
}

export interface WalmartOrderItem {
  productName: string;
  productUrl: string | null;
  quantity: number;
  price: number;
  fuel: boolean;
}

export interface WalmartPriceHistoryPoint {
  month: string;
  averageUnitPrice: number;
  lowUnitPrice: number;
  highUnitPrice: number;
  purchaseCount: number;
}

export interface WalmartPriceTrend {
  productName: string;
  productUrl: string | null;
  purchaseCount: number;
  firstPurchased: string;
  lastPurchased: string;
  firstUnitPrice: number;
  latestUnitPrice: number;
  lowUnitPrice: number;
  highUnitPrice: number;
  changeAmount: number;
  changePercentage: number | null;
  history: WalmartPriceHistoryPoint[];
}

export interface WalmartRecentOrder {
  orderNumber: string;
  date: string;
  channel: 'delivery' | 'pickup' | 'shipping' | 'in_store' | 'online';
  total: number;
  tip: number;
  savings: number;
  itemCount: number;
  fuel: boolean;
  items: WalmartOrderItem[];
}

export interface WalmartInsightsResponse {
  source: {
    spreadsheetTitle: string;
    spreadsheetUrl: string;
  };
  period: WalmartInsightPeriod;
  startDate: string | null;
  endDate: string | null;
  summary: {
    totalSpend: number;
    orderCount: number;
    averageOrder: number;
    onlineSpend: number;
    inStoreSpend: number;
    tips: number;
    savings: number;
    fuelSpend: number;
    fuelGallons: number;
    averageFuelPricePerGallon: number | null;
    fuelPurchaseCount: number;
    returnAmount: number;
    returnCount: number;
  };
  monthly: WalmartMonthlyInsight[];
  topItems: WalmartTopItem[];
  priceTrends: WalmartPriceTrend[];
  recentOrders: WalmartRecentOrder[];
  quality: {
    canceledItemRowsExcluded: number;
    statusDuplicateRowsExcluded: number;
    zeroDollarOrdersExcluded: number;
    incompleteOrderStubsExcluded: number;
  };
}
