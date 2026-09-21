import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  ChevronRight,
  ExternalLink,
  PencilLine,
  Plus,
  RefreshCcw,
  Settings,
  X,
} from 'lucide-react';
import { extractConnectedAccountsResponse } from '../lib/api-contracts';
import { formatCurrency } from '../lib/formatters';
import { RetirementPerspectiveCard } from '../components/RetirementPerspectiveCard';
import type {
  AccountRole,
  ConnectedAccount,
  ConnectedAccountsResponse,
  FinancialPosition,
  ManualAccountKind,
} from '../types/finance';

export const NEEDS_ATTENTION = new Set([
  'login_required',
  'permission_revoked',
  'pending_disconnect',
  'unknown',
]);

type AccountFilter = 'all' | 'connected' | 'manual' | 'attention' | 'disconnected';

const FILTERS: Array<{ id: AccountFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'connected', label: 'Connected' },
  { id: 'manual', label: 'Manual' },
  { id: 'attention', label: 'Needs Attention' },
  { id: 'disconnected', label: 'Disconnected' },
];

const ROLE_LABELS: Record<AccountRole, string> = {
  operating: 'Operating',
  reserve: 'Reserve',
  retirement: 'Retirement',
  investment: 'Investment',
  health_savings: 'Health savings',
  debt: 'Debt',
  unassigned: 'Unassigned',
};

const ROLE_DESCRIPTIONS: Record<AccountRole, string> = {
  operating: 'Everyday bills and spending',
  reserve: 'Cash set aside for later',
  retirement: 'Long-term retirement savings',
  investment: 'Investments outside retirement',
  health_savings: 'Money reserved for healthcare',
  debt: 'Balances you still owe',
  unassigned: 'Purpose has not been confirmed',
};

const OWNER_ROLE_OPTIONS: AccountRole[] = [
  'operating', 'reserve', 'retirement', 'investment', 'health_savings', 'debt', 'unassigned',
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
  '401k': '401(k)',
  'roth 401k': 'Roth 401(k)',
  roth_401k: 'Roth 401(k)',
  real_estate: 'Real estate',
  vehicle: 'Vehicle',
};

const ASSET_KINDS = new Set<ManualAccountKind>(['real_estate', 'vehicle']);

const VALUATION_LOOKUPS: Partial<Record<ManualAccountKind, { label: string; href: string }>> = {
  real_estate: {
    label: 'Look up on Zillow',
    href: 'https://www.zillow.com/how-much-is-my-home-worth/',
  },
  vehicle: {
    label: 'Look up on Kelley Blue Book',
    href: 'https://www.kbb.com/car-values/',
  },
};

function isManualAsset(account: ConnectedAccount): boolean {
  return account.source === 'manual' && account.manualKind !== null && ASSET_KINDS.has(account.manualKind);
}

function shouldReviewManualAssetEstimate(account: ConnectedAccount, now = Date.now()): boolean {
  if (!isManualAsset(account) || !account.fetchedAt) return false;
  const updatedAt = new Date(account.fetchedAt).getTime();
  return Number.isFinite(updatedAt) && now - updatedAt >= 120 * 24 * 60 * 60 * 1000;
}

function manualDefaults(kind: ManualAccountKind) {
  if (kind === 'real_estate') {
    return { institutionName: 'Property', accountName: 'Primary home', accountMask: '' };
  }
  if (kind === 'vehicle') {
    return { institutionName: 'Vehicles', accountName: 'Vehicle', accountMask: '' };
  }
  if (kind === 'retirement') {
    return { institutionName: 'Employer plan', accountName: '401(k)', accountMask: '' };
  }
  if (kind === 'investment') {
    return { institutionName: 'Brokerage', accountName: 'Investment account', accountMask: '' };
  }
  return {
    institutionName: 'Apple / Goldman Sachs', accountName: 'Apple Savings', accountMask: '',
  };
}

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
    case 'manual':
      return {
        label: 'Manual',
        badgeClasses: 'bg-violet-50 text-violet-700 border-violet-200',
        dotClasses: 'bg-violet-500',
      };
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
  if (filter === 'connected') return account.source === 'linked' && account.health === 'healthy';
  if (filter === 'manual') return account.source === 'manual';
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

