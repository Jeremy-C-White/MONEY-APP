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
    case 'income': return 'Income';
    case 'spending': return 'Spending';
    case 'pending': return 'Pending';
    case 'removed': return 'Removed';
    case 'other': return 'Needs review';
    default: return classification.replace(/_/g, ' ');
  }
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
      const cleaned = category.replace(/_/g, ' ').toLowerCase();
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }
}
