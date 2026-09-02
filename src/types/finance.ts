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
  | 'reimbursement'
  | 'pending'
  | 'removed'
  | 'other';

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
  reimbursementCount: number;
  reimbursementAmount: number;
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
