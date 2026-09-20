import { matchesCashBackReward, type NormalizedTransaction } from './financial';

export type RewardsYtdReport = {
  amount: number;
  transactionCount: number;
  startDate: string;
  endDate: string;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isCashBackRewardTransaction(transaction: NormalizedTransaction): boolean {
  return !transaction.pending &&
    !transaction.removed &&
    transaction.cashFlowAmount > 0 &&
    transaction.classification === 'income' &&
    !transaction.categoryDetailed.includes('REFUND') &&
    matchesCashBackReward(transaction.name, transaction.normalizedMerchant);
}

export function buildRewardsYtd(
  transactions: NormalizedTransaction[],
  asOfDate: string
): RewardsYtdReport {
  const startDate = `${asOfDate.slice(0, 4)}-01-01`;
  const rewards = transactions.filter(transaction => (
    transaction.normalizedDate >= startDate &&
    transaction.normalizedDate <= asOfDate &&
    isCashBackRewardTransaction(transaction)
  ));

  return {
    amount: roundMoney(rewards.reduce((sum, transaction) => sum + transaction.cashFlowAmount, 0)),
    transactionCount: rewards.length,
    startDate,
    endDate: asOfDate,
  };
}
