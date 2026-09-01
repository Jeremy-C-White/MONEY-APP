import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  ChevronRight,
  RefreshCcw,
  Settings,
  WalletCards,
} from 'lucide-react';
import { extractConnectedAccountsResponse } from '../lib/api-contracts';
import type { ConnectedAccount } from '../types/finance';

export const NEEDS_ATTENTION = new Set([
  'login_required',
  'permission_revoked',
  'pending_disconnect',
  'unknown',
]);

type AccountFilter = 'all' | 'connected' | 'attention' | 'disconnected';

const FILTERS: Array<{ id: AccountFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'connected', label: 'Connected' },
  { id: 'attention', label: 'Needs Attention' },
  { id: 'disconnected', label: 'Disconnected' },
];

const TYPE_LABELS: Record<string, string> = {
  depository: 'Deposit account',
  credit: 'Credit account',
  loan: 'Loan',
  investment: 'Investment',
  brokerage: 'Brokerage',
  other: 'Account',
};

const SUBTYPE_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  'credit card': 'Credit card',
  credit_card: 'Credit card',
  'money market': 'Money market',
  money_market: 'Money market',
  cd: 'Certificate of deposit',
  mortgage: 'Mortgage',
  'student loan': 'Student loan',
  student_loan: 'Student loan',
};

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function friendlyType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return TYPE_LABELS[normalized] || titleCase(normalized) || 'Account';
}

function friendlySubtype(value: string): string {
  const normalized = value.trim().toLowerCase();
  return SUBTYPE_LABELS[normalized] || titleCase(normalized);
}

function healthPresentation(health: string): {
  label: string;
  badgeClasses: string;
  dotClasses: string;
} {
  switch (health) {
    case 'healthy':
      return {
        label: 'Connected',
        badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotClasses: 'bg-emerald-500',
      };
    case 'login_required':
    case 'permission_revoked':
      return {
        label: 'Needs attention',
        badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClasses: 'bg-amber-500',
      };
    case 'pending_disconnect':
      return {
        label: 'Action needed soon',
        badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClasses: 'bg-amber-500',
      };
    case 'disconnected':
      return {
        label: 'Disconnected',
        badgeClasses: 'bg-slate-100 text-slate-600 border-slate-200',
        dotClasses: 'bg-slate-400',
      };
    case 'unknown':
    default:
      return {
        label: 'Status unavailable',
        badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClasses: 'bg-amber-500',
      };
  }
}

function matchesFilter(account: ConnectedAccount, filter: AccountFilter): boolean {
  if (filter === 'connected') return account.health === 'healthy';
  if (filter === 'attention') return NEEDS_ATTENTION.has(account.health);
  if (filter === 'disconnected') return account.health === 'disconnected';
  return true;
}

function sortAccounts(a: ConnectedAccount, b: ConnectedAccount): number {
  const typeComparison = `${a.accountType}|${a.accountSubtype}`.localeCompare(
    `${b.accountType}|${b.accountSubtype}`
  );
  if (typeComparison !== 0) return typeComparison;

  const nameComparison = a.accountName.localeCompare(b.accountName);
  if (nameComparison !== 0) return nameComparison;

  return a.accountMask.localeCompare(b.accountMask);
}

function LoadingState() {
  return (
    <div aria-label="Loading accounts" className="space-y-6 animate-pulse">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(item => (
          <div key={item} className="h-24 rounded-2xl bg-slate-200/70" />
        ))}
      </div>
      <div className="h-11 rounded-xl bg-slate-200/70" />
      <div className="space-y-3">
        {[0, 1, 2].map(item => (
          <div key={item} className="h-36 rounded-2xl bg-slate-200/70" />
        ))}
      </div>
    </div>
  );
}

