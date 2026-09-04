export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—';
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return formatter.format(amount);
}

export function formatPercentage(value: number | null | undefined): string {
  if (value == null) return '—';
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  });
  return formatter.format(value);
}

export function formatPercentagePoints(value: number | null | undefined): string {
  if (value == null) return '—';
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
  });
  return `${formatter.format(value)}%`;
}

export function formatMonthLabel(month: string | null | undefined): string {
  if (!month) return '—';

  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (monthNumber < 1 || monthNumber > 12) return month;

  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatMonthShort(month: string | null | undefined): string {
  if (!month) return '—';

  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (monthNumber < 1 || monthNumber > 12) return month;

  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}

export function formatMonthShortWithYear(month: string | null | undefined): string {
  if (!month) return '—';

  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (monthNumber < 1 || monthNumber > 12) return month;

  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  const shortMonth = date.toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${shortMonth} '${String(year).slice(-2)}`;
}

export function formatFriendlyDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';

  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    );
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getClassificationLabel(classification: string | undefined): string {
  if (!classification) return 'Unclassified';

  switch (classification) {
    case 'person_to_person': return 'Person-to-person';
    case 'internal_transfer': return 'Internal transfer';
    case 'investment_transfer': return 'Investment transfer';
    case 'credit_card_payment': return 'Credit card payment';
    case 'merchant_credit': return 'Merchant credit';
    case 'refund': return 'Refund';
    case 'cash_withdrawal': return 'Cash withdrawal';
    case 'interest_earned': return 'Interest earned';
    case 'interest_paid': return 'Interest paid';
    case 'bank_fee': return 'Bank fee';
    case 'unclassified_deposit': return 'Deposit — needs review';
    case 'zero_amount': return 'Zero amount';
    case 'income': return 'Income';
    case 'spending': return 'Spending';
    case 'pending': return 'Pending';
    case 'removed': return 'Removed';
    case 'other': return 'Needs review';
    default: return classification.replace(/_/g, ' ');
  }
}

export function isNeedsReviewClassification(classification: string | undefined): boolean {
  return classification === 'other' || classification === 'unclassified_deposit';
}

export function getTransactionClassificationLabel(
  classification: string | undefined,
  isOverridden: boolean,
  offsetCategory: string | null | undefined
): string {
  if (classification === 'refund' && isOverridden && offsetCategory) {
    return 'Reimbursement';
  }
  return getClassificationLabel(classification);
}

export function getMerchantDisplayLabel({
  merchant,
  fallbackDescription,
  classification,
}: {
  merchant?: string | null;
  fallbackDescription?: string | null;
  classification?: string;
}): string {
  const merchantText = String(merchant || '').trim().replace(/\s+/g, ' ');
  const fallbackText = String(fallbackDescription || '').trim().replace(/\s+/g, ' ');
  const source = merchantText || fallbackText || 'Unknown merchant';
  const isFallback = !merchantText || (!!fallbackText && merchantText.toLowerCase() === fallbackText.toLowerCase());

  if (isFallback && (!classification || classification === 'person_to_person')) {
    if (/^zelle(?:\s|$)/i.test(source)) return 'Zelle payment';
    if (/^venmo(?:\s|$)/i.test(source)) return 'Venmo payment';
    if (/^cash\s*app(?:\s|$)/i.test(source)) return 'Cash App payment';
    if (/^paypal(?:$|\s+(?:transfer|inst(?:ant)?\s+xfer|payment|send|money\s+transfer)\b)/i.test(source)) {
      return 'PayPal payment';
    }
  }

  if (!isFallback) return source;

  const withoutReferenceTail = source.replace(
    /\s+(?:on\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s+)?(?:ref(?:erence)?|conf(?:irmation)?)(?:\s*(?:#|no\.?|number))?\s*[:#-]?\s*[a-z0-9-]+.*$/i,
    ''
  ).trim();
  const cleaned = withoutReferenceTail || source;
  return cleaned.length <= 48 ? cleaned : `${cleaned.slice(0, 45).trimEnd()}...`;
}

export function getCategoryLabel(category: string | undefined): string {
  if (!category) return 'Uncategorized';

  switch (category) {
    case 'TRANSFER_OUT': return 'Transfers out';
    case 'TRANSFER_IN': return 'Transfers in';
    case 'FOOD_AND_DRINK': return 'Food & dining';
    case 'GENERAL_MERCHANDISE': return 'General merchandise';
    case 'TRANSPORTATION': return 'Transportation';
    default: {
      // Plaid's SCREAMING_SNAKE categories, title-cased word by word
      // (e.g. GENERAL_SERVICES -> "General Services").
      return category
        .toLowerCase()
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }
}

// Category display depends on classification, not just the raw Plaid
// category: e.g. person_to_person rows carry a TRANSFER_OUT category from
// Plaid, but showing "Transfers out" reads as an unclassified transfer
// rather than the correctly-classified P2P payment it is.
export function getCategoryDisplayLabel(
  category: string | undefined,
  classification: string | undefined
): string {
  if (classification === 'person_to_person') return 'Payments to people';
  return getCategoryLabel(category);
}
