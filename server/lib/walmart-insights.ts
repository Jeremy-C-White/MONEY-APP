export const WALMART_INSIGHT_PERIODS = ['last_12_months', 'this_year', 'all_time'] as const;

export type WalmartInsightPeriod = typeof WALMART_INSIGHT_PERIODS[number];
export type WalmartSheetRow = Array<string | number | boolean | null | undefined>;

export interface WalmartMonthlyInsight {
  month: string;
  totalSpend: number;
  fuelSpend: number;
  orderCount: number;
}

export interface WalmartTopItem {
  productName: string;
  productUrl: string | null;
  purchaseCount: number;
  quantity: number;
  spend: number;
  lastPurchased: string;
}

export interface WalmartOrderItem {
  productName: string;
  productUrl: string | null;
  quantity: number;
  price: number;
  fuel: boolean;
}

export interface WalmartPriceHistoryPoint {
  month: string;
  averageUnitPrice: number;
  lowUnitPrice: number;
  highUnitPrice: number;
  purchaseCount: number;
}

export interface WalmartPriceTrend {
  productName: string;
  productUrl: string | null;
  purchaseCount: number;
  firstPurchased: string;
  lastPurchased: string;
  firstUnitPrice: number;
  latestUnitPrice: number;
  lowUnitPrice: number;
  highUnitPrice: number;
  changeAmount: number;
  changePercentage: number | null;
  history: WalmartPriceHistoryPoint[];
}

export interface WalmartRecentOrder {
  orderNumber: string;
  date: string;
  channel: 'delivery' | 'pickup' | 'shipping' | 'in_store' | 'online';
  total: number;
  tip: number;
  savings: number;
  itemCount: number;
  fuel: boolean;
  items: WalmartOrderItem[];
}

export interface WalmartInsights {
  period: WalmartInsightPeriod;
  startDate: string | null;
  endDate: string | null;
  summary: {
    totalSpend: number;
    orderCount: number;
    averageOrder: number;
    onlineSpend: number;
    inStoreSpend: number;
    tips: number;
    savings: number;
    fuelSpend: number;
    fuelGallons: number;
    averageFuelPricePerGallon: number | null;
    fuelPurchaseCount: number;
  };
  monthly: WalmartMonthlyInsight[];
  topItems: WalmartTopItem[];
  priceTrends: WalmartPriceTrend[];
  recentOrders: WalmartRecentOrder[];
  quality: {
    canceledItemRowsExcluded: number;
    statusDuplicateRowsExcluded: number;
    zeroDollarOrdersExcluded: number;
    incompleteOrderStubsExcluded: number;
  };
}

type RecordRow = Record<string, string | number | boolean | null | undefined>;

interface ParsedOrder {
  orderNumber: string;
  date: string;
  orderType: string;
  fulfillment: string;
  total: number;
  tip: number;
  savings: number;
}

interface ParsedItem {
  orderNumber: string;
  date: string;
  productName: string;
  productUrl: string | null;
  quantity: number;
  price: number;
  status: string;
  orderType: string;
}

interface CleanedItem extends ParsedItem {
  copies: number;
  fuel: boolean;
}

const REQUIRED_ORDER_HEADERS = [
  'Order Number',
  'Order Date',
  'Order Type',
  'Savings',
  'Tip',
  'Order Total',
];

const REQUIRED_ITEM_HEADERS = [
  'Order Number',
  'Order Date',
  'Product Name',
  'Qty',
  'Price',
  'Status',
  'Order Type',
];

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + value * 86_400_000).toISOString().slice(0, 10);
  }

  const text = String(value ?? '').trim().replace(/\s+purchase$/i, '');
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const match = /^(\w{3,9})\s+(\d{1,2}),\s+(\d{4})$/.exec(text);
  if (!match) return null;
  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date.toISOString().slice(0, 10);
}

function rowsToRecords(rows: WalmartSheetRow[], requiredHeaders: string[], label: string): RecordRow[] {
  const headers = (rows[0] || []).map(value => String(value ?? '').trim());
  const missing = requiredHeaders.filter(header => !headers.includes(header));
  if (missing.length > 0) {
    throw new Error(`${label} is missing required columns: ${missing.join(', ')}`);
  }

  return rows.slice(1).map(row => Object.fromEntries(
    headers.map((header, index) => [header, row[index]])
  ));
}