export function AccountsPage({
  apiFetch,
  refreshKey,
  setActiveTab,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  refreshKey: number;
  setActiveTab: (tab: string) => void;
}) {
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [filter, setFilter] = useState<AccountFilter>('all');
  const accountsRef = useRef<ConnectedAccount[] | null>(null);

  const loadAccounts = async () => {
    const hasPreviousData = accountsRef.current !== null;
    if (!hasPreviousData) {
      setLoading(true);
      setError(null);
    }
    setRefreshWarning(null);

    try {
      const response = await apiFetch('/api/connected-accounts');
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to load accounts.');
      }

      const parsed = extractConnectedAccountsResponse(await response.json());
      accountsRef.current = parsed;
      setAccounts(parsed);
      setError(null);
    } catch (err: unknown) {
      if (hasPreviousData) {
        setRefreshWarning("Couldn't refresh account status. Showing the last loaded information.");
      } else {
        setError(err instanceof Error ? err.message : 'Unable to load accounts.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
    // The shared apiFetch function follows the existing app pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, refreshKey]);

  const counts = useMemo(() => {
    const current = accounts || [];
    return {
      known: current.length,
      institutions: new Set(current.map(account => account.institutionName)).size,
      attention: current.filter(account => NEEDS_ATTENTION.has(account.health)).length,
      connected: current.filter(account => account.health === 'healthy').length,
      disconnected: current.filter(account => account.health === 'disconnected').length,
    };
  }, [accounts]);

  const groups = useMemo(() => {
    const grouped = new Map<string, ConnectedAccount[]>();
    for (const account of (accounts || []).filter(item => matchesFilter(item, filter))) {
      const existing = grouped.get(account.institutionName) || [];
      existing.push(account);
      grouped.set(account.institutionName, existing);
    }

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([institutionName, institutionAccounts]) => ({
        institutionName,
        accounts: institutionAccounts.slice().sort(sortAccounts),
      }));
  }, [accounts, filter]);

  const filterCount = (filterId: AccountFilter): number => {
    if (filterId === 'connected') return counts.connected;
    if (filterId === 'attention') return counts.attention;
    if (filterId === 'disconnected') return counts.disconnected;
    return counts.known;
  };

  if (loading && accounts === null) {
    return (
      <div className="w-full max-w-6xl mx-auto pb-6">
        <div className="mb-7">
          <div className="h-8 w-36 rounded-lg bg-slate-200 animate-pulse mb-3" />
          <div className="h-5 w-72 max-w-full rounded bg-slate-200 animate-pulse" />
        </div>
        <LoadingState />
      </div>
    );
  }

  if (error && accounts === null) {
    return (
      <div className="w-full max-w-2xl mx-auto py-8 sm:py-16">
        <div className="bg-white border border-rose-100 rounded-3xl p-7 sm:p-10 text-center shadow-sm">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-rose-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Unable to load accounts</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => void loadAccounts()}
            className="min-h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (accounts?.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Accounts</h1>
          <p className="text-sm sm:text-base text-slate-500 mt-2">
            Your financial accounts and connection health.
          </p>
        </header>
        <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center shadow-sm">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <WalletCards className="w-7 h-7 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">No accounts found</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
            Add or review your bank connections in Settings.
          </p>
          <button
            onClick={() => setActiveTab('settings')}
            className="min-h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
          >
            <Settings className="w-4 h-4" />
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto pb-6">
      <header className="mb-7 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Accounts</h1>
          <p className="text-sm sm:text-base text-slate-500 mt-2">
            Your financial accounts and connection health.
          </p>
        </div>
        <button
          onClick={() => setActiveTab('settings')}
          className="min-h-11 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-sm font-semibold shadow-sm transition-colors"
        >
          <Settings className="w-4 h-4" />
          Manage connections
        </button>
      </header>

      {refreshWarning && (
        <div className="mb-5 p-4 rounded-2xl bg-amber-50 text-amber-800 border border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm font-medium">{refreshWarning}</p>
          <button
            onClick={() => void loadAccounts()}
            className="min-h-11 sm:min-h-0 text-left sm:text-right text-sm font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      <section aria-label="Account summary" className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5 shadow-sm min-w-0">
          <p className="text-[11px] sm:text-sm font-medium text-slate-500 leading-tight">Known accounts</p>
          <p data-testid="known-accounts-count" className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
            {counts.known}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5 shadow-sm min-w-0">
          <p className="text-[11px] sm:text-sm font-medium text-slate-500 leading-tight">Institutions</p>
          <p data-testid="institutions-count" className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
            {counts.institutions}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5 shadow-sm min-w-0">
          <p className="text-[11px] sm:text-sm font-medium text-slate-500 leading-tight">Need attention</p>
          <p data-testid="need-attention-count" className={`text-2xl sm:text-3xl font-bold mt-2 ${counts.attention > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {counts.attention}
          </p>
        </div>
      </section>

      <div
        role="group"
        aria-label="Filter accounts"
        className="grid grid-cols-2 sm:flex gap-2 mb-7"
      >
        {FILTERS.map(item => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            className={`min-h-11 px-3 sm:px-4 rounded-xl border text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
              filter === item.id
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span>{item.label}</span>
            <span className={`text-xs ${filter === item.id ? 'text-indigo-100' : 'text-slate-400'}`}>
              {filterCount(item.id)}
            </span>
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
          <h2 className="font-bold text-slate-900">No accounts match this filter</h2>
          <p className="text-sm text-slate-500 mt-2 mb-5">Try viewing all of your known accounts.</p>
          <button
            onClick={() => setFilter('all')}
            className="min-h-11 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold"
          >
            View all accounts
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(group => (
            <section key={group.institutionName} aria-label={group.institutionName}>
              <div className="flex items-center gap-3 mb-3 px-1">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 truncate">
                    {group.institutionName}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {group.accounts.length} {group.accounts.length === 1 ? 'account' : 'accounts'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {group.accounts.map(account => {
                  const status = healthPresentation(account.health);
                  const subtype = friendlySubtype(account.accountSubtype);
                  const isAttention = NEEDS_ATTENTION.has(account.health);

                  return (
                    <article
                      key={account.accountId}
                      data-account-name={account.accountName}
                      className={`rounded-2xl border p-4 sm:p-5 shadow-sm min-w-0 ${
                        account.health === 'disconnected'
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 truncate">
                            {account.institutionName}
                          </p>
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1 break-words">
                            {account.accountName}
                          </h3>
                        </div>
                        <span className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${status.badgeClasses}`}>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dotClasses}`} />
                          {status.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                        <span>{friendlyType(account.accountType)}</span>
                        {subtype && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">•</span>
                            <span>{subtype}</span>
                          </>
                        )}
                        <span aria-hidden="true" className="text-slate-300 hidden min-[360px]:inline">•</span>
                        <span className="font-mono text-slate-500 whitespace-nowrap">
                          {account.accountMask ? `••••${account.accountMask}` : 'Number unavailable'}
                        </span>
                      </div>

                      {isAttention && (
                        <button
                          onClick={() => setActiveTab('settings')}
                          className="mt-4 min-h-11 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 px-4 text-sm font-semibold text-amber-800 transition-colors"
                        >
                          Manage connection
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
