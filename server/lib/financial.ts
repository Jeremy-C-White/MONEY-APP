export function parsePendingValue(value: string | boolean | undefined | null): boolean {
  if (typeof value === 'boolean') return value;
  const str = String(value || '').trim().toLowerCase();
  return str === 'true' || str === 'yes';
}

export const CLASSIFICATIONS = [
  'spending',
  'income',
  'internal_transfer',
  'investment_transfer',
  'cash_withdrawal',
  'person_to_person',
  'credit_card_payment',
  'refund',
  'merchant_credit',
  'interest_earned',
  'interest_paid',
  'bank_fee',
  'unclassified_deposit',
  'zero_amount',
  'pending',
  'removed',
  'other',
] as const;

export type Classification = typeof CLASSIFICATIONS[number];

export type TransactionOverride = {
  classification: Classification;
  offsetCategory: string | null;
  note: string | null;
  reviewedAt?: unknown;
  reviewedBy?: string;
};

export function isClassification(value: unknown): value is Classification {
  return typeof value === 'string' && CLASSIFICATIONS.includes(value as Classification);
}

export type ClassificationAdjustments = {
  countsTowardSpending: boolean;
  countsTowardIncome: boolean;
  spendingAdjustment: number;
  incomeAdjustment: number;
};

export function getClassificationAdjustments(
  classification: Classification,
  cashFlowAmount: number
): ClassificationAdjustments {
  switch (classification) {
    case 'spending':
    case 'interest_paid':
    case 'bank_fee':
      return {
        countsTowardSpending: true,
        countsTowardIncome: false,
        spendingAdjustment: -cashFlowAmount,
        incomeAdjustment: 0,
      };
    case 'refund':
    case 'merchant_credit':
      return {
        countsTowardSpending: true,
        countsTowardIncome: false,
        spendingAdjustment: -cashFlowAmount,
        incomeAdjustment: 0,
      };
    case 'income':
    case 'interest_earned':
      return {
        countsTowardSpending: false,
        countsTowardIncome: true,
        spendingAdjustment: 0,
        incomeAdjustment: cashFlowAmount,
      };
    case 'person_to_person':
      if (cashFlowAmount < 0) {
        return {
          countsTowardSpending: true,
          countsTowardIncome: false,
          spendingAdjustment: -cashFlowAmount,
          incomeAdjustment: 0,
        };
      }
      break;
  }

  return {
    countsTowardSpending: false,
    countsTowardIncome: false,
    spendingAdjustment: 0,
    incomeAdjustment: 0,
  };
}

export type NormalizedTransaction = {
  transactionId: string;
  accountId: string;
  institutionName: string;
  accountName: string;
  accountMask: string;
  accountType: string;
  accountSubtype: string;
  rawDate: string; // From spreadsheet serial
  normalizedDate: string; // YYYY-MM-DD
  name: string;
  normalizedMerchant: string;
  plaidAmount: number;
  cashFlowAmount: number;
  categoryPrimary: string;
  categoryDetailed: string;
  normalizedCategory: string;
  pending: boolean;
  pendingTransactionId: string;
  status: string;
  removed: boolean;
  classification: Classification;
  countsTowardSpending: boolean;
  countsTowardIncome: boolean;
  spendingAdjustment: number;
  incomeAdjustment: number;
  isOverridden: boolean;
  overrideNote: string | null;
  overrideOffsetCategory: string | null;
};

// Google Sheets dates are days since Dec 30, 1899
export function serialDateToYYYYMMDD(serial: number | string): string {
  const serialNum = typeof serial === 'string' ? parseFloat(serial) : serial;
  if (isNaN(serialNum)) return String(serial);
  
  // Dec 30 1899 is 2209161600000 milliseconds before Unix Epoch
  // 1 day = 86400000 ms
  const excelEpoch = Date.UTC(1899, 11, 30);
  const ms = excelEpoch + Math.round(serialNum * 86400000);
  const d = new Date(ms);
  
  // Format as YYYY-MM-DD
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
}

