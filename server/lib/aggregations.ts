import { NormalizedTransaction } from './financial';
import { getMonthForDateInTimezone, getDayOfMonthInTimezone, getDaysInMonth } from './time';

export function getPreviousMonthString(currentMonthStr: string): string {
  const parts = currentMonthStr.split('-');
  let year = parseInt(parts[0]);
  let month = parseInt(parts[1]);
  if (month === 1) {
    year--;
    month = 12;
  } else {
    month--;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function aggregateSummary(txs: NormalizedTransaction[], financeTimezone: string) {
  const now = new Date();
  const currentMonthPrefix = getMonthForDateInTimezone(now, financeTimezone);
  const previousMonthPrefix = getPreviousMonthString(currentMonthPrefix);
  const currentDayOfMonth = getDayOfMonthInTimezone(now, financeTimezone);
  const daysInCurrentMonth = getDaysInMonth(currentMonthPrefix);

  let spending = 0;
  let income = 0;

  let currentMonthSpending = 0;
  let currentMonthIncome = 0;

  let previousMonthSpending = 0;
  let previousMonthIncome = 0;

  let previousMonthToDateSpending = 0;
  let previousMonthToDateIncome = 0;

  let pendingSpending = 0;
  let activePostedCount = 0;

  for (const t of txs) {
    if (t.removed) continue;

    if (t.pending) {
      if (t.countsTowardSpending) {
        pendingSpending += t.spendingAdjustment;
      }
      continue;
    }

    activePostedCount++;

    const isPreviousMonth = t.normalizedDate.startsWith(previousMonthPrefix);
    // Day-of-month by string slice, not by constructing a Date: normalizedDate
    // is already a YYYY-MM-DD calendar date, and a previous month can be
    // shorter than the current one (e.g. current day 31, previous month has
    // 30 days) — a Date constructor would roll that over into the wrong month.
    const isWithinPacingWindow = isPreviousMonth && parseInt(t.normalizedDate.slice(8, 10), 10) <= currentDayOfMonth;

    if (t.countsTowardSpending) {
      spending += t.spendingAdjustment;
      if (t.normalizedDate.startsWith(currentMonthPrefix)) currentMonthSpending += t.spendingAdjustment;
      if (isPreviousMonth) previousMonthSpending += t.spendingAdjustment;
      if (isWithinPacingWindow) previousMonthToDateSpending += t.spendingAdjustment;
    }

    if (t.countsTowardIncome) {
      income += t.incomeAdjustment;
      if (t.normalizedDate.startsWith(currentMonthPrefix)) currentMonthIncome += t.incomeAdjustment;
      if (isPreviousMonth) previousMonthIncome += t.incomeAdjustment;
      if (isWithinPacingWindow) previousMonthToDateIncome += t.incomeAdjustment;
    }
  }

  const netCashFlow = income - spending;
  const savingsRate = income > 0 ? (netCashFlow / income) : null;
  
  const currentMonthNetCashFlow = currentMonthIncome - currentMonthSpending;
  const currentMonthSavingsRate = currentMonthIncome > 0 ? (currentMonthNetCashFlow / currentMonthIncome) : null;

  const previousMonthNetCashFlow = previousMonthIncome - previousMonthSpending;
  const previousMonthSavingsRate = previousMonthIncome > 0 ? (previousMonthNetCashFlow / previousMonthIncome) : null;

  const spendingDifference = currentMonthSpending - previousMonthSpending;
  const spendingPercentageChange = previousMonthSpending > 0
    ? (spendingDifference / previousMonthSpending) * 100
    : null;

  const pacedSpendingDifference = currentMonthSpending - previousMonthToDateSpending;
  const pacedSpendingPercentageChange = previousMonthToDateSpending > 0
    ? (pacedSpendingDifference / previousMonthToDateSpending) * 100
    : null;

  return {
    allTime: {
      spending,
      income,
      netCashFlow,
      savingsRate,
      pendingSpending,
      projectedSpending: spending + pendingSpending
    },
    currentMonth: {
      month: currentMonthPrefix,
      spending: currentMonthSpending,
      income: currentMonthIncome,
      netCashFlow: currentMonthNetCashFlow,
      savingsRate: currentMonthSavingsRate,
    },
    previousMonth: {
      month: previousMonthPrefix,
      spending: previousMonthSpending,
      income: previousMonthIncome,
      netCashFlow: previousMonthNetCashFlow,
      savingsRate: previousMonthSavingsRate,
    },
    comparison: {
      spendingDifference,
      spendingPercentageChange
    },
    pacing: {
      dayOfMonth: currentDayOfMonth,
      daysInMonth: daysInCurrentMonth,
      previousMonthToDateSpending,
      previousMonthToDateIncome,
      spendingDifference: pacedSpendingDifference,
      spendingPercentageChange: pacedSpendingPercentageChange,
    },
    activePostedCount
  };
}

// A refund's category is the category it offsets, not Plaid's own category
// for the refund transaction itself. Used everywhere "which category does
// this transaction belong to" needs an answer, so the two readers (category
// totals, category filtering) can't drift apart.
export function getEffectiveCategory(t: NormalizedTransaction): string {
  return t.classification === 'refund' && t.overrideOffsetCategory
    ? t.overrideOffsetCategory
    : t.normalizedCategory;
}

function withPercentages<T extends { netSpending: number }>(items: T[]): Array<T & { percentage: number }> {
  let totalNetPositiveSpending = 0;
  for (const item of items) {
    if (item.netSpending > 0) totalNetPositiveSpending += item.netSpending;
  }
  return items.map(item => ({
    ...item,
    percentage: totalNetPositiveSpending > 0 && item.netSpending > 0 ? (item.netSpending / totalNetPositiveSpending) : 0,
  }));
}

export function aggregateCategories(txs: NormalizedTransaction[]) {
  const categoryTotals: Record<string, { netSpending: number, transactionCount: number, grossPurchases: number, refunds: number, merchantCredits: number }> = {};

  for (const t of txs) {
    if (t.removed || t.pending || !t.countsTowardSpending) continue;

    const cat = getEffectiveCategory(t);
    if (!categoryTotals[cat]) {
      categoryTotals[cat] = { netSpending: 0, transactionCount: 0, grossPurchases: 0, refunds: 0, merchantCredits: 0 };
    }

    categoryTotals[cat].transactionCount++;
    categoryTotals[cat].netSpending += t.spendingAdjustment;

    if (t.classification === 'refund') {
      categoryTotals[cat].refunds += Math.abs(t.spendingAdjustment); // Keep refund tracked as a positive absolute value for display
    } else if (t.classification === 'merchant_credit') {
      categoryTotals[cat].merchantCredits += Math.abs(t.spendingAdjustment);
    } else {
      categoryTotals[cat].grossPurchases += t.spendingAdjustment;
    }
  }

  const entries = Object.entries(categoryTotals).map(([category, stats]) => ({ category, ...stats }));
  return withPercentages(entries).sort((a, b) => b.netSpending - a.netSpending);
}

export function aggregateMerchants(txs: NormalizedTransaction[]) {
  const merchantTotals: Record<string, { netSpending: number, transactionCount: number }> = {};
  
  for (const t of txs) {
    if (t.removed || t.pending || !t.countsTowardSpending) continue;
    
    const merchant = t.normalizedMerchant || 'Unknown';
    if (!merchantTotals[merchant]) {
      merchantTotals[merchant] = { netSpending: 0, transactionCount: 0 };
    }
    
    merchantTotals[merchant].transactionCount++;
    merchantTotals[merchant].netSpending += t.spendingAdjustment;
  }
  
  return Object.entries(merchantTotals)
    .map(([merchant, stats]) => ({ merchant, ...stats }))
    .sort((a, b) => b.netSpending - a.netSpending);
}

export type CategoryPeriod = 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'all_time';

export const CATEGORY_PERIODS: CategoryPeriod[] = ['this_month', 'last_month', 'last_3_months', 'this_year', 'all_time'];

function monthsBeforePrefix(monthPrefix: string, count: number): string {
  let month = monthPrefix;
  for (let i = 0; i < count; i++) month = getPreviousMonthString(month);
  return month;
}

// Every period is a closed [startMonth, endMonth] range of YYYY-MM prefixes,
// compared as strings against normalizedDate.slice(0, 7) - never a Date
// built from that string - so first/last-of-month rows land in the right
// bucket regardless of server-local timezone.
function resolveCategoryPeriodRange(
  period: CategoryPeriod,
  now: Date,
  financeTimezone: string
): { startMonth: string | null; endMonth: string | null } {
  const currentMonthPrefix = getMonthForDateInTimezone(now, financeTimezone);
  const currentYear = currentMonthPrefix.slice(0, 4);

  switch (period) {
    case 'this_month':
      return { startMonth: currentMonthPrefix, endMonth: currentMonthPrefix };
    case 'last_month': {
      const lastMonth = getPreviousMonthString(currentMonthPrefix);
      return { startMonth: lastMonth, endMonth: lastMonth };
    }
    case 'last_3_months':
      return { startMonth: monthsBeforePrefix(currentMonthPrefix, 2), endMonth: currentMonthPrefix };
    case 'this_year':
      return { startMonth: `${currentYear}-01`, endMonth: `${currentYear}-12` };
    case 'all_time':
      return { startMonth: null, endMonth: null };
  }
}

function resolvePreviousCategoryPeriodRange(
  period: CategoryPeriod,
  now: Date,
  financeTimezone: string
): { startMonth: string; endMonth: string } | null {
  if (period === 'all_time') return null;
  const currentMonthPrefix = getMonthForDateInTimezone(now, financeTimezone);
  const currentYear = Number(currentMonthPrefix.slice(0, 4));

  switch (period) {
    case 'this_month': {
      const month = getPreviousMonthString(currentMonthPrefix);
      return { startMonth: month, endMonth: month };
    }
    case 'last_month': {
      const month = monthsBeforePrefix(currentMonthPrefix, 2);
      return { startMonth: month, endMonth: month };
    }
    case 'last_3_months':
      return {
        startMonth: monthsBeforePrefix(currentMonthPrefix, 5),
        endMonth: monthsBeforePrefix(currentMonthPrefix, 3),
      };
    case 'this_year': {
      const previousYear = currentYear - 1;
      return { startMonth: `${previousYear}-01`, endMonth: `${previousYear}-12` };
    }
  }
}

function monthInRange(normalizedDate: string, startMonth: string | null, endMonth: string | null): boolean {
  if (startMonth === null || endMonth === null) return true;
  const month = normalizedDate.slice(0, 7);
  return month >= startMonth && month <= endMonth;
}

export type CategoryBreakdownMerchant = {
  merchant: string;
  netSpending: number;
  transactionCount: number;
};

export type CategoryBreakdownDetail = {
  categoryDetailed: string;
  netSpending: number;
  transactionCount: number;
  merchants: CategoryBreakdownMerchant[];
};

export type CategoryBreakdownCategory = {
  category: string;
  netSpending: number;
  transactionCount: number;
  percentage: number;
  previousSpending: number | null;
  change: number | null;
  details: CategoryBreakdownDetail[];
};

export type CategoryBreakdownReport = {
  period: CategoryPeriod;
  startMonth: string | null;
  endMonth: string | null;
  categories: CategoryBreakdownCategory[];
  merchants: CategoryBreakdownMerchant[];
};

// Top Categories and Top Merchants on the Overview share one period control,
// so they share one aggregator: the category tree groups by categoryDetailed
// under its primary (index 17 alongside index 16, both already parsed onto
// NormalizedTransaction - see financial.ts) with merchants nested under each
// detailed group, and the flat merchant list is the same per-transaction
// totals grouped the other way, so the two views can't disagree.
export function aggregatePeriodCategoryBreakdown(
  txs: NormalizedTransaction[],
  period: CategoryPeriod,
  financeTimezone: string
): CategoryBreakdownReport {
  const now = new Date();
  const { startMonth, endMonth } = resolveCategoryPeriodRange(period, now, financeTimezone);

  type DetailBucket = { netSpending: number; transactionCount: number; merchants: Map<string, CategoryBreakdownMerchant> };
  type CategoryBucket = { netSpending: number; transactionCount: number; details: Map<string, DetailBucket> };

  const categoryBuckets = new Map<string, CategoryBucket>();
  const merchantTotals = new Map<string, CategoryBreakdownMerchant>();

  for (const t of txs) {
    if (t.removed || t.pending || !t.countsTowardSpending) continue;
    if (!monthInRange(t.normalizedDate, startMonth, endMonth)) continue;

    const category = getEffectiveCategory(t);
    const merchantName = t.normalizedMerchant || 'Unknown';

    const categoryBucket = categoryBuckets.get(category) ||
      { netSpending: 0, transactionCount: 0, details: new Map<string, DetailBucket>() };
    categoryBucket.netSpending += t.spendingAdjustment;
    categoryBucket.transactionCount++;

    const detailBucket = categoryBucket.details.get(t.categoryDetailed) ||
      { netSpending: 0, transactionCount: 0, merchants: new Map<string, CategoryBreakdownMerchant>() };
    detailBucket.netSpending += t.spendingAdjustment;
    detailBucket.transactionCount++;

    const detailMerchant = detailBucket.merchants.get(merchantName) ||
      { merchant: merchantName, netSpending: 0, transactionCount: 0 };
    detailMerchant.netSpending += t.spendingAdjustment;
    detailMerchant.transactionCount++;
    detailBucket.merchants.set(merchantName, detailMerchant);

    categoryBucket.details.set(t.categoryDetailed, detailBucket);
    categoryBuckets.set(category, categoryBucket);

    const merchantTotal = merchantTotals.get(merchantName) || { merchant: merchantName, netSpending: 0, transactionCount: 0 };
    merchantTotal.netSpending += t.spendingAdjustment;
    merchantTotal.transactionCount++;
    merchantTotals.set(merchantName, merchantTotal);
  }

  // "No prior data" (null) means the prior period itself is outside the
  // observed ledger - not that a given category happened to spend $0 in a
  // prior period that does have other activity. Only the former is unknown.
  const previousRange = resolvePreviousCategoryPeriodRange(period, now, financeTimezone);
  const previousByCategory = new Map<string, number>();
  let previousPeriodHasData = false;
  if (previousRange) {
    for (const t of txs) {
      if (t.removed || t.pending) continue;
      if (!monthInRange(t.normalizedDate, previousRange.startMonth, previousRange.endMonth)) continue;
      previousPeriodHasData = true;
      if (!t.countsTowardSpending) continue;
      const category = getEffectiveCategory(t);
      previousByCategory.set(category, (previousByCategory.get(category) || 0) + t.spendingAdjustment);
    }
  }

  const categoryEntries = Array.from(categoryBuckets.entries()).map(([category, bucket]) => {
    const previousSpending = previousPeriodHasData ? (previousByCategory.get(category) ?? 0) : null;
    const details: CategoryBreakdownDetail[] = Array.from(bucket.details.entries())
      .map(([categoryDetailed, detail]) => ({
        categoryDetailed,
        netSpending: detail.netSpending,
        transactionCount: detail.transactionCount,
        merchants: Array.from(detail.merchants.values()).sort((a, b) => b.netSpending - a.netSpending),
      }))
      .sort((a, b) => b.netSpending - a.netSpending);

    return {
      category,
      netSpending: bucket.netSpending,
      transactionCount: bucket.transactionCount,
      previousSpending,
      change: previousSpending === null ? null : bucket.netSpending - previousSpending,
      details,
    };
  });

  const categories = withPercentages(categoryEntries).sort((a, b) => b.netSpending - a.netSpending);
  const merchants = Array.from(merchantTotals.values()).sort((a, b) => b.netSpending - a.netSpending);

  return { period, startMonth, endMonth, categories, merchants };
}

export function aggregateTrends(txs: NormalizedTransaction[], range: string = '12m', financeTimezone: string = 'America/New_York') {
  const now = new Date();
  const currentMonthPrefix = getMonthForDateInTimezone(now, financeTimezone);
  const currentYear = currentMonthPrefix.substring(0, 4);

  let cutoffMonth = '';
  if (range === '6m') {
    let m = currentMonthPrefix;
    for (let i = 0; i < 5; i++) m = getPreviousMonthString(m);
    cutoffMonth = m;
  } else if (range === '12m') {
    let m = currentMonthPrefix;
    for (let i = 0; i < 11; i++) m = getPreviousMonthString(m);
    cutoffMonth = m;
  } else if (range === 'ytd') {
    cutoffMonth = `${currentYear}-01`;
  } else {
    // Default to 12m
    let m = currentMonthPrefix;
    for (let i = 0; i < 11; i++) m = getPreviousMonthString(m);
    cutoffMonth = m;
  }

  const monthly: Record<string, { income: number, spending: number, netCashFlow: number }> = {};
  
  // Initialize all months in range to 0
  let iterMonth = cutoffMonth;
  while (iterMonth <= currentMonthPrefix) {
    monthly[iterMonth] = { income: 0, spending: 0, netCashFlow: 0 };
    
    // increment iterMonth
    const parts = iterMonth.split('-');
    let y = parseInt(parts[0]);
    let m = parseInt(parts[1]);
    if (m === 12) {
      y++;
      m = 1;
    } else {
      m++;
    }
    iterMonth = `${y}-${String(m).padStart(2, '0')}`;
  }
  
  for (const t of txs) {
    if (t.removed || t.pending) continue;
    
    const month = t.normalizedDate.substring(0, 7);
    if (!monthly[month]) continue; // Skip if out of range or invalid
    
    if (t.countsTowardIncome) monthly[month].income += t.incomeAdjustment;
    if (t.countsTowardSpending) monthly[month].spending += t.spendingAdjustment;
  }
  
  for (const m of Object.keys(monthly)) {
    monthly[m].netCashFlow = monthly[m].income - monthly[m].spending;
  }
  
  return Object.entries(monthly)
    .map(([month, stats]) => ({ month, ...stats }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function filterTransactions(txs: NormalizedTransaction[], filters: any) {
  let result = txs;
  if (filters.startDate) result = result.filter(t => t.normalizedDate >= filters.startDate);
  if (filters.endDate) result = result.filter(t => t.normalizedDate <= filters.endDate);
  if (filters.institution) result = result.filter(t => t.institutionName === filters.institution);
  if (filters.account) result = result.filter(t => t.accountId === filters.account);
  if (filters.category) {
    result = result.filter(t => getEffectiveCategory(t) === filters.category);
  }
  if (String(filters.overridden || '').toLowerCase() === 'true') {
    result = result.filter(t => t.isOverridden);
  }
  if (filters.classification) {
    const classifications = String(filters.classification)
      .split(',')
      .map(classification => classification.trim())
      .filter(Boolean);
    if (classifications.length > 0) {
      result = result.filter(t => classifications.includes(t.classification));
    }
  }
  if (filters.status) {
    if (filters.status === 'pending') result = result.filter(t => t.pending && !t.removed);
    if (filters.status === 'posted') result = result.filter(t => !t.pending && !t.removed);
  }
  if (filters.search) {
    const s = filters.search.toLowerCase();
    result = result.filter(t => (t.normalizedMerchant || '').toLowerCase().includes(s) || (t.name || '').toLowerCase().includes(s));
  }
  return result;
}

export function buildTransactionsPage(txs: NormalizedTransaction[], filters: any) {
  const filtered = filterTransactions(txs, filters)
    .slice()
    .sort((a, b) => {
      const dateCompare = b.normalizedDate.localeCompare(a.normalizedDate);
      if (dateCompare !== 0) return dateCompare;
      return b.transactionId.localeCompare(a.transactionId);
    });

  const requestedPage = parseInt(String(filters.page || '1'), 10);
  const requestedLimit = parseInt(String(filters.limit || '100'), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 1000)
    : 100;
  const startIndex = (page - 1) * limit;

  return {
    transactions: filtered.slice(startIndex, startIndex + limit),
    total: filtered.length,
    page,
    limit,
    totalPages: Math.ceil(filtered.length / limit),
  };
}

export function buildAccountHealthMap(plaidItemsData: any[]): Map<string, string> {
  const itemHealthMap = new Map<string, string>();
  for (const data of plaidItemsData) {
    if (Array.isArray(data.accounts)) {
      for (const acc of data.accounts) {
        if (acc.id) {
          itemHealthMap.set(acc.id, data.health || 'unknown');
        }
      }
    }
  }
  return itemHealthMap;
}

export function buildVerificationReport(txs: NormalizedTransaction[], financeTimezone: string) {
  const summary = aggregateSummary(txs, financeTimezone);
  const categories = aggregateCategories(txs);
  const merchants = aggregateMerchants(txs);
  const trends = aggregateTrends(txs);

  let pendingCount = 0;
  let removedCount = 0;
  let spendingCount = 0;
  let incomeCount = 0;
  let transferCount = 0;
  let investmentTransferCount = 0;
  let investmentTransferAmount = 0;
  let creditCardCount = 0;
  let creditCardAmount = 0;
  let refundCount = 0;
  let merchantCreditCount = 0;
  let merchantCreditAmount = 0;
  let cashWithdrawalCount = 0;
  let cashWithdrawalAmount = 0;
  let interestEarnedCount = 0;
  let interestEarnedAmount = 0;
  let p2pIncomingCount = 0;
  let p2pIncomingAmount = 0;
  let p2pOutgoingCount = 0;
  let p2pOutgoingAmount = 0;
  let unclassifiedPositiveCount = 0;
  let unclassifiedPositiveAmount = 0;
  let unknownTransferCount = 0;
  let unknownTransferAmount = 0;
  let otherCount = 0;
  let unclassifiedDepositCount = 0;
  let unclassifiedDepositAmount = 0;
  let zeroAmountCount = 0;
  let zeroAmountAmount = 0;

  // Accounting bridge
  let activePostedRawCashFlowTotal = 0;
  let bridgeSpending = 0;
  let bridgeIncome = 0;
  let bridgeRefundsAndCredits = 0;
  let bridgeCreditCard = 0;
  let bridgeInternalTransfer = 0;
  let bridgeInvestmentTransfer = 0;
  let bridgeCashWithdrawal = 0;
  let bridgeP2POutgoing = 0;
  let bridgeP2PIncoming = 0;
  let bridgeInterestEarned = 0;
  let bridgeBankFeeInterestPaid = 0;
  let bridgeUnknownTransfer = 0;
  let bridgeOtherUnclassified = 0;
  let bridgeUnclassifiedDeposits = 0;
  let bridgeZeroAmount = 0;

  for (const t of txs) {
    if (t.removed) {
      removedCount++;
      continue;
    }
    
    if (t.pending) {
      pendingCount++;
      continue;
    }

    activePostedRawCashFlowTotal += t.cashFlowAmount;
    
    switch (t.classification) {
      case 'spending':
        spendingCount++;
        bridgeSpending += t.cashFlowAmount;
        break;
      case 'interest_paid':
      case 'bank_fee':
        spendingCount++;
        bridgeBankFeeInterestPaid += t.cashFlowAmount;
        break;
      case 'income':
        incomeCount++;
        bridgeIncome += t.cashFlowAmount;
        break;
      case 'interest_earned':
        interestEarnedCount++;
        interestEarnedAmount += t.cashFlowAmount;
        bridgeInterestEarned += t.cashFlowAmount;
        break;
      case 'internal_transfer':
        transferCount++;
        bridgeInternalTransfer += t.cashFlowAmount;
        break;
      case 'investment_transfer':
        investmentTransferCount++;
        investmentTransferAmount += Math.abs(t.cashFlowAmount);
        bridgeInvestmentTransfer += t.cashFlowAmount;
        break;
      case 'credit_card_payment':
        creditCardCount++;
        creditCardAmount += Math.abs(t.cashFlowAmount);
        bridgeCreditCard += t.cashFlowAmount;
        break;
      case 'refund':
        refundCount++;
        bridgeRefundsAndCredits += t.cashFlowAmount;
        break;
      case 'merchant_credit':
        merchantCreditCount++;
        merchantCreditAmount += t.cashFlowAmount;
        bridgeRefundsAndCredits += t.cashFlowAmount;
        break;
      case 'cash_withdrawal':
        cashWithdrawalCount++;
        cashWithdrawalAmount += Math.abs(t.cashFlowAmount);
        bridgeCashWithdrawal += t.cashFlowAmount;
        break;
      case 'person_to_person':
        if (t.cashFlowAmount < 0) {
          p2pOutgoingCount++;
          p2pOutgoingAmount += Math.abs(t.cashFlowAmount);
          bridgeP2POutgoing += t.cashFlowAmount;
        } else {
          p2pIncomingCount++;
          p2pIncomingAmount += t.cashFlowAmount;
          bridgeP2PIncoming += t.cashFlowAmount;
        }
        break;
      case 'other':
        otherCount++;
        if (t.categoryPrimary.includes('TRANSFER')) {
          unknownTransferCount++;
          unknownTransferAmount += Math.abs(t.cashFlowAmount);
          bridgeUnknownTransfer += t.cashFlowAmount;
        } else if (t.cashFlowAmount > 0) {
          unclassifiedPositiveCount++;
          unclassifiedPositiveAmount += t.cashFlowAmount;
          bridgeOtherUnclassified += t.cashFlowAmount;
        } else {
          bridgeOtherUnclassified += t.cashFlowAmount;
        }
        break;
      case 'unclassified_deposit':
        unclassifiedDepositCount++;
        unclassifiedDepositAmount += Math.abs(t.cashFlowAmount);
        bridgeUnclassifiedDeposits += t.cashFlowAmount;
        break;
      case 'zero_amount':
        zeroAmountCount++;
        zeroAmountAmount += Math.abs(t.cashFlowAmount);
        bridgeZeroAmount += t.cashFlowAmount;
        break;
    }
  }

  const grossPurchases = categories.reduce((sum, c) => sum + c.grossPurchases, 0);
  const refunds = categories.reduce((sum, c) => sum + c.refunds, 0);
  const merchantCredits = categories.reduce((sum, c) => sum + c.merchantCredits, 0);

  const bridgeSum = bridgeSpending + bridgeIncome + bridgeRefundsAndCredits + bridgeCreditCard +
                    bridgeInternalTransfer + bridgeInvestmentTransfer + bridgeCashWithdrawal + bridgeP2POutgoing + bridgeP2PIncoming +
                    bridgeInterestEarned + bridgeBankFeeInterestPaid + bridgeUnknownTransfer + bridgeOtherUnclassified + bridgeUnclassifiedDeposits + bridgeZeroAmount;

  return {
    summary,
    categories: categories.slice(0, 50),
    merchants: merchants.slice(0, 50),
    trends,
    reconciliation: {
      totalRowsParsed: txs.length,
      activePostedRows: txs.filter(t => !t.pending && !t.removed).length,
      pendingCount,
      removedCount,
      spendingCount,
      incomeCount,
      transferCount,
      investmentTransferCount,
      investmentTransferAmount,
      creditCardCount,
      creditCardAmount,
      refundCount,
      merchantCreditCount,
      merchantCreditAmount,
      cashWithdrawalCount,
      cashWithdrawalAmount,
      interestEarnedCount,
      interestEarnedAmount,
      p2pIncomingCount,
      p2pIncomingAmount,
      p2pOutgoingCount,
      p2pOutgoingAmount,
      unclassifiedPositiveCount,
      unclassifiedPositiveAmount,
      unknownTransferCount,
      unknownTransferAmount,
      otherCount,
      unclassifiedDepositCount,
      unclassifiedDepositAmount,
      zeroAmountCount,
      zeroAmountAmount,
      grossPurchases,
      refunds,
      merchantCredits,
      netSpending: summary.allTime.spending,
      recognizedIncome: summary.allTime.income,
      netCashFlow: summary.allTime.netCashFlow,
      categoryMathReconciles: Math.abs(summary.allTime.spending - (grossPurchases - refunds - merchantCredits)) < 0.01,
      bridge: {
        activePostedRawCashFlowTotal,
        recognizedSpending: bridgeSpending,
        recognizedIncome: bridgeIncome,
        refundsAndCredits: bridgeRefundsAndCredits,
        creditCardPayments: bridgeCreditCard,
        internalTransfers: bridgeInternalTransfer,
        investmentTransfers: bridgeInvestmentTransfer,
        cashWithdrawals: bridgeCashWithdrawal,
        p2pOutgoing: bridgeP2POutgoing,
        p2pIncoming: bridgeP2PIncoming,
        interestEarned: bridgeInterestEarned,
        bankFeeInterestPaid: bridgeBankFeeInterestPaid,
        unknownTransfers: bridgeUnknownTransfer,
        otherUnclassified: bridgeOtherUnclassified,
        unclassifiedDeposits: bridgeUnclassifiedDeposits,
        zeroAmount: bridgeZeroAmount,
        accountingBridgeReconciles: Math.abs(activePostedRawCashFlowTotal - bridgeSum) < 0.01
      }
    }
  };
}
