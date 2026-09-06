import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction } from './financial';
import {
  SavingsDestinationRequestError,
  buildSavingsContributions,
  buildSavingsDestinationId,
  isSavingsDestinationId,
  parseSavingsDestinationName,
  parseStoredSavingsDestination,
} from './savings-contributions';

const AS_OF = '2026-09-06';

function transfer(
  overrides: Partial<NormalizedTransaction> &
    Pick<NormalizedTransaction, 'transactionId' | 'normalizedDate' | 'name'> &
    { amount?: number }
): NormalizedTransaction {
  const amount = overrides.amount ?? 500;
  return {
    transactionId: overrides.transactionId,
    normalizedDate: overrides.normalizedDate,
    accountId: 'checking-1',
    institutionName: 'Bank',
    accountName: 'Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    rawDate: overrides.normalizedDate,
    name: overrides.name,
    // Plaid supplies no merchant for these ACH descriptions, so the
    // normalized merchant falls back to the raw name.
    normalizedMerchant: overrides.name,
    plaidAmount: amount,
    cashFlowAmount: -amount,
    categoryPrimary: 'TRANSFER_OUT',
    categoryDetailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS',
    normalizedCategory: 'TRANSFER_OUT',
    pending: false,
    pendingTransactionId: '',
    status: 'active',
    removed: false,
    classification: 'investment_transfer',
    countsTowardSpending: false,
    countsTowardIncome: false,
    spendingAdjustment: 0,
    incomeAdjustment: 0,
    isOverridden: false,
    overrideNote: null,
    overrideOffsetCategory: null,
    ...overrides,
  };
}

function income(
  transactionId: string,
  normalizedDate: string,
  amount: number
): NormalizedTransaction {
  return transfer({
    transactionId,
    normalizedDate,
    name: 'VERIZON V3 DIR DEP',
    amount,
    plaidAmount: -amount,
    cashFlowAmount: amount,
    categoryPrimary: 'INCOME',
    categoryDetailed: 'INCOME_SALARY',
    normalizedCategory: 'INCOME',
    classification: 'income',
    countsTowardIncome: true,
    incomeAdjustment: amount,
  });
}

function fsaggtr03(
  index: number,
  date: string,
  amount: number,
  trace: string
): NormalizedTransaction {
  const ymd = date.slice(2).replace(/-/g, '');
  return transfer({
    transactionId: `fsaggtr03-${trace}-${index}`,
    normalizedDate: date,
    name: `2400 FSAGGTR03 INVESTMENT ${ymd} ${trace} JEREMY WHITE`,
    amount,
  });
}

function sofi(index: number, date: string, amount: number): NormalizedTransaction {
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(date.slice(5, 7)) - 1
  ];
  return transfer({
    transactionId: `sofi-${index}`,
    normalizedDate: date,
    name: `SOFI SECURITIES ACH ${month} ${date.slice(8, 10)} ${date.replace(/-/g, '')}72666${index} JEREMY WHITE`,
    amount,
  });
}

/** Biweekly dates starting from a Monday, count occurrences. */
function biweekly(start: string, count: number): string[] {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    new Date(startMs + index * 14 * 86_400_000).toISOString().slice(0, 10)
  );
}

function build(transactions: NormalizedTransaction[], names: [string, string][] = []) {
  return buildSavingsContributions({
    transactions,
    displayNames: new Map(names),
    asOfDate: AS_OF,
  });
}

