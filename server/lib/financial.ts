export type Classification = 
  'spending' | 
  'income' | 
  'internal_transfer' | 
  'cash_withdrawal' |
  'person_to_person' |
  'credit_card_payment' | 
  'refund' | 
  'merchant_credit' |
  'interest_earned' | 
  'interest_paid' |
  'bank_fee' |
  'pending' | 
  'removed' | 
  'other';

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
  
  const isPendingStr = String(row[20] || '').toLowerCase();
  const isPending = isPendingStr === 'true' || isPendingStr === 'yes';
  
  const status = String(row[22] || '').toLowerCase();
  const isRemoved = status === 'removed' || !!row[23];
  
  const catPrimary = String(row[16] || '');
  const catDetailed = String(row[17] || '');
  
  const merchantName = String(row[11] || '');
  const name = String(row[10] || '');
  const normalizedMerchant = merchantName ? merchantName : name;
  const normalizedCategory = catPrimary || 'UNCATEGORIZED';

  let classification: Classification = 'other';
  let countsTowardSpending = false;
  let countsTowardIncome = false;
  let spendingAdjustment = 0;
  let incomeAdjustment = 0;
  
  const descLower = name.toLowerCase() + ' ' + merchantName.toLowerCase();
  const hasRefundEvidence = catDetailed.includes('REFUND') || 
                            descLower.includes('refund') || 
                            descLower.includes('return') || 
                            descLower.includes('reversal');

  const accountType = String(row[6] || '').toLowerCase();
  const accountSubtype = String(row[7] || '').toLowerCase();

  const isP2P = catDetailed.includes('MONEY_SEND') || descLower.includes('venmo') || descLower.includes('zelle') || descLower.includes('cash app') || descLower.includes('paypal');
  
  const isInterest = cashFlowAmount > 0 && 
    (catDetailed.includes('INTEREST_EARNED') || catDetailed.includes('DIVIDEND') || 
    ((accountType === 'depository' || accountSubtype === 'savings' || accountSubtype === 'cd') && 
    (descLower.includes('interest') || descLower.includes('intrst') || descLower.includes('interest payment') || descLower.includes('interest paid'))));

  const isCCPayment = (catPrimary === 'LOAN_PAYMENTS' && catDetailed.includes('CREDIT_CARD')) ||
    ((accountType === 'credit' || accountSubtype.includes('credit card')) && 
    (descLower.includes('automatic payment') || descLower.includes('payment - thank') || descLower.includes('card payment') || descLower.includes('credit card payment')));

  if (isRemoved) {
    classification = 'removed';
  } else if (isInterest) {
    classification = 'interest_earned';
    countsTowardIncome = true;
    incomeAdjustment = cashFlowAmount;
  } else if (isP2P) {
    classification = 'person_to_person';
    if (cashFlowAmount < 0) {
      countsTowardSpending = true;
      spendingAdjustment = -cashFlowAmount;
    } else if (cashFlowAmount > 0) {
      // Policy: Incoming P2P is deliberately NOT recognized household income by default
      countsTowardIncome = false;
      countsTowardSpending = false;
    }
  } else if (catDetailed === 'TRANSFER_OUT_WITHDRAWAL') {
    // Policy: Cash withdrawals do not count toward spending immediately because withdrawal does not prove final cash consumption
    classification = 'cash_withdrawal';
    countsTowardSpending = false;
    countsTowardIncome = false;
  } else if (catDetailed === 'TRANSFER_OUT_ACCOUNT_TRANSFER' || catDetailed === 'TRANSFER_IN_ACCOUNT_TRANSFER') {
    classification = 'internal_transfer';
  } else if (isCCPayment) {
    classification = 'credit_card_payment';
    countsTowardSpending = false;
    countsTowardIncome = false;
  } else if (catPrimary === 'TRANSFER_IN' || catPrimary === 'TRANSFER_OUT') {
    classification = 'other';
  } else if (cashFlowAmount > 0 && catPrimary === 'INCOME') {
    classification = 'income';
    countsTowardIncome = true;
    incomeAdjustment = cashFlowAmount;
  } else if (cashFlowAmount < 0 && catDetailed.includes('INTEREST_CHARGE')) {
    classification = 'interest_paid';
    countsTowardSpending = true;
    spendingAdjustment = -cashFlowAmount;
  } else if (cashFlowAmount < 0 && catDetailed.includes('FEE')) {
    classification = 'bank_fee';
    countsTowardSpending = true;
    spendingAdjustment = -cashFlowAmount;
  } else if (cashFlowAmount > 0 && hasRefundEvidence) {
    classification = 'refund';
    countsTowardSpending = true;
    spendingAdjustment = -cashFlowAmount; // Refund reduces spending, so it's a negative spending adjustment
  } else if (cashFlowAmount > 0) {
    classification = 'other';
  } else if (cashFlowAmount < 0) {
    classification = 'spending';
    countsTowardSpending = true;
    spendingAdjustment = -cashFlowAmount; // Normal purchase makes spending go up (positive)
  }

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
    countsTowardSpending,
    countsTowardIncome,
    spendingAdjustment,
    incomeAdjustment,
  };
}

export function deduplicateAndNormalizeTransactions(rawRows: any[][]): NormalizedTransaction[] {
  // Ignore header row if passed (checking if row[0] === 'Transaction ID')
  const dataRows = rawRows.filter(r => r[0] !== 'Transaction ID');
  const allTx = dataRows.map(classifyTransaction);
  
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
      if (t.classification === 'other') {
        const strictKey = `${t.normalizedMerchant}|${t.normalizedCategory}`;
        if (t.normalizedMerchant && merchantCategorySpendingSet.has(strictKey)) {
          return {
            ...t,
            classification: 'merchant_credit' as Classification,
            countsTowardSpending: true,
            spendingAdjustment: -t.cashFlowAmount,
            countsTowardIncome: false,
            incomeAdjustment: 0
          };
        }
      }
    }
    return t;
  });
}
