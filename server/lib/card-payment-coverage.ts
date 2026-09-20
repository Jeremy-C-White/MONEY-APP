import type { NormalizedTransaction } from './financial';
import { buildMerchantKeyForTransaction } from './merchant-prefix';
import { daysBetweenCivilDates } from './time';

type CardPaymentTransaction = NormalizedTransaction & { merchantKey?: string | null };

export type CardPaymentCoverageMetric = {
  transactionCount: number;
  amount: number;
  payees: string[];
};

export type CardPaymentCoverage = {
  withoutPurchaseDetail: CardPaymentCoverageMetric;
  beforeLinkedHistory: CardPaymentCoverageMetric;
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function amountKey(value: number): number {
  return Math.round(Math.abs(value) * 100);
}

function payeeKey(transaction: CardPaymentTransaction): string | null {
  return transaction.merchantKey || buildMerchantKeyForTransaction(transaction);
}

function payeeLabel(transaction: CardPaymentTransaction, key: string): string {
  const value = transaction.normalizedMerchant.trim() || transaction.name.trim() || key;
  if (value === value.toUpperCase() || value === value.toLowerCase()) {
    return value.toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
  }
  return value;
}

function metric(
  transactions: CardPaymentTransaction[],
  labelsByKey: Map<string, string>
): CardPaymentCoverageMetric {
  const payees = new Set<string>();
  for (const transaction of transactions) {
    const key = payeeKey(transaction);
    payees.add(key ? labelsByKey.get(key) || key : 'Unknown card payee');
  }
  return {
    transactionCount: transactions.length,
    amount: roundCurrency(transactions.reduce((total, transaction) => total + Math.abs(transaction.cashFlowAmount), 0)),
    payees: [...payees].sort((left, right) => left.localeCompare(right)),
  };
}

/**
 * Uses matching card-payment rows anywhere in the available ledger to learn
 * which payees belong to linked cards. Reporting totals are then restricted to
 * the requested window. This prevents payments made before a newly connected
 * card's available history from being mislabeled as an unlinked-card gap.
 */
export function analyzeCardPaymentCoverage(input: {
  transactions: readonly CardPaymentTransaction[];
  startDate: string;
  endDate: string;
  dateWindowDays?: number;
}): CardPaymentCoverage {
  const dateWindowDays = input.dateWindowDays ?? 3;
  const active = input.transactions.filter(transaction => !transaction.pending && !transaction.removed);
  const sources = active.filter(transaction => (
    transaction.classification === 'credit_card_payment' &&
    transaction.cashFlowAmount < 0 &&
    transaction.accountType.toLowerCase() !== 'credit'
  )).sort((left, right) => (
    left.normalizedDate.localeCompare(right.normalizedDate) ||
    left.transactionId.localeCompare(right.transactionId)
  ));
  const counterparts = active.filter(transaction => (
    transaction.classification === 'credit_card_payment' &&
    transaction.accountType.toLowerCase() === 'credit'
  ));
  const usedCounterparts = new Set<string>();
  const matchedSourceIds = new Set<string>();
  const linkedAccountsByPayee = new Map<string, Set<string>>();
  const labelsByKey = new Map<string, string>();

  for (const source of sources) {
    const key = payeeKey(source);
    if (key && !labelsByKey.has(key)) labelsByKey.set(key, payeeLabel(source, key));
    const candidates = counterparts.flatMap(counterpart => {
      if (
        usedCounterparts.has(counterpart.transactionId) ||
        counterpart.accountId === source.accountId ||
        amountKey(counterpart.cashFlowAmount) !== amountKey(source.cashFlowAmount)
      ) return [];
      const distance = Math.abs(daysBetweenCivilDates(source.normalizedDate, counterpart.normalizedDate) ?? Infinity);
      return distance <= dateWindowDays ? [{ counterpart, distance }] : [];
    }).sort((left, right) => (
      left.distance - right.distance ||
      left.counterpart.normalizedDate.localeCompare(right.counterpart.normalizedDate) ||
      left.counterpart.transactionId.localeCompare(right.counterpart.transactionId)
    ));
    if (!key || candidates.length === 0) continue;
    const nearest = candidates.filter(candidate => candidate.distance === candidates[0].distance);
    if (nearest.length !== 1) continue;
    const counterpart = nearest[0].counterpart;
    usedCounterparts.add(counterpart.transactionId);
    matchedSourceIds.add(source.transactionId);
    const accounts = linkedAccountsByPayee.get(key) || new Set<string>();
    accounts.add(counterpart.accountId);
    linkedAccountsByPayee.set(key, accounts);
  }

  const earliestDateByAccount = new Map<string, string>();
  for (const transaction of active) {
    const previous = earliestDateByAccount.get(transaction.accountId);
    if (!previous || transaction.normalizedDate < previous) {
      earliestDateByAccount.set(transaction.accountId, transaction.normalizedDate);
    }
  }
  const reportingSources = sources.filter(transaction => (
    transaction.normalizedDate >= input.startDate && transaction.normalizedDate <= input.endDate
  ));
  const withoutPurchaseDetail = reportingSources.filter(transaction => {
    const key = payeeKey(transaction);
    return !key || !linkedAccountsByPayee.has(key);
  });
  const beforeLinkedHistory = reportingSources.filter(transaction => {
    if (matchedSourceIds.has(transaction.transactionId)) return false;
    const key = payeeKey(transaction);
    const linkedAccounts = key ? linkedAccountsByPayee.get(key) : undefined;
    if (!linkedAccounts?.size) return false;
    const firstLinkedHistoryDate = [...linkedAccounts]
      .map(accountId => earliestDateByAccount.get(accountId))
      .filter((date): date is string => Boolean(date))
      .sort()[0];
    return Boolean(firstLinkedHistoryDate && transaction.normalizedDate < firstLinkedHistoryDate);
  });

  return {
    withoutPurchaseDetail: metric(withoutPurchaseDetail, labelsByKey),
    beforeLinkedHistory: metric(beforeLinkedHistory, labelsByKey),
  };
}