export function classifyTransaction(row: any[]): NormalizedTransaction {
  const txId = row[0] || '';
  const dateSerial = row[8] || '';
  const normalizedDate = serialDateToYYYYMMDD(dateSerial);
  
  const rawPlaidAmt = parseFloat(row[13] || '0');
  const plaidAmount = isNaN(rawPlaidAmt) ? 0 : rawPlaidAmt;
  
  const rawCashFlowAmt = parseFloat(row[14] || '0');
  const cashFlowAmount = isNaN(rawCashFlowAmt) ? 0 : rawCashFlowAmt;
  
  const isPending = parsePendingValue(row[20]);
  
  const status = String(row[22] || '').toLowerCase();
  const isRemoved = status === 'removed' || !!row[23];
  
  const catPrimary = String(row[16] || '');
  const catDetailed = String(row[17] || '');
  
  const merchantName = String(row[11] || '');
  const name = String(row[10] || '');
  const normalizedMerchant = merchantName ? merchantName : name;
  let normalizedCategory = catPrimary || 'UNCATEGORIZED';

  let classification: Classification = 'other';
  
  const originalDescription = String(row[12] || '');
  const combinedDescLower = (name + ' ' + merchantName + ' ' + originalDescription).toLowerCase();

  const descLower = name.toLowerCase() + ' ' + merchantName.toLowerCase();
  const hasRefundEvidence = catDetailed.includes('REFUND') || 
                            descLower.includes('refund') || 
                            descLower.includes('return') || 
                            descLower.includes('reversal');

  const accountType = String(row[6] || '').toLowerCase();
  const accountSubtype = String(row[7] || '').toLowerCase();

  const isVisaDirectP2P = cashFlowAmount < 0 &&
    catPrimary === 'TRANSFER_OUT' &&
    catDetailed === 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS' &&
    /money transfer authorized.*visa direct/.test(combinedDescLower);

  const isP2P = catDetailed.includes('MONEY_SEND') || descLower.includes('venmo') || descLower.includes('zelle') || descLower.includes('cash app') || descLower.includes('paypal') || isVisaDirectP2P;

  const isInvestmentTransfer = cashFlowAmount < 0 &&
    catPrimary === 'TRANSFER_OUT' &&
    catDetailed === 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS';

  const isConfirmedInternalTransfer =
    catDetailed === 'TRANSFER_OUT_ACCOUNT_TRANSFER' ||
    catDetailed === 'TRANSFER_IN_ACCOUNT_TRANSFER' ||
    ((catPrimary === 'TRANSFER_IN' || catPrimary === 'TRANSFER_OUT') &&
      (
        /save as you go transfer (debit to|credit from)/.test(combinedDescLower) ||
        (cashFlowAmount < 0 && /apple gs savings transfer/.test(combinedDescLower)) ||
        /nfcu acctverify/.test(combinedDescLower)
      ));
  
  const isInterest = cashFlowAmount > 0 && 
    (catDetailed.includes('INTEREST_EARNED') || catDetailed.includes('DIVIDEND') || 
    ((accountType === 'depository' || accountSubtype === 'savings' || accountSubtype === 'cd') && 
    (descLower.includes('interest') || descLower.includes('intrst') || descLower.includes('interest payment') || descLower.includes('interest paid'))));

  const isCCPayment = (catPrimary === 'LOAN_PAYMENTS' && catDetailed.includes('CREDIT_CARD')) ||
    ((accountType === 'credit' || accountSubtype.includes('credit card')) && 
     (/automatic payment/.test(combinedDescLower) || 
      /payment[\s\-]*thank/.test(combinedDescLower) || 
      /card payment/.test(combinedDescLower) || 
      /credit card payment/.test(combinedDescLower)));

  // A PayPal balance load is money moving between the owner's connected
  // accounts. The PayPal brand alone normally suggests a P2P channel, but the
  // explicit ADD TO BALANCE wording and transfer category are stronger evidence
  // that this is not consumption.
  const isPayPalBalanceLoad = cashFlowAmount < 0 &&
    accountType === 'depository' &&
    catPrimary === 'TRANSFER_OUT' &&
    catDetailed === 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS' &&
    combinedDescLower.includes('paypal') &&
    combinedDescLower.includes('add to balance');

  const isEarnedIncome = cashFlowAmount > 0 && accountType === 'depository' &&
    (
      catPrimary === 'INCOME' ||
      /\b(payroll|direct deposit|direct dep|salary|wages|paycheck|pay check|gusto|adp|paychex|trinet|intuit payroll)\b/.test(combinedDescLower)
    );

  // IRS/state tax refunds are income, not a reduction of gross spending: they
  // don't attach to any spending category, so treating them as 'refund' left
  // every category's Refunds column at $0 while the bridge silently
  // subtracted the total. Must be checked before hasRefundEvidence below,
  // since catDetailed here also contains the substring "REFUND".
  const isIncomeTaxRefund = cashFlowAmount > 0 && catDetailed === 'INCOME_TAX_REFUND';

  // Credit card cash-back rewards read as plain unclassified inflows
  // (OTHER_OTHER) with no other signal tying them to income.
  const isCashBackReward = cashFlowAmount > 0 &&
    (combinedDescLower.includes('cash reward') ||
      combinedDescLower.includes('cashback') ||
      combinedDescLower.includes('cash back'));

  // TRANSFER_IN_DEPOSIT establishes how money entered the account, not its
  // economic purpose. Keep these deposits grouped for review without
  // assuming they are income, reimbursements, gifts, or internal transfers.
  const isUnclassifiedDeposit = cashFlowAmount > 0 &&
    accountType === 'depository' &&
    catDetailed === 'TRANSFER_IN_DEPOSIT';

  if (isRemoved) {
    classification = 'removed';
  } else if (cashFlowAmount === 0) {
    // A zero-dollar row has no economic effect. Keep it visible in Posted,
    // but do not ask the household to make a meaningless review decision.
    classification = 'zero_amount';
  } else if (isInterest) {
    classification = 'interest_earned';
  } else if (isCCPayment) {
    // Plaid's explicit credit-card-payment category is stronger evidence than
    // provider keywords such as "PayPal" in an account or transaction name.
    classification = 'credit_card_payment';
  } else if (isPayPalBalanceLoad) {
    classification = 'internal_transfer';
  } else if (isP2P) {
    classification = 'person_to_person';
  } else if (isIncomeTaxRefund) {
    classification = 'income';
    normalizedCategory = 'INCOME';
  } else if (cashFlowAmount > 0 && hasRefundEvidence) {
    classification = 'refund';
  } else if (catDetailed === 'TRANSFER_OUT_WITHDRAWAL') {
    // Policy: Cash withdrawals do not count toward spending immediately because withdrawal does not prove final cash consumption
    classification = 'cash_withdrawal';
  } else if (isEarnedIncome) {
    classification = 'income';
    normalizedCategory = 'INCOME';
  } else if (isCashBackReward) {
    classification = 'income';
    normalizedCategory = 'INCOME';
  } else if (isInvestmentTransfer) {
    classification = 'investment_transfer';
  } else if (isConfirmedInternalTransfer) {
    classification = 'internal_transfer';
  } else if (isUnclassifiedDeposit) {
    classification = 'unclassified_deposit';
  } else if (catPrimary === 'TRANSFER_IN' || catPrimary === 'TRANSFER_OUT') {
    classification = 'other';
  } else if (cashFlowAmount < 0 && catDetailed.includes('INTEREST_CHARGE')) {
    classification = 'interest_paid';
  } else if (cashFlowAmount < 0 && catDetailed.includes('FEE')) {
    classification = 'bank_fee';
  } else if (cashFlowAmount > 0) {
    classification = 'other';
  } else if (cashFlowAmount < 0) {
    classification = 'spending';
  }

  const adjustments = getClassificationAdjustments(classification, cashFlowAmount);

  return {
    transactionId: txId,
    accountId: String(row[1] || ''),
    institutionName: String(row[3] || ''),
    accountName: String(row[4] || ''),
    accountMask: String(row[5] || ''),
    accountType: String(row[6] || ''),
    accountSubtype: String(row[7] || ''),
    rawDate: String(dateSerial),
    normalizedDate,
    name,
    normalizedMerchant,
    plaidAmount,
    cashFlowAmount,
    categoryPrimary: catPrimary,
    categoryDetailed: catDetailed,
    normalizedCategory,
    pending: isPending,
    pendingTransactionId: String(row[21] || ''),
    status: status,
    removed: isRemoved,
    classification: isRemoved ? 'removed' : classification, // Removed overrides
    ...adjustments,
    isOverridden: false,
    overrideNote: null,
    overrideOffsetCategory: null,
  };
}