describe('buildSavingsContributions', () => {
  it('groups transfers that differ only by reference number into one destination', () => {
    const report = build([
      fsaggtr03(1, '2026-06-06', 250, '000000002088697'),
      fsaggtr03(2, '2026-07-06', 250, '000000002088697'),
      fsaggtr03(3, '2026-08-06', 250, '000000002088697'),
      fsaggtr03(4, '2026-09-04', 250, '000000002088697'),
    ]);

    expect(report.destinations).toHaveLength(1);
    expect(report.destinations[0].key).toBe('2400 fsaggtr03 investment');
    expect(report.destinations[0].contributionCount).toBe(4);
    expect(report.destinations[0].totalContributed).toBe(1000);
  });

  it('reports the trace-number split rather than merging it silently', () => {
    const report = build([
      ...['2026-05-06', '2026-06-06', '2026-07-06', '2026-08-06', '2026-09-04'].map((date, index) =>
        fsaggtr03(index, date, 250, '000000002088697')
      ),
      ...['2026-05-20', '2026-06-19', '2026-07-20', '2026-08-20', '2026-09-02'].map((date, index) =>
        fsaggtr03(index + 10, date, 900, '000000002102387')
      ),
    ]);

    const destination = report.destinations[0];
    expect(destination.mergedStreamCount).toBe(2);
    expect(destination.streams.map(stream => stream.reference)).toEqual([
      '000000002102387',
      '000000002088697',
    ]);
    expect(destination.streams[0].typicalAmount).toBe(900);
    expect(destination.streams[1].typicalAmount).toBe(250);
    // The merged total is still the truth about the money.
    expect(destination.totalContributed).toBe(5750);
  });

  it('keeps a single-stream destination at one stream', () => {
    const report = build(biweekly('2026-04-06', 8).map((date, index) => sofi(index, date, 200)));
    expect(report.destinations[0].mergedStreamCount).toBe(1);
    expect(report.destinations[0].streams[0].reference).toBeNull();
  });

  it('does not let a one-off lump sum distort the current monthly rate', () => {
    const dates = biweekly('2026-04-06', 8);
    const withOutlier = dates.map((date, index) =>
      sofi(index, date, index === 6 ? 10_000 : 200)
    );

    const report = build(withOutlier);
    const destination = report.destinations[0];

    expect(destination.cadence).toBe('biweekly');
    // Median of the recent contributions is 200, so the rate is 200 x 26/12.
    expect(destination.currentMonthlyRate).toBe(433.33);
    expect(destination.totalContributed).toBe(11_400);
  });

  it('detects biweekly, twice-monthly and irregular cadences', () => {
    const sofiReport = build(biweekly('2026-04-06', 8).map((date, index) => sofi(index, date, 200)));
    expect(sofiReport.destinations[0].cadence).toBe('biweekly');

    const twiceMonthly = build([
      '2026-05-06', '2026-05-20', '2026-06-05', '2026-06-19',
      '2026-07-06', '2026-07-20', '2026-08-06', '2026-08-20', '2026-09-04',
    ].map((date, index) => fsaggtr03(index, date, 250, '000000002088697')));
    expect(twiceMonthly.destinations[0].cadence).toBe('twice_monthly');

    const uphold = build([
      ['2025-02-11', 500], ['2025-04-28', 1000], ['2025-06-03', 750], ['2025-08-19', 900],
    ].map(([date, amount], index) => transfer({
      transactionId: `uphold-${index}`,
      normalizedDate: String(date),
      name: `Uphold Inc DES:UPHOLD ID:12345678${index}0 INDN:JEREMY WHITE`,
      amount: Number(amount),
    })));
    expect(uphold.destinations[0].cadence).toBe('irregular');
  });

  it('reports a stream that stopped months ago as ended', () => {
    const report = build([
      ['2024-09-15', 400], ['2024-10-15', 400], ['2024-11-15', 400], ['2024-12-15', 400],
      ['2025-01-15', 300], ['2025-02-15', 300], ['2025-03-15', 300],
    ].map(([date, amount], index) => transfer({
      transactionId: `fsagtr1213-${index}`,
      normalizedDate: String(date),
      name: `2400 FSAGTR1213 INVESTMENT ${String(date).slice(2).replace(/-/g, '')} 00000000123456${index} JEREMY WHITE`,
      amount: Number(amount),
    })));

    const destination = report.destinations[0];
    expect(destination.key).toBe('2400 fsagtr1213 investment');
    expect(destination.status).toBe('ended');
    expect(destination.lastContribution).toBe('2025-03-15');
    // An ended stream has no ongoing rate to report.
    expect(destination.currentMonthlyRate).toBeNull();
    expect(destination.totalContributed).toBe(2500);
  });

  it('separates paused from ended', () => {
    const paused = build(['2026-05-06', '2026-06-06', '2026-07-06'].map((date, index) =>
      fsaggtr03(index, date, 250, '000000002088697')
    ));
    expect(paused.destinations[0].status).toBe('paused');

    const active = build(['2026-07-06', '2026-08-06', '2026-09-04'].map((date, index) =>
      fsaggtr03(index, date, 250, '000000002088697')
    ));
    expect(active.destinations[0].status).toBe('active');
  });

  it('surfaces a rate step-down with the month it began', () => {
    const report = build([
      ['2026-02-06', 600], ['2026-03-06', 600], ['2026-04-06', 600], ['2026-05-06', 600],
      ['2026-06-06', 600], ['2026-07-06', 250], ['2026-08-06', 250], ['2026-09-04', 250],
    ].map(([date, amount], index) =>
      fsaggtr03(index, String(date), Number(amount), '000000002088697')
    ));

    expect(report.destinations[0].rateChange).toEqual({
      previousAmount: 600,
      currentAmount: 250,
      changedOnMonth: '2026-07',
    });
  });

  it('reports no rate change when contributions only drift', () => {
    const report = build(biweekly('2026-04-06', 8).map((date, index) =>
      sofi(index, date, index % 2 ? 200 : 205)
    ));
    expect(report.destinations[0].rateChange).toBeNull();
  });

  it('makes a step-down visible in the monthly history', () => {
    const report = build([
      ['2026-06-06', 600], ['2026-07-06', 250], ['2026-08-06', 250], ['2026-09-04', 250],
    ].map(([date, amount], index) =>
      fsaggtr03(index, String(date), Number(amount), '000000002088697')
    ));

    expect(report.destinations[0].monthlyHistory).toEqual([
      { month: '2026-06', amount: 600, count: 1 },
      { month: '2026-07', amount: 250, count: 1 },
      { month: '2026-08', amount: 250, count: 1 },
      { month: '2026-09', amount: 250, count: 1 },
    ]);
  });

  it('buckets contributions on the first and last day of a month correctly', () => {
    const report = build([
      fsaggtr03(1, '2026-08-01', 100, '000000002088697'),
      fsaggtr03(2, '2026-08-31', 100, '000000002088697'),
      fsaggtr03(3, '2026-09-01', 100, '000000002088697'),
      fsaggtr03(4, '2024-02-29', 100, '000000002088697'),
    ]);

    expect(report.destinations[0].monthlyHistory).toEqual([
      { month: '2024-02', amount: 100, count: 1 },
      { month: '2026-08', amount: 200, count: 2 },
      { month: '2026-09', amount: 100, count: 1 },
    ]);
  });

  it('returns a null savings rate when there is no recognized income', () => {
    const report = build(biweekly('2026-04-06', 8).map((date, index) => sofi(index, date, 200)));

    expect(report.totals.currentMonthlyRate).toBe(433.33);
    expect(report.totals.savingsRateOfIncome).toBeNull();
    expect(report.totals.incomeConsidered).toBe(0);
  });

  it('computes the savings rate as a fraction of recognized income', () => {
    const contributions = biweekly('2026-04-06', 8).map((date, index) => sofi(index, date, 200));
    const paychecks = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
      .map((month, index) => income(`pay-${index}`, `${month}-15`, 5000));

    const report = build([...contributions, ...paychecks]);

    // 433.33 per month against 30000 / 6 = 5000 per month.
    expect(report.totals.savingsRateOfIncome).toBeCloseTo(0.0867, 4);
    expect(report.totals.incomeConsidered).toBe(30_000);
  });

  it('ignores pending, removed, incoming and non-investment transactions', () => {
    const report = build([
      fsaggtr03(1, '2026-09-01', 250, '000000002088697'),
      transfer({ transactionId: 'pending', normalizedDate: '2026-09-02', name: 'SOFI SECURITIES ACH Sep 02 20260902726664 X', pending: true }),
      transfer({ transactionId: 'removed', normalizedDate: '2026-09-02', name: 'SOFI SECURITIES ACH Sep 02 20260902726665 X', removed: true }),
      transfer({
        transactionId: 'withdrawal',
        normalizedDate: '2026-09-03',
        name: 'SOFI SECURITIES ACH Sep 03 20260903726666 X',
        amount: 400,
        cashFlowAmount: 400,
      }),
      transfer({
        transactionId: 'grocery',
        normalizedDate: '2026-09-03',
        name: 'KROGER 123',
        classification: 'spending',
        countsTowardSpending: true,
        spendingAdjustment: 80,
      }),
    ]);

    expect(report.destinations).toHaveLength(1);
    expect(report.totals.contributionCount).toBe(1);
    expect(report.totals.totalContributed).toBe(250);
  });

  it('accounts for every contribution across destinations', () => {
    const transactions = [
      ...biweekly('2026-04-06', 8).map((date, index) => sofi(index, date, 200)),
      ...['2026-07-06', '2026-08-06', '2026-09-04'].map((date, index) =>
        fsaggtr03(index, date, 250, '000000002088697')
      ),
    ];
    const report = build(transactions);

    const expected = transactions.reduce((sum, t) => sum + Math.abs(t.cashFlowAmount), 0);
    const summed = report.destinations.reduce((sum, d) => sum + d.totalContributed, 0);

    expect(summed).toBe(expected);
    expect(report.totals.totalContributed).toBe(expected);
    expect(report.totals.contributionCount).toBe(transactions.length);
  });

  it('uses the owner name when set and falls back to the raw prefix otherwise', () => {
    const transactions = ['2026-07-06', '2026-08-06', '2026-09-04'].map((date, index) =>
      fsaggtr03(index, date, 250, '000000002088697')
    );

    const unnamed = build(transactions);
    expect(unnamed.destinations[0].displayName).toBe('2400 fsaggtr03 investment');
    expect(unnamed.destinations[0].isNamed).toBe(false);

    const named = build(transactions, [['2400 fsaggtr03 investment', 'College Savings']]);
    expect(named.destinations[0].displayName).toBe('College Savings');
    expect(named.destinations[0].isNamed).toBe(true);
  });

  it('sorts destinations by current monthly rate, ended streams last', () => {
    const report = build([
      ...biweekly('2026-04-06', 8).map((date, index) => sofi(index, date, 200)),
      ...['2026-07-06', '2026-08-06', '2026-09-04'].map((date, index) =>
        fsaggtr03(index, date, 900, '000000002088697')
      ),
      ...['2024-09-15', '2024-10-15', '2024-11-15'].map((date, index) => transfer({
        transactionId: `ended-${index}`,
        normalizedDate: date,
        name: `2400 FSAGTR1213 INVESTMENT ${date.slice(2).replace(/-/g, '')} 00000000123456${index} X`,
        amount: 400,
      })),
    ]);

    expect(report.destinations.map(destination => destination.key)).toEqual([
      '2400 fsaggtr03 investment',
      'sofi securities ach',
      '2400 fsagtr1213 investment',
    ]);
    expect(report.destinations.at(-1)?.status).toBe('ended');
  });

  it('returns an empty report when there are no contributions', () => {
    const report = build([]);
    expect(report.destinations).toEqual([]);
    expect(report.totals.totalContributed).toBe(0);
    expect(report.totals.currentMonthlyRate).toBeNull();
    expect(report.totals.savingsRateOfIncome).toBeNull();
  });

  it('rejects an invalid as-of date', () => {
    expect(() => buildSavingsContributions({
      transactions: [],
      displayNames: new Map(),
      asOfDate: 'September',
    })).toThrow(/valid as-of date/);
  });
});

