export interface DashboardSummary {
  currentMonth: {
    month: string;
    spending: number;
    income: number;
    netCashFlow: number;
    savingsRate: number | null;
  };
  previousMonth: {
    spending: number;
    income: number;
    netCashFlow: number;
    savingsRate: number | null;
  };
  comparison: {
    spendingDifference: number;
    spendingPercentageChange: number | null;
  };
  allTime: {
    spending: number;
    income: number;
    netCashFlow: number;
    savingsRate: number | null;
    pendingSpending: number;
  };
  projectedSpending: number;
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

export interface DashboardVerificationReconciliation {
  categoryMathReconciles: boolean;
  accountingBridgeReconciles: boolean;
  unknownTransferCount: number;
  unknownTransferAmount: number;
  unclassifiedPositiveCount: number;
  unclassifiedPositiveAmount: number;
  pendingCount: number;
  removedCount: number;
  creditCardCount: number;
  creditCardAmount: number;
  merchantCreditCount: number;
  merchantCreditAmount: number;
}

export interface DashboardVerificationResponse {
  reconciliation: DashboardVerificationReconciliation;
}

export interface Transaction {
  transactionId: string;
  normalizedDate: string;
  normalizedMerchant: string | null;
  name: string;
  institutionName: string;
  accountName: string;
  accountMask: string;
  accountType: string;
  accountSubtype: string;
  cashFlowAmount: number;
  categoryPrimary: string;
  categoryDetailed: string;
  normalizedCategory: string;
  pending: boolean;
  status: string;
  removed: boolean;
  classification: string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
}
