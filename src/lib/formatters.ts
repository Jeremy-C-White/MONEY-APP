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

export function formatFriendlyDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  // Attempt to parse YYYY-MM-DD or standard ISO without shifting timezones
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getClassificationLabel(classification: string | undefined): string {
  if (!classification) return 'Unclassified';
  switch (classification) {
    case 'person_to_person': return 'Person-to-person';
    case 'internal_transfer': return 'Internal transfer';
    case 'credit_card_payment': return 'Credit card payment';
    case 'merchant_credit': return 'Merchant credit';
    case 'refund': return 'Refund';
    case 'cash_withdrawal': return 'Cash withdrawal';
    case 'income': return 'Income';
    case 'spending': return 'Spending';
    case 'other': return 'Unclassified transfer';
    default: return classification;
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
    default:
      let cleaned = category.replace(/_/g, ' ').toLowerCase();
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
}