function describeBalanceFreshness(account: ConnectedAccount): string {
  if (account.balanceStatus === 'missing' || !account.fetchedAt) return 'Balance not reported';
  const date = new Date(account.fetchedAt);
  const when = Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
  if (isManualAsset(account)) return `Estimated value · updated ${when}`;
  if (account.source === 'manual') return `Manual balance · updated ${when}`;
  return account.balanceStatus === 'fresh' ? `Updated ${when}` : `Stale · last updated ${when}`;
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
  const [roleSummary, setRoleSummary] = useState<ConnectedAccountsResponse['summary'] | null>(null);
  const [financialPosition, setFinancialPosition] = useState<FinancialPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [savingRoleFor, setSavingRoleFor] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState({
    institutionName: 'Apple / Goldman Sachs',
    accountName: 'Apple Savings',
    accountMask: '',
    kind: 'savings' as ManualAccountKind,
    balance: '',
  });
  const [balanceAccountId, setBalanceAccountId] = useState<string | null>(null);
  const [balanceDraft, setBalanceDraft] = useState('');
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
      accountsRef.current = parsed.accounts;
      setAccounts(parsed.accounts);
      setRoleSummary(parsed.summary);
      setFinancialPosition(parsed.financialPosition);
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

  const createManualAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setManualSaving(true);
    setManualError(null);
    try {
      const balance = Number(manualDraft.balance);
      const response = await apiFetch('/api/manual-accounts', {
        method: 'POST',
        body: JSON.stringify({ ...manualDraft, balance, isoCurrencyCode: 'USD' }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to add this manual account.');
      }
      setShowManualForm(false);
      setManualDraft({
        institutionName: '', accountName: '', accountMask: '', kind: 'savings', balance: '',
      });
      await loadAccounts();
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : 'Unable to add this manual account.');
    } finally {
      setManualSaving(false);
    }
  };

  const updateManualBalance = async (account: ConnectedAccount) => {
    setManualSaving(true);
    setManualError(null);
    try {
      const response = await apiFetch(`/api/manual-accounts/${encodeURIComponent(account.accountId)}/balance`, {
        method: 'PUT',
        body: JSON.stringify({ balance: Number(balanceDraft) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to update this balance.');
      }
      setBalanceAccountId(null);
      setBalanceDraft('');
      await loadAccounts();
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : 'Unable to update this balance.');
    } finally {
      setManualSaving(false);
    }
  };

  const captureBalances = async () => {
    setSnapshotting(true);
    setSnapshotMessage(null);
    setSnapshotError(null);
    try {
      const response = await apiFetch('/api/account-balances/refresh', { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to capture balances.');
      const issueCount = Array.isArray(payload?.errors) ? payload.errors.length : 0;
      setSnapshotMessage(issueCount > 0
        ? `Balances were saved with ${issueCount} connection ${issueCount === 1 ? 'issue' : 'issues'}.`
        : "Today's balances were saved.");
      await loadAccounts();
    } catch (snapshotCaptureError) {
      setSnapshotError(snapshotCaptureError instanceof Error ? snapshotCaptureError.message : 'Unable to capture balances.');
    } finally {
      setSnapshotting(false);
    }
  };

  const saveRole = async (account: ConnectedAccount, value: string) => {
    setSavingRoleFor(account.accountId);
    setRoleError(null);
    try {
      const response = await apiFetch(`/api/account-roles/${encodeURIComponent(account.accountId)}`, {
        method: 'PUT',
        body: JSON.stringify({ role: value === 'automatic' ? null : value }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to save this account role.');
      }
      await loadAccounts();
    } catch (err: unknown) {
      setRoleError(err instanceof Error ? err.message : 'Unable to save this account role.');
    } finally {
      setSavingRoleFor(null);
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
      connected: current.filter(account => account.source === 'linked' && account.health === 'healthy').length,
      manual: current.filter(account => account.source === 'manual').length,
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
    if (filterId === 'manual') return counts.manual;
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

  return (
    <div className="w-full max-w-6xl mx-auto pb-6">
      <header className="mb-7 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Accounts</h1>
          <p className="text-sm sm:text-base text-slate-500 mt-2">
            Your financial accounts and connection health.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => setShowManualForm(value => !value)}
            className="min-h-11 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-semibold shadow-sm transition-colors"
          >
            {showManualForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showManualForm ? 'Close form' : 'Add account or asset'}
          </button>
          <button
            type="button"
            onClick={() => void captureBalances()}
            disabled={snapshotting}
            className="min-h-11 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-sm font-semibold shadow-sm transition-colors disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCcw className={`w-4 h-4 ${snapshotting ? 'animate-spin' : ''}`} />
            {snapshotting ? 'Capturing…' : 'Capture balances'}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className="min-h-11 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-sm font-semibold shadow-sm transition-colors"
          >
            <Settings className="w-4 h-4" />
            Manage connections
          </button>
        </div>
      </header>

      {snapshotMessage && <p className="mb-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{snapshotMessage}</p>}
      {snapshotError && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{snapshotError}</p>}

      {showManualForm && (
        <form onSubmit={createManualAccount} className="mb-6 rounded-3xl border border-violet-200 bg-violet-50 p-4 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="font-bold text-slate-900">Add a manual account or asset</h2>
            <p className="mt-1 text-xs text-slate-600">
              Add an unlinked balance, home, or vehicle. Property estimates count toward net worth but never Safe to Spend.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-semibold text-slate-600">
              Source or group
              <input required maxLength={80} value={manualDraft.institutionName} onChange={event => setManualDraft(value => ({ ...value, institutionName: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-900" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Account or asset name
              <input required maxLength={80} value={manualDraft.accountName} onChange={event => setManualDraft(value => ({ ...value, accountName: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-900" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Type
              <select value={manualDraft.kind} onChange={event => {
                const kind = event.target.value as ManualAccountKind;
                setManualDraft(value => ({ ...value, ...manualDefaults(kind), kind }));
              }} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-900">
                <option value="savings">Savings</option>
                <option value="retirement">Retirement</option>
                <option value="investment">Investment</option>
                <option value="real_estate">House / real estate</option>
                <option value="vehicle">Car / vehicle</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              {ASSET_KINDS.has(manualDraft.kind) ? 'Estimated value' : 'Balance'}
              <input required min="0" step="0.01" inputMode="decimal" type="number" value={manualDraft.balance} onChange={event => setManualDraft(value => ({ ...value, balance: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-900" />
            </label>
            {ASSET_KINDS.has(manualDraft.kind) ? (
              <div className="text-xs font-semibold text-slate-600">
                Estimate helper
                <a
                  href={VALUATION_LOOKUPS[manualDraft.kind]?.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-semibold text-violet-700 inline-flex items-center justify-center gap-2 hover:bg-violet-100"
                >
                  {VALUATION_LOOKUPS[manualDraft.kind]?.label}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            ) : (
              <label className="text-xs font-semibold text-slate-600">
                Last 4 <span className="font-normal text-slate-400">(optional)</span>
                <input pattern="[0-9]{4}" inputMode="numeric" maxLength={4} value={manualDraft.accountMask} onChange={event => setManualDraft(value => ({ ...value, accountMask: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-900" />
              </label>
            )}
          </div>
          {ASSET_KINDS.has(manualDraft.kind) && (
            <p className="mt-3 text-xs text-slate-500">
              Open the estimate tool, then enter the value you want to use. This is a planning estimate, not an appraisal.
            </p>
          )}
          {manualError && <p className="mt-3 text-sm font-medium text-rose-700">{manualError}</p>}
          <button disabled={manualSaving} className="mt-4 min-h-11 rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white disabled:opacity-60">
            {manualSaving ? 'Saving…' : ASSET_KINDS.has(manualDraft.kind) ? 'Save asset' : 'Save manual account'}
          </button>
        </form>
      )}

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

      {roleError && (
        <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">
          {roleError}
        </div>
      )}

      {manualError && !showManualForm && (
        <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">
          {manualError}
        </div>
      )}

      {roleSummary && (
        <section aria-label="Money by purpose" className="mb-7">
          <div className="mb-3 px-1">
            <h2 className="font-bold text-slate-900">Money by purpose</h2>
            <p className="mt-1 text-xs text-slate-500">
              Retirement, investment, home, and vehicle values never enter Safe to Spend.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(['operating', 'reserve', 'retirement', 'investment', 'health_savings', 'debt'] as AccountRole[])
              .map(role => {
                const bucket = roleSummary.buckets[role];
                return (
                  <div key={role} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {ROLE_LABELS[role]}
                    </p>
                    <p className="mt-1 truncate text-lg font-bold text-slate-900">
                      {formatCurrency(bucket.total)}
                    </p>
                    <p className="mt-1 text-xs leading-snug text-slate-500">{ROLE_DESCRIPTIONS[role]}</p>
                  </div>
                );
              })}
          </div>
          {roleSummary.buckets.unassigned.accountCount > 0 && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {roleSummary.buckets.unassigned.accountCount}{' '}
              {roleSummary.buckets.unassigned.accountCount === 1 ? 'account needs' : 'accounts need'} a confirmed purpose.
            </p>
          )}
        </section>
      )}

      <section aria-label="Account summary" className="mb-7 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
        <p data-testid="account-status" className="text-sm font-semibold text-slate-800">
          {counts.known} {counts.known === 1 ? 'account' : 'accounts'} across {counts.institutions}{' '}
          {counts.institutions === 1 ? 'institution' : 'institutions'}
          <span className="text-slate-400"> · </span>
          <span className={counts.attention > 0 ? 'text-amber-700' : 'text-emerald-700'}>
            {counts.attention > 0
              ? `${counts.attention} ${counts.attention === 1 ? 'needs' : 'need'} attention`
              : 'Everything is connected'}
          </span>
        </p>
        {counts.attention > 0 && (
          <p className="mt-1 text-xs text-slate-500">Needs attention means a connection may need you to sign in again or approve access.</p>
        )}
      </section>

      {financialPosition && (
        <>
          <section aria-label="Full savings picture" className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Liquid cash</p>
              <p className="mt-1 text-xl font-bold text-emerald-950">{formatCurrency(financialPosition.liquidCash)}</p>
              <p className="mt-1 text-xs text-emerald-800">Linked deposits plus included manual savings</p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Liquid savings</p>
              <p className="mt-1 text-xl font-bold text-sky-950">{formatCurrency(financialPosition.liquidSavings)}</p>
              <p className="mt-1 text-xs text-sky-800">Reserve cash, separate from retirement</p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Estimated net worth</p>
              <p className="mt-1 text-xl font-bold text-indigo-950">{formatCurrency(financialPosition.estimatedNetWorth)}</p>
              <p className="mt-1 text-xs text-indigo-800">Linked balances plus manual asset estimates</p>
            </div>
          </section>
          {financialPosition.excludedDuplicateCount > 0 && (
            <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {financialPosition.excludedDuplicateCount} possible duplicate manual account is shown below but excluded from every total.
            </p>
          )}
          <RetirementPerspectiveCard position={financialPosition} />
        </>
      )}

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
                  const asset = isManualAsset(account);
                  const reviewAssetEstimate = shouldReviewManualAssetEstimate(account);

                  return (
                    <article
                      key={account.accountId}
                      data-account-name={account.accountName}
                      className={`rounded-2xl border p-4 sm:p-5 shadow-sm min-w-0 ${
                        account.source === 'manual'
                          ? 'bg-violet-50/40 border-violet-200'
                          : account.health === 'disconnected'
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
                        {!asset && (
                          <>
                            <span aria-hidden="true" className="text-slate-300 hidden min-[360px]:inline">•</span>
                            <span className="font-mono text-slate-500 whitespace-nowrap">
                              {account.accountMask ? `••••${account.accountMask}` : 'Number unavailable'}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium text-slate-500">
                            {asset
                              ? 'Estimated value'
                              : account.role === 'retirement'
                                ? 'Reference balance'
                                : 'Current balance'}
                          </p>
                          <p className="mt-1 text-lg font-bold text-slate-900">
                            {formatCurrency(account.current)}
                          </p>
                          <p className={`mt-1 text-xs ${account.balanceStatus === 'stale' ? 'font-medium text-amber-700' : 'text-slate-500'}`}>
                            {describeBalanceFreshness(account)}
                          </p>
                          {reviewAssetEstimate && (
                            <p className="mt-1 text-xs font-medium text-amber-700">
                              This estimate is over 4 months old. Consider reviewing it.
                            </p>
                          )}
                        </div>
                        {asset ? (
                          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-xs text-indigo-800">
                            <p className="font-semibold">Included in estimated net worth</p>
                            <p className="mt-1">Excluded from cash, savings, and Safe to Spend.</p>
                          </div>
                        ) : (
                          <label className="block text-xs font-medium text-slate-600">
                            Purpose
                            <select
                              aria-label={`Purpose for ${account.accountName}`}
                              value={account.roleSource === 'owner' ? account.role : 'automatic'}
                              disabled={savingRoleFor === account.accountId}
                              onChange={event => void saveRole(account, event.target.value)}
                              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 disabled:opacity-60"
                            >
                              <option value="automatic">
                                {account.requiresRoleConfirmation
                                  ? `Needs confirmation${account.suggestedRole ? ` · suggest ${ROLE_LABELS[account.suggestedRole]}` : ''}`
                                  : `Automatic · ${ROLE_LABELS[account.defaultRole]}`}
                              </option>
                              {OWNER_ROLE_OPTIONS.map(role => (
                                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                              ))}
                            </select>
                            <span className="mt-1 block text-[11px] text-slate-400">
                              {savingRoleFor === account.accountId
                                ? 'Saving…'
                                : account.roleSource === 'owner'
                                  ? 'You assigned this purpose.'
                                  : 'Assigned from the account subtype.'}
                            </span>
                          </label>
                        )}
                      </div>

                      {account.duplicateOfAccountId && (
                        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                          Possible match to a linked account. This manual balance is excluded from cash, savings, retirement, and net-worth totals.
                        </p>
                      )}

                      {account.source === 'manual' && (
                        <div className="mt-4">
                          {balanceAccountId === account.accountId ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <label className="flex-1 text-xs font-medium text-slate-600">
                                {asset ? 'New estimated value' : 'New balance'}
                                <input
                                  autoFocus
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  inputMode="decimal"
                                  value={balanceDraft}
                                  onChange={event => setBalanceDraft(event.target.value)}
                                  className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm"
                                />
                              </label>
                              <button
                                disabled={manualSaving || balanceDraft === ''}
                                onClick={() => void updateManualBalance(account)}
                                className="min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
                              >
                                {manualSaving ? 'Saving…' : asset ? 'Save value' : 'Save balance'}
                              </button>
                              <button
                                onClick={() => { setBalanceAccountId(null); setBalanceDraft(''); }}
                                className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setManualError(null);
                                setBalanceAccountId(account.accountId);
                                setBalanceDraft(account.current === null ? '' : String(account.current));
                              }}
                              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 text-sm font-semibold text-violet-700 hover:bg-violet-50"
                            >
                              <PencilLine className="h-4 w-4" />
                              {asset ? 'Update estimated value' : 'Update balance'}
                            </button>
                          )}
                        </div>
                      )}

                      {account.source === 'linked' && isAttention && (
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
