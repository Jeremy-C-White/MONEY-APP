import React, { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { AlertTriangle, Landmark, ShieldAlert, Loader2, Info } from 'lucide-react';
import { extractAccountsResponse } from '../lib/api-contracts';

interface Account {
  accountId: string;
  institutionName: string;
  accountName: string;
  accountMask: string;
  accountType: string;
  accountSubtype: string;
  health: string;
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadAccounts() {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) throw new Error('Not authenticated');

        const token = await user.getIdToken();
        const res = await fetch('/api/connected-accounts', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch connected accounts');
        }

        // We can use the same contract since it's just an array of accounts, 
        // but wait, extractAccountsResponse throws if it doesn't match the Ledger shape?
        // Let's just parse the JSON array directly because it's a different endpoint.
        const data = await res.json();
        if (!Array.isArray(data)) {
           throw new Error('Invalid response format: expected array');
        }
        setAccounts(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadAccounts();
  }, []);

  const needsAttention = (health: string) => 
    ['login_required', 'permission_revoked', 'pending_disconnect', 'unknown'].includes(health);

  const activeAccounts = accounts.filter(a => a.health !== 'disconnected');
  const disconnectedAccounts = accounts.filter(a => a.health === 'disconnected');

  // Group by institution
  const groupedActive = activeAccounts.reduce((acc, account) => {
    if (!acc[account.institutionName]) acc[account.institutionName] = [];
    acc[account.institutionName].push(account);
    return acc;
  }, {} as Record<string, Account[]>);

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Accounts & Connections</h1>
        <p className="text-slate-500 mt-1">Manage your connected financial accounts and connection health.</p>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-600 p-4 rounded-xl text-sm mb-6 font-medium">
          {error}
        </div>
      )}

      {activeAccounts.length === 0 && disconnectedAccounts.length === 0 && !error && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
          <Landmark className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No accounts connected</h3>
          <p className="text-slate-500 mt-2">Connect a bank from the Overview tab to see your accounts.</p>
        </div>
      )}

      {Object.keys(groupedActive).length > 0 && (
        <div className="space-y-6">
          {Object.entries(groupedActive).map(([institution, instAccounts]) => {
            // All accounts in the same item share the same health currently in our logic
            const health = instAccounts[0]?.health || 'unknown';
            const attention = needsAttention(health);

            return (
              <div key={institution} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-slate-400" />
                    {institution}
                  </h3>
                  
                  {attention ? (
                    <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase bg-rose-100 text-rose-700 px-2.5 py-1 rounded-md">
                      <AlertTriangle className="h-3 w-3" />
                      Needs Attention
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-md">
                      Healthy
                    </span>
                  )}
                </div>
                
                <div className="divide-y divide-slate-50">
                  {((instAccounts as Account[]) || []).map(account => (
                    <div key={account.accountId} className="px-6 py-4 flex justify-between items-center">
                      <div>
                        <div className="font-medium text-slate-900 text-sm">{account.accountName}</div>
                        <div className="text-xs text-slate-500 mt-0.5 capitalize">
                          {account.accountType} • {account.accountSubtype} {account.accountMask ? `• x${account.accountMask}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {disconnectedAccounts.length > 0 && (
        <div className="mt-12">
          <h3 className="text-sm font-bold tracking-wide text-slate-500 uppercase mb-4 flex items-center gap-2">
            <Info className="h-4 w-4" />
            Disconnected Accounts
          </h3>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
            <div className="divide-y divide-slate-100">
              {disconnectedAccounts.map(account => (
                <div key={account.accountId} className="px-6 py-4 flex justify-between items-center opacity-60">
                  <div>
                    <div className="font-medium text-slate-900 text-sm">
                      {account.institutionName} - {account.accountName}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 capitalize">
                      {account.accountType} • {account.accountSubtype} {account.accountMask ? `• x${account.accountMask}` : ''}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 bg-slate-200/50 px-2.5 py-1 rounded-md">
                    Disconnected
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
