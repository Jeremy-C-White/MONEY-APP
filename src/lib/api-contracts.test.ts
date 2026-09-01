import { describe, it, expect } from 'vitest';
import type { 
  DashboardSummary, 
  DashboardCategoriesResponse, 
  DashboardMerchantsResponse, 
  DashboardTrendsResponse, 
  DashboardVerificationResponse, 
  TransactionsResponse 
} from '../types/finance';

describe('API Contracts Normalization', () => {
  it('should match the DashboardSummary shape', () => {
    const rawData = {
      currentMonth: { month: "Oct 2023", spending: 500, income: 1000, netCashFlow: 500, savingsRate: 0.5 },
      previousMonth: { spending: 400, income: 900, netCashFlow: 500, savingsRate: 0.55 },
      comparison: { spendingDifference: 100, spendingPercentageChange: 0.25 },
      allTime: { spending: 10000, income: 20000, netCashFlow: 10000, savingsRate: 0.5, pendingSpending: 50 },
      projectedSpending: 600,
      activePostedCount: 15
    };

    // Cast to ensure TS compiler enforces shape at test time
    const summary: DashboardSummary = rawData;
    
    expect(summary.currentMonth.month).toBe("Oct 2023");
    expect(summary.currentMonth.spending).toBe(500);
    expect(summary.comparison.spendingDifference).toBe(100);
  });

  it('should match the DashboardCategoriesResponse wrapper shape', () => {
    const rawData = {
      categories: [
        { category: 'FOOD', netSpending: -50, transactionCount: 2, grossPurchases: -50, refunds: 0, merchantCredits: 0, percentage: 0.2 }
      ]
    };
    
    const res: DashboardCategoriesResponse = rawData;
    expect(res.categories[0].category).toBe('FOOD');
    expect(res.categories[0].netSpending).toBe(-50);
  });

  it('should match the DashboardVerificationResponse wrapper shape', () => {
    const rawData = {
      reconciliation: {
        categoryMathReconciles: true,
        accountingBridgeReconciles: true,
        unknownTransferCount: 0,
        unknownTransferAmount: 0,
        unclassifiedPositiveCount: 0,
        unclassifiedPositiveAmount: 0,
        pendingCount: 0,
        removedCount: 0,
        creditCardCount: 0,
        creditCardAmount: 0,
        merchantCreditCount: 0,
        merchantCreditAmount: 0
      }
    };
    
    const res: DashboardVerificationResponse = rawData;
    expect(res.reconciliation.categoryMathReconciles).toBe(true);
  });

  it('should match the TransactionsResponse wrapper shape', () => {
    const rawData = {
      transactions: [
        {
          transactionId: "123",
          normalizedDate: "2023-10-01",
          normalizedMerchant: "Starbucks",
          name: "STARBUCKS STORE",
          institutionName: "Chase",
          accountName: "Checking",
          accountMask: "1234",
          accountType: "depository",
          accountSubtype: "checking",
          cashFlowAmount: -5.50,
          categoryPrimary: "FOOD_AND_DRINK",
          categoryDetailed: "COFFEE_SHOP",
          normalizedCategory: "FOOD",
          pending: false,
          status: "posted",
          removed: false,
          classification: "expense"
        }
      ]
    };

    const res: TransactionsResponse = rawData;
    expect(res.transactions[0].normalizedMerchant).toBe("Starbucks");
    expect(res.transactions[0].cashFlowAmount).toBe(-5.50);
  });
});
