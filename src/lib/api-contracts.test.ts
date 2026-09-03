import { describe, expect, it } from 'vitest';
import {
  extractSummaryResponse,
  extractCategoriesResponse,
  extractMerchantsResponse,
  extractTrendsResponse,
  extractVerificationResponse,
  extractTransactionsResponse,
  normalizeOverviewPayloads,
  extractAccountsResponse,
  extractConnectedAccountsResponse,
  extractTransactionOverridesResponse,
  extractRecurringObligationsResponse,
  extractStatusResponse,
  extractHouseholdPlanningResponse,
} from './api-contracts';
import {
  formatMonthLabel,
  formatMonthShort,
  formatMonthShortWithYear,
  formatPercentage,
  formatPercentagePoints,
  getCategoryLabel,
  getCategoryDisplayLabel,
  getClassificationLabel,
  isNeedsReviewClassification,
  getTransactionClassificationLabel,
} from './formatters';

const summaryPayload = {
  allTime: {
    spending: 10000,
    income: 20000,
    netCashFlow: 10000,
    savingsRate: 0.5,
    pendingSpending: 50,
    projectedSpending: 10050,
  },
  currentMonth: {
    month: '2026-09',
    spending: 500,
    income: 1000,
    netCashFlow: 500,
    savingsRate: 0.5,
  },
  previousMonth: {
    month: '2026-08',
    spending: 400,
    income: 900,
    netCashFlow: 500,
    savingsRate: 500 / 900,
  },
  comparison: {
    spendingDifference: 100,
    spendingPercentageChange: 25,
  },
  pacing: {
    dayOfMonth: 15,
    daysInMonth: 30,
    previousMonthToDateSpending: 200,
    previousMonthToDateIncome: 450,
    spendingDifference: 300,
    spendingPercentageChange: 150,
    projectedMonthEndSpending: 1000,
  },
  activePostedCount: 15,
};

const category = {
  category: 'FOOD_AND_DRINK',
  netSpending: 50,
  transactionCount: 2,
  grossPurchases: 50,
  refunds: 0,
  merchantCredits: 0,
  percentage: 0.2,
};

const merchant = {
  merchant: 'Starbucks',
  netSpending: 25,
  transactionCount: 3,
};

const trend = {
  month: '2026-09',
  income: 1000,
  spending: 500,
  netCashFlow: 500,
};

const recurringObligationsPayload = {
  obligations: [{
    obligationId: '111111111111111111111111',
    merchant: 'Verizon',
    category: 'RENT_AND_UTILITIES',
    cadence: 'monthly' as const,
    confidence: 'high' as const,
    typicalCharge: 120,
    estimatedMonthlyAmount: 120,
    occurrenceCount: 5,
    lastChargeDate: '2026-08-15',
    status: 'confirmed' as const,
    expectedMonthlyAmount: 120,
    seasonStartMonth: null,
    seasonEndMonth: null,
    note: null,
    detected: true,
  }],
  estimatedMonthlyTotal: 120,
  confirmedMonthlyTotal: 120,
  suggestionCount: 0,
  analyzedThrough: '2026-09-01',
  forecast: [{ month: '2026-09', confirmedAmount: 120, obligationCount: 1 }],
};

const householdInsightsPayload = {
  asOfDate: '2026-09-15',
  weekly: {
    current: { startDate: '2026-09-14', endDate: '2026-09-15', spending: 50, income: 100, netCashFlow: 50 },
    previousComparable: { startDate: '2026-09-07', endDate: '2026-09-08', spending: 40, income: 100, netCashFlow: 60 },
    previousFull: { startDate: '2026-09-07', endDate: '2026-09-13', spending: 140, income: 100, netCashFlow: -40 },
    pendingSpending: 10,
    spendingDifference: 10,
    spendingPercentageChange: 25,
  },
  monthly: {
    current: { startDate: '2026-09-01', endDate: '2026-09-15', spending: 500, income: 1000, netCashFlow: 500 },
    previousComparable: { startDate: '2026-08-01', endDate: '2026-08-15', spending: 400, income: 900, netCashFlow: 500 },
    previousFull: { startDate: '2026-08-01', endDate: '2026-08-31', spending: 800, income: 1800, netCashFlow: 1000 },
    spendingDifference: 100,
    spendingPercentageChange: 25,
    categoryChanges: [{
      category: 'FOOD_AND_DRINK',
      currentSpending: 200,
      previousSpending: 100,
      difference: 100,
      percentageChange: 100,
    }],
  },
  forecast: {
    month: '2026-09',
    daysElapsed: 15,
    daysRemaining: 15,
    maturity: 'established',
    postedSpending: 500,
    pendingSpending: 10,
    confirmedRecurringMonthly: 120,
    confirmedRecurringRemaining: 20,
    variableSpendingToDate: 400,
    projectedVariableRemaining: 400,
    projectedMonthEndSpending: 930,
  },
};