export function applyTransactionOverride(
  transaction: NormalizedTransaction,
  override: TransactionOverride | undefined
): NormalizedTransaction {
  if (!override || transaction.pending || transaction.removed) return transaction;

  return {
    ...transaction,
    classification: override.classification,
    ...getClassificationAdjustments(override.classification, transaction.cashFlowAmount),
    isOverridden: true,
    overrideNote: override.note,
    overrideOffsetCategory: override.classification === 'refund'
      ? override.offsetCategory
      : null,
  };
}

export function deduplicateAndNormalizeTransactions(
  rawRows: any[][],
  overrides: Map<string, TransactionOverride> = new Map()
): NormalizedTransaction[] {
  // Ignore header row if passed (checking if row[0] === 'Transaction ID')
  const dataRows = rawRows.filter(r => r[0] !== 'Transaction ID');
  const allTx = dataRows.map(row => {
    const transaction = classifyTransaction(row);
    return applyTransactionOverride(transaction, overrides.get(transaction.transactionId));
  });
  
  const postedTxWithPendingId = allTx.filter(t => !t.pending && !t.removed && t.pendingTransactionId);
  const supersededPendingIds = new Set(postedTxWithPendingId.map(t => t.pendingTransactionId));
  
  const deduplicatedTx = allTx.map(t => {
    if (t.pending && supersededPendingIds.has(t.transactionId)) {
      return {
        ...t,
        classification: 'removed' as Classification,
        removed: true,
        countsTowardSpending: false,
        countsTowardIncome: false,
        spendingAdjustment: 0,
        incomeAdjustment: 0,
        isOverridden: false,
        overrideNote: null,
        overrideOffsetCategory: null,
      };
    }
    return t;
  });

  // Second pass: Context-aware merchant credit detection
  const merchantCategorySpendingSet = new Set<string>();
  
  for (const t of deduplicatedTx) {
    if (!t.removed && !t.pending && t.classification === 'spending' && t.spendingAdjustment > 0 && t.normalizedMerchant) {
      merchantCategorySpendingSet.add(`${t.normalizedMerchant}|${t.normalizedCategory}`);
    }
  }

  return deduplicatedTx.map(t => {
    if (!t.removed && !t.pending && t.cashFlowAmount > 0) {
      if (!t.isOverridden && t.classification === 'other') {
        const strictKey = `${t.normalizedMerchant}|${t.normalizedCategory}`;
        if (t.normalizedMerchant && merchantCategorySpendingSet.has(strictKey)) {
          return {
            ...t,
            classification: 'merchant_credit' as Classification,
            ...getClassificationAdjustments('merchant_credit', t.cashFlowAmount)
          };
        }
      }
    }
    return t;
  });
}
