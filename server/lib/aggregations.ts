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
  const dailyRate = currentDayOfMonth > 0 ? currentMonthSpending / currentDayOfMonth : 0;
  const projectedMonthEndSpending = dailyRate * daysInCurrentMonth;

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
      projectedMonthEndSpending,
    },
    activePostedCount
  };
}

export function aggregateCategories(txs: NormalizedTransaction[]) {
  const categoryTotals: Record<string, { netSpending: number, transactionCount: number, grossPurchases: number, refunds: number, merchantCredits: number }> = {};
  
  for (const t of txs) {
    if (t.removed || t.pending || !t.countsTowardSpending) continue;
    
    const cat = t.normalizedCategory;
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
  
  let totalNetPositiveSpending = 0;
  for (const stats of Object.values(categoryTotals)) {
    if (stats.netSpending > 0) {
      totalNetPositiveSpending += stats.netSpending;
    }
  }
  
  return Object.entries(categoryTotals).map(([category, stats]) => ({
    category,
    ...stats,
    percentage: totalNetPositiveSpending > 0 && stats.netSpending > 0 ? (stats.netSpending / totalNetPositiveSpending) : 0
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
  if (filters.category) result = result.filter(t => t.normalizedCategory === filters.category);
  if (filters.classification) result = result.filter(t => t.classification === filters.classification);
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
    }
  }

  const grossPurchases = categories.reduce((sum, c) => sum + c.grossPurchases, 0);
  const refunds = categories.reduce((sum, c) => sum + c.refunds, 0);
  const merchantCredits = categories.reduce((sum, c) => sum + c.merchantCredits, 0);
  
  const bridgeSum = bridgeSpending + bridgeIncome + bridgeRefundsAndCredits + bridgeCreditCard + 
                    bridgeInternalTransfer + bridgeInvestmentTransfer + bridgeCashWithdrawal + bridgeP2POutgoing + bridgeP2PIncoming +
                    bridgeInterestEarned + bridgeBankFeeInterestPaid + bridgeUnknownTransfer + bridgeOtherUnclassified;

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
        accountingBridgeReconciles: Math.abs(activePostedRawCashFlowTotal - bridgeSum) < 0.01
      }
    }
  };
}
