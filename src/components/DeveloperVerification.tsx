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
      
      const res = await fetch('/api/dashboard/verification', { headers });
      const report = await res.json();
      
      if (!res.ok) {
        throw new Error(report.error || 'Failed to fetch verification report');
      }
      
      setData(report);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Developer Verification (Pass 1B)</h2>
          <p className="text-sm text-slate-500 mt-1">Full-dataset reconciliation testing positive-spend semantics.</p>
        </div>
        <button 
          onClick={fetchVerification} 
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Financial Verification'}
        </button>
      </div>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      {data && (
        <div className="space-y-8 text-sm">
          
          <section>
            <h3 className="font-bold text-lg mb-2 text-slate-800">1. Summary (All-Time)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Posted Spending</div>
                <div className="text-xl font-mono mt-1">${data.summary.allTime.spending.toFixed(2)}</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Recognized Income</div>
                <div className="text-xl font-mono mt-1">${data.summary.allTime.income.toFixed(2)}</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Net Cash Flow</div>
                <div className="text-xl font-mono mt-1">${data.summary.allTime.netCashFlow.toFixed(2)}</div>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                <div className="text-amber-700 text-xs font-semibold uppercase tracking-wider">Pending Spending</div>
                <div className="text-xl font-mono text-amber-700 mt-1">${data.summary.allTime.pendingSpending.toFixed(2)}</div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-2 text-slate-800">2. Complete Reconciliation Report</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <ul className="list-disc pl-5 space-y-1 font-mono text-slate-700 bg-slate-50 p-4 rounded-lg">
                <li>Total Raw Rows Parsed: {data.reconciliation.totalRowsParsed}</li>
                <li>Active Posted Rows: {data.reconciliation.activePostedRows}</li>
                <li>Pending Rows: {data.reconciliation.pendingCount}</li>
                <li>Removed Rows: {data.reconciliation.removedCount}</li>
                <li className="pt-2">Spending Rows: {data.reconciliation.spendingCount}</li>
                <li>Income Rows: {data.reconciliation.incomeCount}</li>
                <li>Credit Card Payment Rows: {data.reconciliation.creditCardCount}</li>
                <li>Refund Rows: {data.reconciliation.refundCount}</li>
              </ul>
              <ul className="list-disc pl-5 space-y-1 font-mono text-slate-700 bg-slate-50 p-4 rounded-lg">
                <li>Internal Transfer Rows: {data.reconciliation.transferCount}</li>
                <li>Cash Withdrawal Rows: {data.reconciliation.cashWithdrawalCount} (${data.reconciliation.cashWithdrawalAmount.toFixed(2)})</li>
                <li>P2P Outgoing: {data.reconciliation.p2pOutgoingCount} (${data.reconciliation.p2pOutgoingAmount.toFixed(2)})</li>
                <li>P2P Incoming: {data.reconciliation.p2pIncomingCount} (${data.reconciliation.p2pIncomingAmount.toFixed(2)})</li>
                <li>Unknown Transfer Rows: {data.reconciliation.unknownTransferCount} (${data.reconciliation.unknownTransferAmount.toFixed(2)})</li>
                <li>Unclassified Positive Rows: {data.reconciliation.unclassifiedPositiveCount} (${data.reconciliation.unclassifiedPositiveAmount.toFixed(2)})</li>
                <li>Other Rows: {data.reconciliation.otherCount}</li>
                <li className="pt-2 font-bold text-indigo-600">
                  Category Math Reconciles: {data.reconciliation.categoryMathReconciles ? 'YES' : 'NO'}
                </li>
                <li className="text-xs text-slate-500">(Gross {data.reconciliation.grossPurchases.toFixed(0)} - Refunds {data.reconciliation.refunds.toFixed(0)} = Net {data.reconciliation.netSpending.toFixed(0)})</li>
              </ul>
            </div>
          </section>

          <div className="grid md:grid-cols-2 gap-8">
            <section>
              <h3 className="font-bold text-lg mb-2 text-slate-800">3. Top Categories (Net)</h3>
              <div className="bg-slate-50 rounded-lg p-1">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 px-2 text-slate-500">Category</th>
                      <th className="px-2 text-slate-500">Net Spend</th>
                      <th className="px-2 text-slate-500">Refunds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categories.slice(0, 10).map((c: any) => (
                      <tr key={c.category} className="border-b border-slate-100 last:border-0 hover:bg-white">
                        <td className="py-2 px-2">{c.category}</td>
                        <td className="px-2">${c.netSpending.toFixed(2)}</td>
                        <td className="px-2 text-slate-400">${c.refunds.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="font-bold text-lg mb-2 text-slate-800">4. Top Merchants</h3>
              <div className="bg-slate-50 rounded-lg p-1">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 px-2 text-slate-500">Merchant</th>
                      <th className="px-2 text-slate-500">Net Spend</th>
                      <th className="px-2 text-slate-500">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.merchants.slice(0, 10).map((m: any) => (
                      <tr key={m.merchant} className="border-b border-slate-100 last:border-0 hover:bg-white">
                        <td className="py-2 px-2 truncate max-w-[150px]">{m.merchant}</td>
                        <td className="px-2">${m.netSpending.toFixed(2)}</td>
                        <td className="px-2 text-slate-400">{m.transactionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section>
            <h3 className="font-bold text-lg mb-2 text-slate-800">5. Monthly Trends (Civil Date)</h3>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {data.trends.map((t: any) => (
                <div key={t.month} className="min-w-[140px] p-4 bg-slate-50 rounded-xl font-mono text-xs text-center border border-slate-100 shadow-sm">
                  <div className="font-bold text-sm text-slate-700 border-b border-slate-200 pb-2 mb-2">{t.month}</div>
                  <div className="flex justify-between text-emerald-600 mb-1">
                    <span>In</span><span>+${t.income.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600 mb-2">
                    <span>Out</span><span>-${t.spending.toFixed(0)}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 font-bold text-slate-800 flex justify-between">
                    <span>Net</span><span>${t.netCashFlow.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
