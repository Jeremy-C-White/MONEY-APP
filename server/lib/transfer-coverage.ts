import type { NormalizedTransaction } from './financial';
import { daysBetweenCivilDates } from './time';

export type TransferCoverageReadiness = 'strong' | 'partial' | 'insufficient';

export type TransferCoverageReport = {
  totalInternalTransferRows: number;
  outgoingRows: number;
  incomingRows: number;
  matchedPairs: number;
  ambiguousOutgoingRows: number;
  unmatchedOutgoingRows: number;
  outgoingAmount: number;
  matchedOutgoingAmount: number;
  rowCoverage: number | null;
  amountCoverage: number | null;
  readiness: TransferCoverageReadiness;
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function amountKey(value: number): number {
  return Math.round(Math.abs(value) * 100);
}

/**
 * Measures whether owned-account transfer outflows have a visible inbound leg.
 * It does not infer a destination. A same-distance collision is ambiguous and
 * intentionally remains unmatched.
 */
export function analyzeTransferCoverage(
  transactions: readonly NormalizedTransaction[],
  dateWindowDays = 3
): TransferCoverageReport {
  const rows = transactions.filter(transaction => (
    !transaction.pending &&
    !transaction.removed &&
    transaction.classification === 'internal_transfer' &&
    transaction.cashFlowAmount !== 0
  ));
  const outgoing = rows.filter(transaction => transaction.cashFlowAmount < 0)
    .sort((a, b) => a.normalizedDate.localeCompare(b.normalizedDate));
  const incoming = rows.filter(transaction => transaction.cashFlowAmount > 0);
  const usedIncoming = new Set<string>();
  let matchedPairs = 0;
  let ambiguousOutgoingRows = 0;
  let matchedOutgoingAmount = 0;

  for (const source of outgoing) {
    const candidates = incoming.flatMap(destination => {
      if (
        usedIncoming.has(destination.transactionId) ||
        destination.accountId === source.accountId ||
        amountKey(destination.cashFlowAmount) !== amountKey(source.cashFlowAmount)
      ) return [];
      const rawDistance = daysBetweenCivilDates(
        source.normalizedDate,
        destination.normalizedDate
      );
      if (rawDistance === null) return [];
      const distance = Math.abs(rawDistance);
      return distance <= dateWindowDays
        ? [{ destination, distance }]
        : [];
    }).sort((a, b) => a.distance - b.distance ||
      a.destination.normalizedDate.localeCompare(b.destination.normalizedDate) ||
      a.destination.transactionId.localeCompare(b.destination.transactionId));

    if (!candidates.length) continue;
    const nearest = candidates.filter(candidate => candidate.distance === candidates[0].distance);
    if (nearest.length !== 1) {
      ambiguousOutgoingRows += 1;
      continue;
    }
    usedIncoming.add(nearest[0].destination.transactionId);
    matchedPairs += 1;
    matchedOutgoingAmount += Math.abs(source.cashFlowAmount);
  }

  const outgoingAmount = outgoing.reduce(
    (total, transaction) => total + Math.abs(transaction.cashFlowAmount),
    0
  );
  const rowCoverage = outgoing.length ? matchedPairs / outgoing.length : null;
  const amountCoverage = outgoingAmount ? matchedOutgoingAmount / outgoingAmount : null;
  const comparableCoverage = amountCoverage ?? rowCoverage ?? 0;
  const readiness: TransferCoverageReadiness = comparableCoverage >= 0.7
    ? 'strong'
    : comparableCoverage >= 0.4
      ? 'partial'
      : 'insufficient';

  return {
    totalInternalTransferRows: rows.length,
    outgoingRows: outgoing.length,
    incomingRows: incoming.length,
    matchedPairs,
    ambiguousOutgoingRows,
    unmatchedOutgoingRows: outgoing.length - matchedPairs - ambiguousOutgoingRows,
    outgoingAmount: roundCurrency(outgoingAmount),
    matchedOutgoingAmount: roundCurrency(matchedOutgoingAmount),
    rowCoverage,
    amountCoverage,
    readiness,
  };
}