const transaction = {
  transactionId: 'tx_123',
  accountId: 'acc_1',
  institutionName: 'Chase',
  accountName: 'Checking',
  accountMask: '1234',
  accountType: 'depository',
  accountSubtype: 'checking',
  rawDate: '45500',
  normalizedDate: '2026-09-01',
  name: 'STARBUCKS STORE',
  normalizedMerchant: 'Starbucks',
  plaidAmount: 5.5,
  cashFlowAmount: -5.5,
  categoryPrimary: 'FOOD_AND_DRINK',
  categoryDetailed: 'FOOD_AND_DRINK_COFFEE',
  normalizedCategory: 'FOOD_AND_DRINK',
  pending: false,
  pendingTransactionId: '',
  status: 'active',
  removed: false,
  classification: 'spending' as const,
  countsTowardSpending: true,
  countsTowardIncome: false,
  spendingAdjustment: 5.5,
  incomeAdjustment: 0,
  isOverridden: false,
  overrideNote: null,
  overrideOffsetCategory: null,
};

const verificationPayload = {
  summary: summaryPayload,
  categories: [category],
  merchants: [merchant],
  trends: [trend],
  reconciliation: {
    totalRowsParsed: 1,
    activePostedRows: 1,
    pendingCount: 0,
    removedCount: 0,
    spendingCount: 1,
    incomeCount: 0,
    transferCount: 0,
    investmentTransferCount: 0,
    investmentTransferAmount: 0,
    creditCardCount: 0,
    creditCardAmount: 0,
    refundCount: 0,
    merchantCreditCount: 0,
    merchantCreditAmount: 0,
    cashWithdrawalCount: 0,
    cashWithdrawalAmount: 0,
    interestEarnedCount: 0,
    interestEarnedAmount: 0,
    p2pIncomingCount: 0,
    p2pIncomingAmount: 0,
    p2pOutgoingCount: 0,
    p2pOutgoingAmount: 0,
    unclassifiedPositiveCount: 0,
    unclassifiedPositiveAmount: 0,
    unknownTransferCount: 1,
    unknownTransferAmount: 496,
    otherCount: 1,
    unclassifiedDepositCount: 1,
    unclassifiedDepositAmount: 1197.69,
    grossPurchases: 50,
    refunds: 0,
    merchantCredits: 0,
    netSpending: 50,
    recognizedIncome: 0,
    netCashFlow: -50,
    categoryMathReconciles: true,
    bridge: {
      activePostedRawCashFlowTotal: -50,
      recognizedSpending: -50,
      recognizedIncome: 0,
      refundsAndCredits: 0,
      creditCardPayments: 0,
      internalTransfers: 0,
      investmentTransfers: 0,
      cashWithdrawals: 0,
      p2pOutgoing: 0,
      p2pIncoming: 0,
      interestEarned: 0,
      bankFeeInterestPaid: 0,
      unknownTransfers: 0,
      otherUnclassified: 0,
      unclassifiedDeposits: 1197.69,
      accountingBridgeReconciles: true,
    },
  },
};

const transactionsPayload = {
  transactions: [transaction],
  total: 1,
  page: 1,
  limit: 6,
  totalPages: 1,
};

