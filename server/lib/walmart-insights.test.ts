import { describe, expect, it } from 'vitest';
import {
  buildWalmartInsights,
  extractGoogleSpreadsheetId,
  getWalmartProductIdentity,
  isFuelProduct,
} from './walmart-insights';

const orders = [
  ['Order Number', 'Order Date', 'Order Type', 'Savings', 'Tip', 'Order Total', 'Fulfillment'],
  ['online-1', 'Aug 29, 2026', 'GLASS', '-$2.00', '$5.00', '$50.00', 'SC_DELIVERY'],
  ['store-1', 'Aug 28, 2026 purchase', 'IN_STORE', '', '$0.00', '$40.00', 'IN_STORE'],
  ['canceled-1', 'Aug 27, 2026', 'GLASS', '', '$0.00', '$0.00', 'FC_DELIVERY'],
  ['stub-1', '', '', '', '$0.00', '', ''],
  ['old-1', 'Jul 01, 2025', 'GLASS', '', '$0.00', '$25.00', 'FC_DELIVERY'],
];

const items = [
  ['Order Number', 'Order Date', 'Product Name', 'Qty', 'Price', 'Status', 'Order Type', 'Product Link'],
  ['online-1', 'Aug 29, 2026', 'Organic Bananas', '1', '$2.00', 'Delivered on Aug 29', 'GLASS', 'https://www.walmart.com/ip/123456789'],
  ['online-1', 'Aug 29, 2026', 'Organic Bananas', '1', '$2.00', 'Canceled', 'GLASS'],
  ['online-1', 'Aug 29, 2026', 'Paper Towels', '1', '$8.00', 'Delivered on Aug 29', 'GLASS'],
  ['store-1', 'Aug 28, 2026 purchase', 'Reg Gasoline Unleaded', '10', '$40.00', 'Aug 28, 2026 purchase', 'IN_STORE'],
  ['store-1', 'Aug 28, 2026 purchase', 'Reg Gasoline Unleaded', '10', '$40.00', 'Shopped', 'IN_STORE'],
  ['old-1', 'Jul 01, 2025', 'Old Product', '1', '$25.00', 'Delivered on Jul 03', 'GLASS'],
];

