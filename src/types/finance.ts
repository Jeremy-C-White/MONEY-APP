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
    projectedMonthEndSpending: number;
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
