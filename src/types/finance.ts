export interface DashboardSummary {
  currentMonth: {
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

export interface DashboardMerchant {
  merchant: string;
  netSpending: number;
  transactionCount: number;
}

export interface TrendPoint {
  month: string;
  income: number;
  spending: number;
  netCashFlow: number;
}

export interface DashboardVerification {
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
  reconciliation: {
    categoryMathReconciles: boolean;
    accountingBridgeReconciles: boolean;
  };
}

export interface Transaction {
  transactionId: string;
  date: string;
  name: string;
  merchantName: string | null;
  cashFlowAmount: number;
  pending: boolean;
  classification: string;
  categoryDetailed: string;
  accountType: string;
  accountSubtype: string;
}
