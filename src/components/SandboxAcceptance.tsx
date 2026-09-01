import React, { useState } from 'react';

export function SandboxAcceptance({ user, plaidItems = [] }: { user: any, plaidItems?: any[] }) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [refreshMsg, setRefreshMsg] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  const fetchAcceptance = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { Authorization: `Bearer ${await user.getIdToken()}` };
      const res = await fetch('/api/dev/sandbox-acceptance', { headers });
      const report = await res.json();
      
      if (!res.ok) {
        throw new Error(report.error || 'Failed to fetch acceptance report');
      }
      setData(report);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerRefresh = async () => {
    if (!selectedItemId) {
      setError('Please select an item to refresh.');
      return;
    }
    setRefreshing(true);
    setRefreshMsg('');
    setError('');
    try {
      const headers = { 
        'Authorization': `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json'
      };
      const res = await fetch('/api/dev/sandbox-refresh', { 
        method: 'POST', 
        headers,
        body: JSON.stringify({ internalItemId: selectedItemId })
      });
      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || 'Failed to trigger refresh');
      }
      setRefreshMsg(result.message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const renderStatus = (status: string) => {
    if (status === 'PASS') return <span className="text-emerald-600 font-bold">PASS</span>;
    if (status === 'FAIL') return <span className="text-rose-600 font-bold">FAIL</span>;
    return <span className="text-slate-400 font-bold">NOT EXERCISED</span>;
  };

  const renderScenarioDetails = (scenario: any) => {
    if (scenario.status === 'NOT EXERCISED') return null;
    return (
      <div className="mt-2 text-xs font-mono bg-white p-2 rounded border border-slate-100">
        {scenario.oldId && <div>Old Pending ID: {scenario.oldId}</div>}
        {scenario.newId && <div>New Posted ID: {scenario.newId}</div>}
        {scenario.sourceId && <div>Source ID: {scenario.sourceId}</div>}
        {scenario.cashFlowAmount !== undefined && <div>Raw Cash Flow: {scenario.cashFlowAmount}</div>}
        {scenario.classification && <div>Classification: {scenario.classification}</div>}
        {scenario.oldStatus && <div>Old Row Status: {scenario.oldStatus}</div>}
        {scenario.oldRemovedAt && <div>Old Removed At: {scenario.oldRemovedAt}</div>}
        {scenario.pendingTransactionId && <div>Pending Tx ID Link: {scenario.pendingTransactionId}</div>}
        {scenario.reportingBucket && <div className="mt-1 font-bold">Reporting Bucket: {scenario.reportingBucket}</div>}
        {scenario.reason && <div className="text-rose-600 mt-1">Reason: {scenario.reason}</div>}
        {scenario.count !== undefined && <div>Count: {scenario.count} {scenario.amount !== undefined ? `($${scenario.amount})` : ''}</div>}
      </div>
    );
  };

  return (
    <div className="mt-8 p-6 bg-slate-50 border border-slate-200 rounded-xl shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Sandbox Acceptance Suite</h2>
          <p className="text-sm text-slate-500 mt-1">Validates pre-production rules dynamically reading from Google Sheets.</p>
        </div>
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <div className="flex gap-2">
            <select 
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded text-sm bg-white min-w-[200px]"
            >
              <option value="">Select Item to Refresh...</option>
              {plaidItems.map(item => (
                <option key={item.internal_id} value={item.internal_id}>
                  {item.institution_name} ({item.health}) - {item.internal_id.slice(-4)}
                </option>
              ))}
            </select>
            <button 
              onClick={triggerRefresh}
              disabled={refreshing || !selectedItemId}
              className="px-4 py-2 bg-amber-100 text-amber-800 rounded font-bold hover:bg-amber-200 disabled:opacity-50 text-sm whitespace-nowrap"
            >
              {refreshing ? 'Triggering...' : 'Trigger Sandbox Refresh'}
            </button>
          </div>
          <button 
            onClick={fetchAcceptance}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 text-white rounded font-bold hover:bg-slate-700 disabled:opacity-50 text-sm w-full"
          >
            {loading ? 'Running...' : 'Run Acceptance Suite'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
          {error}
        </div>
      )}
      
      {refreshMsg && (
        <div className="mb-6 p-4 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-bold">
          {refreshMsg}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(data.scenarios).map(([key, value]: [string, any]) => (
              <div key={key} className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center">
                  <div className="font-bold text-slate-700 capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                  <div>{renderStatus(value.status)}</div>
                </div>
                {renderScenarioDetails(value)}
              </div>
            ))}
          </div>
          
          <section className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <h3 className="font-bold text-lg mb-2 text-slate-800">Final Reconciliation Totals</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 font-mono text-sm text-slate-700">
              <div>Posted Spending: ${data.reconciliation.postedSpending.toFixed(2)}</div>
              <div>Recognized Income: ${data.reconciliation.recognizedIncome.toFixed(2)}</div>
              <div>Net Cash Flow: ${data.reconciliation.netCashFlow.toFixed(2)}</div>
              <div>Pending Spending: ${data.reconciliation.pendingSpending.toFixed(2)}</div>
              <div>CC Payments: ${data.reconciliation.creditCardAmount.toFixed(2)}</div>
              <div>Refunds: ${data.reconciliation.refundsAmount.toFixed(2)}</div>
              <div>Merchant Credits: ${data.reconciliation.merchantCreditsAmount.toFixed(2)}</div>
              <div>Cash Withdrawals: ${data.reconciliation.cashWithdrawalAmount.toFixed(2)}</div>
              <div>Outgoing P2P: ${data.reconciliation.p2pOutgoingAmount.toFixed(2)}</div>
              <div>Incoming P2P: ${data.reconciliation.p2pIncomingAmount.toFixed(2)}</div>
              <div>Unclassified Pos: ${data.reconciliation.unclassifiedPositiveAmount.toFixed(2)}</div>
              <div>Removed Count: {data.reconciliation.removedCount}</div>
              
              <div className={`col-span-full mt-2 pt-2 border-t font-bold ${data.reconciliation.categoryMathReconciles ? 'text-emerald-600' : 'text-rose-600'}`}>
                Category Math Reconciles: {data.reconciliation.categoryMathReconciles ? 'YES' : 'NO'}
              </div>
              <div className={`col-span-full font-bold ${data.reconciliation.accountingBridgeReconciles ? 'text-emerald-600' : 'text-rose-600'}`}>
                Accounting Bridge Reconciles: {data.reconciliation.accountingBridgeReconciles ? 'YES' : 'NO'}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
