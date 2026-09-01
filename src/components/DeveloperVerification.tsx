import React, { useState } from 'react';

export function DeveloperVerification({ user }: { user: any }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  const fetchVerification = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { Authorization: `Bearer ${await user.getIdToken()}` };
      
      const summaryRes = await fetch('/api/dashboard/summary', { headers });
      const summary = await summaryRes.json();
      
      const catsRes = await fetch('/api/dashboard/categories', { headers });
      const categories = await catsRes.json();
      
      const trendsRes = await fetch('/api/dashboard/trends', { headers });
      const trends = await trendsRes.json();

      const merchRes = await fetch('/api/dashboard/merchants', { headers });
      const merchants = await merchRes.json();
      
      const txRes = await fetch('/api/transactions?limit=1000', { headers });
      const txData = await txRes.json();
      const transactions = txData.data || [];
      
      // Calculate Sandbox reconciliation totals from the raw data
      let pendingCount = 0;
      let removedCount = 0;
      let spendingCount = 0;
      let incomeCount = 0;
      let transferCount = 0;
      let creditCardCount = 0;
      let refundCount = 0;
      let otherCount = 0;
      
      for (const t of transactions) {
        if (t.classification === 'pending') pendingCount++;
        else if (t.classification === 'removed') removedCount++;
        else if (t.classification === 'spending') spendingCount++;
        else if (t.classification === 'income') incomeCount++;
        else if (t.classification === 'internal_transfer') transferCount++;
        else if (t.classification === 'credit_card_payment') creditCardCount++;
        else if (t.classification === 'refund') refundCount++;
        else otherCount++;
      }
      
      setData({
        summary,
        categories: categories.slice(0, 10), // Top 10
        trends,
        merchants: merchants.slice(0, 10), // Top 10
        reconciliation: {
          totalRows: transactions.length, // Since removed ones are returned? Wait, transactions endpoint returns everything including removed, we just don't count them in spending.
          pendingCount,
          removedCount,
          spendingCount,
          incomeCount,
          transferCount,
          creditCardCount,
          refundCount,
          otherCount
        }
      });
      
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Developer Verification (Financial Pass 1)</h2>
        <button 
          onClick={fetchVerification} 
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Financial Verification'}
        </button>
      </div>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      {data && (
        <div className="space-y-8 text-sm">
          
          <section>
            <h3 className="font-bold text-lg mb-2">1. Summary (All-Time)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-gray-500 text-xs">Spending</div>
                <div className="text-lg font-mono">${data.summary.allTime.spending.toFixed(2)}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-gray-500 text-xs">Income</div>
                <div className="text-lg font-mono">${data.summary.allTime.income.toFixed(2)}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-gray-500 text-xs">Net Cash Flow</div>
                <div className="text-lg font-mono">${data.summary.allTime.netCashFlow.toFixed(2)}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-gray-500 text-xs">Active Posted Count</div>
                <div className="text-lg font-mono">{data.summary.activePostedCount}</div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-2">2. Reconciliation Report</h3>
            <ul className="list-disc pl-5 space-y-1 font-mono">
              <li>Total Rows Parsed (Limit 1000): {data.reconciliation.totalRows}</li>
              <li>Pending Rows: {data.reconciliation.pendingCount}</li>
              <li>Removed Rows: {data.reconciliation.removedCount}</li>
              <li>Spending Rows: {data.reconciliation.spendingCount}</li>
              <li>Income Rows: {data.reconciliation.incomeCount}</li>
              <li>Internal Transfer Rows: {data.reconciliation.transferCount}</li>
              <li>Credit Card Payment Rows: {data.reconciliation.creditCardCount}</li>
              <li>Refund Rows: {data.reconciliation.refundCount}</li>
              <li>Other/Unclassified Rows: {data.reconciliation.otherCount}</li>
            </ul>
          </section>

          <div className="grid md:grid-cols-2 gap-8">
            <section>
              <h3 className="font-bold text-lg mb-2">3. Top Categories</h3>
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="py-2">Category</th>
                    <th>Net Spending</th>
                    <th>Refunds</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c: any) => (
                    <tr key={c.category} className="border-b">
                      <td className="py-1">{c.category}</td>
                      <td>${c.netSpending.toFixed(2)}</td>
                      <td>${c.refunds.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              <h3 className="font-bold text-lg mb-2">4. Top Merchants</h3>
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="py-2">Merchant</th>
                    <th>Net Spending</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.merchants.map((m: any) => (
                    <tr key={m.merchant} className="border-b">
                      <td className="py-1">{m.merchant}</td>
                      <td>${m.netSpending.toFixed(2)}</td>
                      <td>{m.transactionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section>
            <h3 className="font-bold text-lg mb-2">5. Monthly Trends</h3>
            <div className="flex gap-4 overflow-x-auto">
              {data.trends.map((t: any) => (
                <div key={t.month} className="min-w-[120px] p-3 bg-gray-50 rounded font-mono text-xs text-center border">
                  <div className="font-bold border-b pb-1 mb-1">{t.month}</div>
                  <div className="text-green-600">+${t.income.toFixed(0)}</div>
                  <div className="text-red-600">-${t.spending.toFixed(0)}</div>
                  <div className="mt-1 pt-1 border-t">${t.netCashFlow.toFixed(0)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
