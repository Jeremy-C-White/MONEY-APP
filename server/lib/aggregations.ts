import { NormalizedTransaction } from './financial';
import { getMonthForDateInTimezone } from './time';

export function aggregateSummary(txs: NormalizedTransaction[], financeTimezone: string) {
  const now = new Date();
  const currentMonthPrefix = getMonthForDateInTimezone(now, financeTimezone);
  
  const prevMonthDate = new Date(now);
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const previousMonthPrefix = getMonthForDateInTimezone(prevMonthDate, financeTimezone);

  let spending = 0;
  let income = 0;
  
  let currentMonthSpending = 0;
  let currentMonthIncome = 0;
  
  let previousMonthSpending = 0;
  let previousMonthIncome = 0;
  
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

    if (t.countsTowardSpending) {
      spending += t.spendingAdjustment;
      if (t.normalizedDate.startsWith(currentMonthPrefix)) currentMonthSpending += t.spendingAdjustment;
      if (t.normalizedDate.startsWith(previousMonthPrefix)) previousMonthSpending += t.spendingAdjustment;
    }

    if (t.countsTowardIncome) {
      income += t.incomeAdjustment;
      if (t.normalizedDate.startsWith(currentMonthPrefix)) currentMonthIncome += t.incomeAdjustment;
      if (t.normalizedDate.startsWith(previousMonthPrefix)) previousMonthIncome += t.incomeAdjustment;
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
    activePostedCount
  };
}

export function aggregateCategories(txs: NormalizedTransaction[]) {
  const categoryTotals: Record<string, { netSpending: number, transactionCount: number, grossPurchases: number, refunds: number }> = {};
  
  let totalNetSpending = 0;

  for (const t of txs) {
    if (t.removed || t.pending || !t.countsTowardSpending) continue;
    
    const cat = t.normalizedCategory;
    if (!categoryTotals[cat]) {
      categoryTotals[cat] = { netSpending: 0, transactionCount: 0, grossPurchases: 0, refunds: 0 };
    }
    
    categoryTotals[cat].transactionCount++;
    categoryTotals[cat].netSpending += t.spendingAdjustment;
    
    if (t.spendingAdjustment > 0) {
      totalNetSpending += t.spendingAdjustment;
    }
    
    if (t.classification === 'refund') {
      categoryTotals[cat].refunds += Math.abs(t.spendingAdjustment); // Keep refund tracked as a positive absolute value for display
    } else {
      categoryTotals[cat].grossPurchases += t.spendingAdjustment;
    }
  }
  
  return Object.entries(categoryTotals).map(([category, stats]) => ({
    category,
    ...stats,
    percentage: totalNetSpending > 0 && stats.netSpending > 0 ? (stats.netSpending / totalNetSpending) : 0
  })).sort((a, b) => b.netSpending - a.netSpending);
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

export function aggregateTrends(txs: NormalizedTransaction[]) {
  const monthly: Record<string, { income: number, spending: number, netCashFlow: number }> = {};
  
  for (const t of txs) {
    if (t.removed || t.pending) continue;
    
    const month = t.normalizedDate.substring(0, 7);
    if (!month.match(/^\d{4}-\d{2}$/)) continue;
    
    if (!monthly[month]) {
      monthly[month] = { income: 0, spending: 0, netCashFlow: 0 };
    }
    
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
  if (filters.category) result = result.filter(t => t.normalizedCategory === filters.category);
  if (filters.classification) result = result.filter(t => t.classification === filters.classification);
  if (filters.status) {
    if (filters.status === 'pending') result = result.filter(t => t.pending);
    if (filters.status === 'posted') result = result.filter(t => !t.pending && !t.removed);
  }
  if (filters.search) {
    const s = filters.search.toLowerCase();
    result = result.filter(t => (t.normalizedMerchant || '').toLowerCase().includes(s) || (t.name || '').toLowerCase().includes(s));
  }
  return result;
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
  let creditCardCount = 0;
  let refundCount = 0;
  let cashWithdrawalCount = 0;
  let cashWithdrawalAmount = 0;
  let p2pCount = 0;
  let p2pAmount = 0;
  let unclassifiedPositiveCount = 0;
  let unclassifiedPositiveAmount = 0;
  let unknownTransferCount = 0;
  let unknownTransferAmount = 0;
  let otherCount = 0;

  for (const t of txs) {
    if (t.removed) {
      removedCount++;
      continue;
    }
    
    if (t.pending) {
      pendingCount++;
      continue;
    }
    
    switch (t.classification) {
      case 'spending':
      case 'interest_paid':
        spendingCount++;
        break;
      case 'income':
      case 'interest_earned':
        incomeCount++;
        break;
      case 'internal_transfer':
        transferCount++;
        break;
      case 'credit_card_payment':
        creditCardCount++;
        break;
      case 'refund':
        refundCount++;
        break;
      case 'cash_withdrawal':
        cashWithdrawalCount++;
        cashWithdrawalAmount += t.spendingAdjustment;
        break;
      case 'person_to_person':
        p2pCount++;
        p2pAmount += Math.abs(t.cashFlowAmount);
        break;
      case 'other':
        otherCount++;
        if (t.categoryPrimary.includes('TRANSFER')) {
          unknownTransferCount++;
          unknownTransferAmount += Math.abs(t.cashFlowAmount);
        }
        if (t.cashFlowAmount > 0) {
          unclassifiedPositiveCount++;
          unclassifiedPositiveAmount += t.cashFlowAmount;
        }
        break;
    }
  }

  const grossPurchases = categories.reduce((sum, c) => sum + c.grossPurchases, 0);
  const refunds = categories.reduce((sum, c) => sum + c.refunds, 0);

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
      creditCardCount,
      refundCount,
      cashWithdrawalCount,
      cashWithdrawalAmount,
      p2pCount,
      p2pAmount,
      unclassifiedPositiveCount,
      unclassifiedPositiveAmount,
      unknownTransferCount,
      unknownTransferAmount,
      otherCount,
      grossPurchases,
      refunds,
      netSpending: summary.allTime.spending,
      recognizedIncome: summary.allTime.income,
      netCashFlow: summary.allTime.netCashFlow,
      categoryMathReconciles: Math.abs(summary.allTime.spending - (grossPurchases - refunds)) < 0.01
    }
  };
}