describe('savings destination naming', () => {
  it('derives a stable storage-safe id from a key', () => {
    const id = buildSavingsDestinationId('2400 fsaggtr03 investment');
    expect(id).toMatch(/^[a-f0-9]{24}$/);
    expect(buildSavingsDestinationId('2400 fsaggtr03 investment')).toBe(id);
    expect(buildSavingsDestinationId('sofi securities ach')).not.toBe(id);
  });

  it('keeps a key containing punctuation out of the id', () => {
    expect(buildSavingsDestinationId('uphold inc des:uphold')).toMatch(/^[a-f0-9]{24}$/);
    expect(buildSavingsDestinationId('a/b')).toMatch(/^[a-f0-9]{24}$/);
  });

  it('recognizes a well-formed destination id', () => {
    expect(isSavingsDestinationId(buildSavingsDestinationId('x'))).toBe(true);
    expect(isSavingsDestinationId('2400 fsaggtr03 investment')).toBe(false);
    expect(isSavingsDestinationId('')).toBe(false);
  });

  it('accepts and tidies a display name', () => {
    expect(parseSavingsDestinationName({ displayName: '  College   Savings ' }))
      .toBe('College Savings');
  });

  it('rejects an empty, oversized or non-string name', () => {
    expect(() => parseSavingsDestinationName({ displayName: '   ' }))
      .toThrow(SavingsDestinationRequestError);
    expect(() => parseSavingsDestinationName({ displayName: 'x'.repeat(61) }))
      .toThrow(SavingsDestinationRequestError);
    expect(() => parseSavingsDestinationName({ displayName: 42 }))
      .toThrow(SavingsDestinationRequestError);
    expect(() => parseSavingsDestinationName(null))
      .toThrow(SavingsDestinationRequestError);
  });

  it('ignores a malformed stored naming row', () => {
    expect(parseStoredSavingsDestination({ key: 'k', displayName: 'College Savings' }))
      .toEqual({ key: 'k', displayName: 'College Savings' });
    expect(parseStoredSavingsDestination({ key: 'k' })).toBeNull();
    expect(parseStoredSavingsDestination({ displayName: 'n' })).toBeNull();
    expect(parseStoredSavingsDestination(null)).toBeNull();
  });
});