describe('buildWalmartInsights', () => {
  it('keeps receipt spending separate, removes status duplicates, and summarizes fuel', () => {
    const report = buildWalmartInsights(orders, items, {
      period: 'last_12_months',
      now: new Date('2026-09-04T12:00:00Z'),
    });

    expect(report.startDate).toBe('2025-10-01');
    expect(report.summary).toEqual({
      totalSpend: 90,
      orderCount: 2,
      averageOrder: 45,
      onlineSpend: 50,
      inStoreSpend: 40,
      tips: 5,
      savings: 2,
      fuelSpend: 40,
      fuelGallons: 10,
      averageFuelPricePerGallon: 4,
      fuelPurchaseCount: 1,
      returnAmount: 0,
      returnCount: 0,
    });
    expect(report.quality).toEqual({
      canceledItemRowsExcluded: 1,
      statusDuplicateRowsExcluded: 1,
      zeroDollarOrdersExcluded: 1,
      incompleteOrderStubsExcluded: 1,
    });
    expect(report.topItems.map(item => item.productName)).toEqual([
      'Paper Towels',
      'Organic Bananas',
    ]);
    expect(report.recentOrders[1]).toMatchObject({
      orderNumber: 'store-1',
      channel: 'in_store',
      fuel: true,
      itemCount: 1,
    });
    expect(report.monthly).toEqual([{
      month: '2026-08',
      totalSpend: 90,
      fuelSpend: 40,
      orderCount: 2,
    }]);
  });

  it('supports all-time history without including incomplete order stubs', () => {
    const report = buildWalmartInsights(orders, items, {
      period: 'all_time',
      now: new Date('2026-09-04T12:00:00Z'),
    });

    expect(report.startDate).toBeNull();
    expect(report.summary.totalSpend).toBe(115);
    expect(report.summary.orderCount).toBe(3);
    expect(report.topItems.some(item => item.productName === 'Old Product')).toBe(true);
  });

  it('nets returns without misreporting them as zero-dollar orders', () => {
    const returnOrders = [
      orders[0],
      ['purchase-1', 'Aug 20, 2026', 'GLASS', '', '$0.00', '$100.00', 'SC_DELIVERY'],
      ['return-1', 'Aug 21, 2026', 'GLASS', '', '$0.00', '-$40.00', 'SC_DELIVERY'],
      ['zero-1', 'Aug 22, 2026', 'GLASS', '', '$0.00', '$0.00', 'SC_DELIVERY'],
    ];
    const returnItems = [
      items[0],
      ['purchase-1', 'Aug 20, 2026', 'Test Product', '1', '$100.00', 'Delivered on Aug 20', 'GLASS', 'https://www.walmart.com/ip/222222222'],
    ];

    const report = buildWalmartInsights(returnOrders, returnItems, {
      period: 'this_year',
      now: new Date('2026-09-04T12:00:00Z'),
    });

    expect(report.summary).toMatchObject({
      totalSpend: 60,
      orderCount: 1,
      averageOrder: 100,
      onlineSpend: 100,
      returnAmount: 40,
      returnCount: 1,
    });
    expect(report.quality.zeroDollarOrdersExcluded).toBe(1);
    expect(report.monthly).toEqual([{
      month: '2026-08',
      totalSpend: 60,
      fuelSpend: 0,
      orderCount: 1,
    }]);
  });

  it('rejects a workbook whose expected export columns are missing', () => {
    expect(() => buildWalmartInsights([['Order Number']], items)).toThrow(
      'Orders tab is missing required columns'
    );
    expect(() => buildWalmartInsights(orders, items.map(row => row.slice(0, 7)))).toThrow(
      'Items tab is missing required columns: Product Link'
    );
  });

  it('tracks effective unit-price changes for frequently purchased products', () => {
    const priceOrders = [
      orders[0],
      ['price-1', 'Jan 05, 2026', 'GLASS', '', '$0.00', '$10.00', 'SC_DELIVERY'],
      ['price-2', 'Jun 05, 2026', 'GLASS', '', '$0.00', '$12.00', 'SC_DELIVERY'],
    ];
    const priceItems = [
      items[0],
      ['price-1', 'Jan 05, 2026', 'Test Staple', '2', '$4.00', 'Delivered on Jan 06', 'GLASS', 'https://www.walmart.com/ip/111111111'],
      ['price-2', 'Jun 05, 2026', 'Test Staple, Updated Label', '2', '$5.00', 'Delivered on Jun 06', 'GLASS', 'https://www.walmart.com/ip/Test-Staple/111111111'],
    ];

    const report = buildWalmartInsights(priceOrders, priceItems, {
      period: 'this_year',
      now: new Date('2026-09-04T12:00:00Z'),
    });

    expect(report.priceTrends).toHaveLength(1);
    expect(report.priceTrends[0]).toMatchObject({
      productName: 'Test Staple, Updated Label',
      productUrl: 'https://www.walmart.com/ip/Test-Staple/111111111',
      purchaseCount: 2,
      firstUnitPrice: 2,
      latestUnitPrice: 2.5,
      lowUnitPrice: 2,
      highUnitPrice: 2.5,
      changeAmount: 0.5,
      changePercentage: 0.25,
    });
    expect(report.priceTrends[0].history).toEqual([
      { month: '2026-01', averageUnitPrice: 2, lowUnitPrice: 2, highUnitPrice: 2, purchaseCount: 1 },
      { month: '2026-06', averageUnitPrice: 2.5, lowUnitPrice: 2.5, highUnitPrice: 2.5, purchaseCount: 1 },
    ]);
  });
});

describe('Walmart source helpers', () => {
  it('accepts a Google Sheets URL or a raw spreadsheet id', () => {
    const id = '1aTFL7G6OIOI9NS5KSBhc4e6VJolCgHZuTeTle2dVFyk';
    expect(extractGoogleSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit`)).toBe(id);
    expect(extractGoogleSpreadsheetId(id)).toBe(id);
    expect(extractGoogleSpreadsheetId('not a sheet')).toBeNull();
  });

  it('recognizes common fuel product labels without treating unrelated items as fuel', () => {
    expect(isFuelProduct('Hi-grade Premium Gasoline')).toBe(true);
    expect(isFuelProduct('Reg Gasoline Unleaded')).toBe(true);
    expect(isFuelProduct('Great Value Fuel Injector Cleaner')).toBe(false);
    expect(isFuelProduct('Great Value Whole Milk')).toBe(false);
  });

  it('uses the Walmart item id before the mutable product title', () => {
    expect(getWalmartProductIdentity(
      'Great Value Whole Milk, 1 Gallon',
      'https://www.walmart.com/ip/Great-Value-Whole-Milk/123456789'
    )).toBe(getWalmartProductIdentity(
      'Great Value Milk Whole, 1 gal',
      'https://www.walmart.com/ip/123456789'
    ));
    expect(getWalmartProductIdentity(
      'Great Value Whole Milk, 1 Gallon',
      null
    )).toBe(getWalmartProductIdentity(
      'Great Value Milk Whole, 1 gal',
      null
    ));
  });
});