describe('API response contracts', () => {
  it('validates the application status response', () => {
    const status = extractStatusResponse({
      items: [],
      trialItemsConfirmed: 4,
      trialItemsUnresolved: 0,
      googleConnected: true,
      migrationRan: false,
    });

    expect(status.trialItemsConfirmed).toBe(4);
    expect(status.googleConnected).toBe(true);
    expect(() => extractStatusResponse({ error: 'Status check failed' })).toThrow(
      'Invalid status response.'
    );
  });

  it('unwraps the categories wrapper', () => {
    const result = extractCategoriesResponse({ categories: [category] });
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('FOOD_AND_DRINK');
    expect(result[0].percentage).toBe(0.2);
  });

  it('unwraps the merchants wrapper', () => {
    const result = extractMerchantsResponse({ merchants: [merchant] });
    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe('Starbucks');
  });

  it('unwraps the monthly trends wrapper', () => {
    const result = extractTrendsResponse({ monthly: [trend] });
    expect(result).toHaveLength(1);
    expect(result[0].month).toBe('2026-09');
  });

  it('validates the recurring-obligations response', () => {
    const result = extractRecurringObligationsResponse(recurringObligationsPayload);
    expect(result.estimatedMonthlyTotal).toBe(120);
    expect(result.obligations[0].merchant).toBe('Verizon');
    expect(() => extractRecurringObligationsResponse({ obligations: [] })).toThrow(
      'Invalid recurring obligations response.'
    );
  });

  it('validates household planning without changing recurring response semantics', () => {
    const result = extractHouseholdPlanningResponse({
      recurringObligations: recurringObligationsPayload,
      insights: householdInsightsPayload,
    });
    expect(result.insights.weekly.current.spending).toBe(50);
    expect(result.insights.monthly.categoryChanges[0].difference).toBe(100);
    expect(result.recurringObligations.confirmedMonthlyTotal).toBe(120);
    expect(() => extractHouseholdPlanningResponse({
      recurringObligations: recurringObligationsPayload,
      insights: { weekly: {} },
    })).toThrow('Invalid household insights response.');
  });

  it('reads the paced comparison from summary.pacing', () => {
    const result = extractSummaryResponse(summaryPayload);
    expect(result.pacing.dayOfMonth).toBe(15);
    expect(result.pacing.previousMonthToDateSpending).toBe(200);
    expect(result.pacing.spendingPercentageChange).toBe(150);
  });

  it('rejects a summary response missing the pacing object', () => {
    const { pacing, ...withoutPacing } = summaryPayload;
    expect(() => extractSummaryResponse(withoutPacing)).toThrow(
      'Invalid dashboard summary response.'
    );
  });

  it('reads review data from verification.reconciliation', () => {
    const result = extractVerificationResponse(verificationPayload);
    expect(result.reconciliation.unknownTransferCount).toBe(1);
    expect(result.reconciliation.unknownTransferAmount).toBe(496);
    expect(result.reconciliation.unclassifiedDepositCount).toBe(1);
    expect(result.reconciliation.bridge.unclassifiedDeposits).toBe(1197.69);
  });

  it('retains normalized transaction fields from the server response', () => {
    const result = extractTransactionsResponse(transactionsPayload);
    expect(result.transactions[0].normalizedDate).toBe('2026-09-01');
    expect(result.transactions[0].normalizedMerchant).toBe('Starbucks');
    expect(result.transactions[0].institutionName).toBe('Chase');
    expect(result.transactions[0].accountName).toBe('Checking');
  });

  it('normalizes a representative full Overview payload without wrapper/array mistakes', () => {
    const result = normalizeOverviewPayloads({
      summary: summaryPayload,
      categories: { categories: [category] },
      merchants: { merchants: [merchant] },
      trends: { monthly: [trend] },
      householdPlanning: {
        recurringObligations: recurringObligationsPayload,
        insights: householdInsightsPayload,
      },
      verification: verificationPayload,
      postedTransactions: transactionsPayload,
      pendingTransactions: {
        ...transactionsPayload,
        transactions: [{ ...transaction, transactionId: 'pending_1', pending: true }],
      },
    });

    expect(result.summary.currentMonth.month).toBe('2026-09');
    expect(result.categories[0].category).toBe('FOOD_AND_DRINK');
    expect(result.merchants[0].merchant).toBe('Starbucks');
    expect(result.trends[0].netCashFlow).toBe(500);
    expect(result.recurringObligations.obligations[0].merchant).toBe('Verizon');
    expect(result.householdInsights.forecast.projectedMonthEndSpending).toBe(930);
    expect(result.verification.reconciliation.unknownTransferCount).toBe(1);
    expect(result.postedTransactions[0].normalizedMerchant).toBe('Starbucks');
    expect(result.pendingTransactions[0].pending).toBe(true);
  });

  it('rejects a wrapper object where an array field is missing', () => {
    expect(() => extractCategoriesResponse({ wrongKey: [] })).toThrow(
      'Invalid dashboard categories response.'
    );
  });
});

