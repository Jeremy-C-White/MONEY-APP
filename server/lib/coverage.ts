import { addCivilDays, resolveInsightPeriod } from './insight-periods';
import type { EnrichedTransaction } from './transaction-enrichment';

type CoverageAccount = {
  accountId: string;
  institutionName: string;
  accountName: string;
  source: 'linked' | 'manual';
  health: string;
  balanceStatus: 'fresh' | 'stale' | 'missing';
  accountType?: string;
  accountSubtype?: string;
};

export type CoverageMetric = { transactionCount: number; amount: number };

export type CoverageReport = {
  period: { startDate: string; endDate: string };
  lowConfidence: CoverageMetric;
  personToPerson: CoverageMetric;
  cardPayments: CoverageMetric;
  accountIssues: {
    accountCount: number;
    accounts: Array<{ accountId: string; label: string; reason: 'connection' | 'stale' | 'missing' | 'activity' }>;
  };
};

const CONNECTION_ISSUES = new Set(['login_required', 'permission_revoked', 'pending_disconnect', 'unknown']);

export function buildCoverageReport(input: {
  transactions: EnrichedTransaction[];
  accounts: CoverageAccount[];
  asOfDate: string;
}): CoverageReport {
  const period = resolveInsightPeriod('last_12_months', input.asOfDate).currentPeriod;
  const lastActivityByAccount = new Map<string, string>();
  for (const transaction of input.transactions) {
    if (transaction.pending || transaction.removed) continue;
    const previous = lastActivityByAccount.get(transaction.accountId);
    if (!previous || transaction.normalizedDate > previous) {
      lastActivityByAccount.set(transaction.accountId, transaction.normalizedDate);
    }
  }
  const activityCutoff = addCivilDays(input.asOfDate, -60);
  const transactions = input.transactions.filter(transaction => (
    !transaction.pending &&
    !transaction.removed &&
    transaction.normalizedDate >= period.startDate &&
    transaction.normalizedDate <= period.endDate
  ));
  const lowConfidenceTransactions = transactions.filter(transaction => (
    transaction.countsTowardSpending &&
    transaction.categoryConfidence === 'LOW' &&
    !transaction.householdLabel
  ));
  const personToPersonTransactions = transactions.filter(transaction => (
    transaction.classification === 'person_to_person' && transaction.cashFlowAmount < 0
  ));
  const cardPaymentTransactions = transactions.filter(transaction => (
    transaction.classification === 'credit_card_payment' && transaction.cashFlowAmount < 0
  ));
  const metric = (matches: EnrichedTransaction[], amount: (transaction: EnrichedTransaction) => number): CoverageMetric => ({
    transactionCount: matches.length,
    amount: matches.reduce((total, transaction) => total + amount(transaction), 0),
  });
  const accountIssues = input.accounts.flatMap(account => {
    if (account.source !== 'linked') return [];
    const lastActivity = lastActivityByAccount.get(account.accountId);
    const expectsRegularActivity = account.accountType === 'credit' || ['checking', 'credit card'].includes(account.accountSubtype || '');
    const reason = CONNECTION_ISSUES.has(account.health)
      ? 'connection' as const
      : account.balanceStatus === 'stale'
        ? 'stale' as const
        : account.balanceStatus === 'missing'
          ? 'missing' as const
          : expectsRegularActivity && lastActivity && lastActivity < activityCutoff
            ? 'activity' as const
            : null;
    return reason ? [{
      accountId: account.accountId,
      label: `${account.institutionName} ${account.accountName}`.trim(),
      reason,
    }] : [];
  });

  return {
    period,
    lowConfidence: metric(lowConfidenceTransactions, transaction => transaction.spendingAdjustment),
    personToPerson: metric(personToPersonTransactions, transaction => -transaction.cashFlowAmount),
    cardPayments: metric(cardPaymentTransactions, transaction => -transaction.cashFlowAmount),
    accountIssues: { accountCount: accountIssues.length, accounts: accountIssues },
  };
}