function parseOrders(rows: WalmartSheetRow[]): { orders: ParsedOrder[]; incomplete: number } {
  const records = rowsToRecords(rows, REQUIRED_ORDER_HEADERS, 'Orders tab');
  const orders: ParsedOrder[] = [];
  let incomplete = 0;

  for (const row of records) {
    const orderNumber = String(row['Order Number'] ?? '').trim();
    if (!orderNumber) continue;
    const date = dateValue(row['Order Date']);
    if (!date) {
      incomplete += 1;
      continue;
    }
    orders.push({
      orderNumber,
      date,
      orderType: String(row['Order Type'] ?? '').trim(),
      fulfillment: String(row.Fulfillment ?? '').trim(),
      total: numberValue(row['Order Total']),
      tip: numberValue(row.Tip),
      savings: Math.abs(numberValue(row.Savings)),
    });
  }

  return { orders, incomplete };
}

function parseItems(rows: WalmartSheetRow[]): ParsedItem[] {
  return rowsToRecords(rows, REQUIRED_ITEM_HEADERS, 'Items tab').flatMap(row => {
    const orderNumber = String(row['Order Number'] ?? '').trim();
    const productName = String(row['Product Name'] ?? '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#(?:39|x27);/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    const date = dateValue(row['Order Date']);
    if (!orderNumber || !productName || !date) return [];
    return [{
      orderNumber,
      date,
      productName,
      productUrl: walmartProductUrl(row['Product Link']),
      quantity: numberValue(row.Qty),
      price: numberValue(row.Price),
      status: String(row.Status ?? '').trim(),
      orderType: String(row['Order Type'] ?? '').trim(),
    }];
  });
}

function walmartProductUrl(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!['walmart.com', 'www.walmart.com'].includes(url.hostname.toLowerCase())) return null;
    if (!url.pathname.startsWith('/ip/')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isFuelProduct(productName: string): boolean {
  return /\b(?:gasoline|unleaded|diesel)\b/i.test(productName);
}

function cleanItems(items: ParsedItem[]): {
  items: CleanedItem[];
  canceledRows: number;
  statusDuplicateRows: number;
} {
  const groups = new Map<string, ParsedItem[]>();
  for (const item of items) {
    const key = [
      item.orderNumber,
      item.productName.toLowerCase(),
      item.quantity,
      item.price,
      item.orderType,
    ].join('|');
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  const cleaned: CleanedItem[] = [];
  let canceledRows = 0;
  let statusDuplicateRows = 0;

  for (const group of groups.values()) {
    const active = group.filter(item => !/^canceled\b/i.test(item.status));
    canceledRows += group.length - active.length;
    if (active.length === 0) continue;

    const statusCounts = new Map<string, number>();
    for (const item of active) {
      const statusKey = item.status.toLowerCase();
      statusCounts.set(statusKey, (statusCounts.get(statusKey) || 0) + 1);
    }
    const copies = Math.max(...statusCounts.values());
    statusDuplicateRows += active.length - copies;
    cleaned.push({
      ...active[0],
      copies,
      fuel: isFuelProduct(active[0].productName),
    });
  }

  return { items: cleaned, canceledRows, statusDuplicateRows };
}

function periodStart(period: WalmartInsightPeriod, now: Date): string | null {
  if (period === 'all_time') return null;
  if (period === 'this_year') return `${now.getUTCFullYear()}-01-01`;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return start.toISOString().slice(0, 10);
}

function channelFor(order: ParsedOrder): WalmartRecentOrder['channel'] {
  if (order.orderType === 'IN_STORE') return 'in_store';
  if (/SC_PICKUP/i.test(order.fulfillment)) return 'pickup';
  if (/SC_DELIVERY/i.test(order.fulfillment)) return 'delivery';
  if (/FC_DELIVERY/i.test(order.fulfillment)) return 'shipping';
  return 'online';
}

export function extractGoogleSpreadsheetId(value: unknown): string | null {
  const text = String(value ?? '').trim();
  const urlMatch = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(text);
  const candidate = urlMatch?.[1] || text;
  return /^[a-zA-Z0-9_-]{20,}$/.test(candidate) ? candidate : null;
}

export function buildWalmartInsights(
  orderRows: WalmartSheetRow[],
  itemRows: WalmartSheetRow[],
  options: { period?: WalmartInsightPeriod; now?: Date } = {}
): WalmartInsights {
  const period = options.period || 'last_12_months';
  const now = options.now || new Date();
  const startDate = periodStart(period, now);
  const endDate = now.toISOString().slice(0, 10);
  const { orders: allOrders, incomplete } = parseOrders(orderRows);
  const parsedItems = parseItems(itemRows);

  const inPeriod = (date: string) => (!startDate || date >= startDate) && date <= endDate;
  const datedOrders = allOrders.filter(order => inPeriod(order.date));
  const orders = datedOrders.filter(order => order.total > 0);
  const orderNumbers = new Set(orders.map(order => order.orderNumber));
  const {
    items: cleanedItems,
    canceledRows,
    statusDuplicateRows,
  } = cleanItems(parsedItems.filter(item => inPeriod(item.date)));
  const items = cleanedItems.filter(item => orderNumbers.has(item.orderNumber));
  const itemsByOrder = new Map<string, CleanedItem[]>();
  for (const item of items) {
    const group = itemsByOrder.get(item.orderNumber) || [];
    group.push(item);
    itemsByOrder.set(item.orderNumber, group);
  }

  const totalSpend = orders.reduce((sum, order) => sum + order.total, 0);
  const fuelItems = items.filter(item => item.fuel);
  const fuelSpend = fuelItems.reduce((sum, item) => sum + item.price * item.copies, 0);
  const fuelGallons = fuelItems.reduce((sum, item) => sum + item.quantity * item.copies, 0);
  const fuelOrders = new Set(fuelItems.map(item => item.orderNumber));

  const monthlyMap = new Map<string, WalmartMonthlyInsight>();
  for (const order of orders) {
    const month = order.date.slice(0, 7);
    const entry = monthlyMap.get(month) || { month, totalSpend: 0, fuelSpend: 0, orderCount: 0 };
    entry.totalSpend += order.total;
    entry.orderCount += 1;
    monthlyMap.set(month, entry);
  }
  for (const item of fuelItems) {
    const month = item.date.slice(0, 7);
    const entry = monthlyMap.get(month) || { month, totalSpend: 0, fuelSpend: 0, orderCount: 0 };
    entry.fuelSpend += item.price * item.copies;
    monthlyMap.set(month, entry);
  }

  const itemAggregates = new Map<string, {
    name: string;
    productUrl: string | null;
    orderNumbers: Set<string>;
    quantity: number;
    spend: number;
    lastPurchased: string;
  }>();
  for (const item of items.filter(candidate => !candidate.fuel)) {
    const key = item.productName.toLowerCase();
    const aggregate = itemAggregates.get(key) || {
      name: item.productName,
      productUrl: item.productUrl,
      orderNumbers: new Set<string>(),
      quantity: 0,
      spend: 0,
      lastPurchased: item.date,
    };
    aggregate.orderNumbers.add(item.orderNumber);
    if (item.productUrl && item.date >= aggregate.lastPurchased) aggregate.productUrl = item.productUrl;
    aggregate.quantity += item.quantity * item.copies;
    aggregate.spend += item.price * item.copies;
    if (item.date > aggregate.lastPurchased) aggregate.lastPurchased = item.date;
    itemAggregates.set(key, aggregate);
  }

  const topItems = [...itemAggregates.values()]
    .map(item => ({
      productName: item.name,
      productUrl: item.productUrl,
      purchaseCount: item.orderNumbers.size,
      quantity: roundQuantity(item.quantity),
      spend: roundCurrency(item.spend),
      lastPurchased: item.lastPurchased,
    }))
    .sort((a, b) => b.purchaseCount - a.purchaseCount || b.spend - a.spend)
    .slice(0, 12);

  const priceProducts = new Map<string, {
    name: string;
    productUrl: string | null;
    orders: Set<string>;
    observations: Array<{
      date: string;
      orderNumber: string;
      spend: number;
      quantity: number;
    }>;
  }>();
  for (const item of items.filter(candidate => !candidate.fuel && candidate.price > 0 && candidate.quantity > 0)) {
    const key = item.productName.toLowerCase();
    const product = priceProducts.get(key) || {
      name: item.productName,
      productUrl: item.productUrl,
      orders: new Set<string>(),
      observations: [],
    };
    product.orders.add(item.orderNumber);
    product.observations.push({
      date: item.date,
      orderNumber: item.orderNumber,
      spend: item.price * item.copies,
      quantity: item.quantity * item.copies,
    });
    if (item.productUrl) product.productUrl = item.productUrl;
    priceProducts.set(key, product);
  }

  const priceTrends = [...priceProducts.values()]
    .filter(product => product.orders.size >= 2)
    .map(product => {
      const monthly = new Map<string, {
        spend: number;
        quantity: number;
        orders: Set<string>;
        prices: number[];
      }>();
      const daily = new Map<string, { spend: number; quantity: number }>();
      for (const observation of product.observations) {
        const month = observation.date.slice(0, 7);
        const monthEntry = monthly.get(month) || {
          spend: 0,
          quantity: 0,
          orders: new Set<string>(),
          prices: [],
        };
        monthEntry.spend += observation.spend;
        monthEntry.quantity += observation.quantity;
        monthEntry.orders.add(observation.orderNumber);
        monthEntry.prices.push(observation.spend / observation.quantity);
        monthly.set(month, monthEntry);

        const dayEntry = daily.get(observation.date) || { spend: 0, quantity: 0 };
        dayEntry.spend += observation.spend;
        dayEntry.quantity += observation.quantity;
        daily.set(observation.date, dayEntry);
      }

      const dailyPrices = [...daily.entries()]
        .map(([date, values]) => ({ date, unitPrice: values.spend / values.quantity }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const first = dailyPrices[0];
      const latest = dailyPrices[dailyPrices.length - 1];
      const allPrices = dailyPrices.map(point => point.unitPrice);
      const changeAmount = latest.unitPrice - first.unitPrice;
      return {
        productName: product.name,
        productUrl: product.productUrl,
        purchaseCount: product.orders.size,
        firstPurchased: first.date,
        lastPurchased: latest.date,
        firstUnitPrice: roundCurrency(first.unitPrice),
        latestUnitPrice: roundCurrency(latest.unitPrice),
        lowUnitPrice: roundCurrency(Math.min(...allPrices)),
        highUnitPrice: roundCurrency(Math.max(...allPrices)),
        changeAmount: roundCurrency(changeAmount),
        changePercentage: first.unitPrice > 0
          ? Math.round((changeAmount / first.unitPrice) * 10_000) / 10_000
          : null,
        history: [...monthly.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, values]) => ({
            month,
            averageUnitPrice: roundCurrency(values.spend / values.quantity),
            lowUnitPrice: roundCurrency(Math.min(...values.prices)),
            highUnitPrice: roundCurrency(Math.max(...values.prices)),
            purchaseCount: values.orders.size,
          })),
      };
    })
    .sort((a, b) => b.purchaseCount - a.purchaseCount || Math.abs(b.changeAmount) - Math.abs(a.changeAmount))
    .slice(0, 10);

  const recentOrders = orders
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.orderNumber.localeCompare(a.orderNumber))
    .slice(0, 15)
    .map(order => {
      const orderItems = itemsByOrder.get(order.orderNumber) || [];
      const expandedItems = orderItems
        .map(item => ({
          productName: item.productName,
          productUrl: item.productUrl,
          quantity: roundQuantity(item.quantity * item.copies),
          price: roundCurrency(item.price * item.copies),
          fuel: item.fuel,
        }))
        .sort((a, b) => Number(b.fuel) - Number(a.fuel) || b.price - a.price);
      return {
        orderNumber: order.orderNumber,
        date: order.date,
        channel: channelFor(order),
        total: roundCurrency(order.total),
        tip: roundCurrency(order.tip),
        savings: roundCurrency(order.savings),
        itemCount: orderItems.reduce((sum, item) => sum + item.copies, 0),
        fuel: expandedItems.some(item => item.fuel),
        items: expandedItems,
      };
    });

  return {
    period,
    startDate,
    endDate,
    summary: {
      totalSpend: roundCurrency(totalSpend),
      orderCount: orders.length,
      averageOrder: orders.length ? roundCurrency(totalSpend / orders.length) : 0,
      onlineSpend: roundCurrency(orders.filter(order => order.orderType !== 'IN_STORE').reduce((sum, order) => sum + order.total, 0)),
      inStoreSpend: roundCurrency(orders.filter(order => order.orderType === 'IN_STORE').reduce((sum, order) => sum + order.total, 0)),
      tips: roundCurrency(orders.reduce((sum, order) => sum + order.tip, 0)),
      savings: roundCurrency(orders.reduce((sum, order) => sum + order.savings, 0)),
      fuelSpend: roundCurrency(fuelSpend),
      fuelGallons: roundQuantity(fuelGallons),
      averageFuelPricePerGallon: fuelGallons > 0 ? roundCurrency(fuelSpend / fuelGallons) : null,
      fuelPurchaseCount: fuelOrders.size,
    },
    monthly: [...monthlyMap.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(month => ({
        ...month,
        totalSpend: roundCurrency(month.totalSpend),
        fuelSpend: roundCurrency(month.fuelSpend),
      })),
    topItems,
    priceTrends,
    recentOrders,
    quality: {
      canceledItemRowsExcluded: canceledRows,
      statusDuplicateRowsExcluded: statusDuplicateRows,
      zeroDollarOrdersExcluded: datedOrders.length - orders.length,
      incompleteOrderStubsExcluded: incomplete,
    },
  };
}