describe('presentation formatters', () => {
  it('keeps fractional and percentage-point formatting separate', () => {
    expect(formatPercentage(0.25)).toBe('25%');
    expect(formatPercentagePoints(25)).toBe('25%');
    expect(formatPercentagePoints(25)).not.toBe('2,500%');
  });

  it('formats negative percentage-point changes correctly', () => {
    expect(formatPercentagePoints(-8.5)).toBe('-8.5%');
  });

  it('formats the server reporting month for display', () => {
    expect(formatMonthLabel('2026-09')).toBe('September 2026');
  });

  it('formats a short month label for narrow chart axes', () => {
    expect(formatMonthShort('2026-09')).toBe('Sep');
  });

  it('formats a short month label with a two-digit year for year boundaries', () => {
    expect(formatMonthShortWithYear('2026-09')).toBe("Sep '26");
  });

  it('falls back to the raw input for invalid month strings', () => {
    expect(formatMonthShort('2026-13')).toBe('2026-13');
    expect(formatMonthShort('not-a-month')).toBe('not-a-month');
    expect(formatMonthShort(null)).toBe('—');
    expect(formatMonthShort(undefined)).toBe('—');

    expect(formatMonthShortWithYear('2026-13')).toBe('2026-13');
    expect(formatMonthShortWithYear('not-a-month')).toBe('not-a-month');
    expect(formatMonthShortWithYear(null)).toBe('—');
    expect(formatMonthShortWithYear(undefined)).toBe('—');
  });

  it('title-cases unmapped Plaid categories word by word', () => {
    expect(getCategoryLabel('GENERAL_SERVICES')).toBe('General Services');
    expect(getCategoryLabel('OTHER_OTHER')).toBe('Other Other');
  });

  it('keeps the hand-tuned category labels for categories with a special case', () => {
    expect(getCategoryLabel('TRANSFER_OUT')).toBe('Transfers out');
  });

  it('shows a friendly label for person-to-person transfers regardless of the raw category', () => {
    expect(getCategoryDisplayLabel('TRANSFER_OUT', 'person_to_person')).toBe('Payments to people');
    expect(getCategoryDisplayLabel('GENERAL_MERCHANDISE', 'person_to_person')).toBe('Payments to people');
  });

  it('falls back to the category label when the classification is not person-to-person', () => {
    expect(getCategoryDisplayLabel('TRANSFER_OUT', 'spending')).toBe('Transfers out');
    expect(getCategoryDisplayLabel('GENERAL_SERVICES', 'income')).toBe('General Services');
  });

  it('unwraps the transaction override audit list', () => {
    const overrides = extractTransactionOverridesResponse({
      overrides: [{
        transactionId: 'tx_123',
        classification: 'income',
        offsetCategory: null,
        note: 'Confirmed payroll',
        reviewedAt: '2026-09-01T12:00:00Z',
        reviewedBy: 'user_1',
      }],
    });

    expect(overrides).toHaveLength(1);
    expect(overrides[0].transactionId).toBe('tx_123');
  });

  it('labels unclassified deposits neutrally and keeps them in review', () => {
    expect(getClassificationLabel('unclassified_deposit')).toBe('Deposit — needs review');
    expect(isNeedsReviewClassification('unclassified_deposit')).toBe(true);
    expect(isNeedsReviewClassification('other')).toBe(true);
    expect(isNeedsReviewClassification('income')).toBe(false);
  });

  it('labels a reviewed refund with an offset category as reimbursement', () => {
    expect(getTransactionClassificationLabel('refund', true, 'FOOD_AND_DRINK')).toBe('Reimbursement');
    expect(getTransactionClassificationLabel('refund', false, null)).toBe('Refund');
  });
});

describe('extractAccountsResponse', () => {
  it('extracts accounts array', () => {
    const result = extractAccountsResponse([{ accountId: 'acc_1' }]);
    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe('acc_1');
  });

  it('throws on non-array input', () => {
    expect(() => extractAccountsResponse({ accounts: [] })).toThrow('Invalid accounts response.');
    expect(() => extractAccountsResponse(null)).toThrow('Invalid accounts response.');
  });
});

describe('extractConnectedAccountsResponse', () => {
  const connectedAccount = {
    accountId: 'acc_1',
    institutionName: 'Example Bank',
    accountName: 'Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    health: 'healthy',
  };

  it('accepts the connected-account top-level array contract', () => {
    expect(extractConnectedAccountsResponse([connectedAccount])).toEqual([connectedAccount]);
    expect(extractConnectedAccountsResponse([])).toEqual([]);
  });

  it('rejects wrappers and malformed account records', () => {
    expect(() => extractConnectedAccountsResponse({ accounts: [] })).toThrow(
      'Invalid connected accounts response.'
    );
    expect(() => extractConnectedAccountsResponse([{ ...connectedAccount, accountName: null }])).toThrow(
      'Invalid connected accounts response.'
    );
  });
});

describe('extractTransactionsResponse metadata', () => {
  it('enforces required metadata', () => {
    expect(() => extractTransactionsResponse({ transactions: [] })).toThrow();
    
    expect(() => extractTransactionsResponse({ 
      transactions: [],
      total: 10,
      page: 1,
      limit: 10,
      totalPages: 1
    })).not.toThrow();
  });
});
