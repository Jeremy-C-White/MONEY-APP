import React, { useCallback, useEffect, useState, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { auth, signInWithGoogle, logOut } from './firebase';
import { LogIn, LogOut, RefreshCcw, Landmark, FileSpreadsheet, Loader2, Link2Off, CheckCircle2, AlertTriangle, X } from 'lucide-react';

import { DeveloperVerification } from './components/DeveloperVerification';
import { AppShell } from './components/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { TransactionsPage, type TransactionsViewMode } from './pages/TransactionsPage';
import { AccountsPage } from './pages/AccountsPage';
import { SandboxAcceptance } from './components/SandboxAcceptance';
import { extractStatusResponse } from './lib/api-contracts';
import {
  STATUS_REFRESH_INTERVAL_MS,
  shouldRefreshStatus,
} from './lib/status-refresh';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const repairingItemIdRef = useRef<string | null>(null);
  const lastStatusAttemptAtRef = useRef<number | null>(null);
  
  const [plaidItems, setPlaidItems] = useState<any[]>([]);
  const [trialItemsConfirmed, setTrialItemsConfirmed] = useState(0);
  const [trialItemsUnresolved, setTrialItemsUnresolved] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasLoadedStatus, setHasLoadedStatus] = useState(false);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  
  const [message, setMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [transactionsInitialView, setTransactionsInitialView] =
    useState<TransactionsViewMode>('posted');
  const [refreshKey, setRefreshKey] = useState(0);

  const navigateToTab = (tab: string) => {
    if (tab === 'transactions') setTransactionsInitialView('posted');
    setActiveTab(tab);
  };

  const openNeedsReview = () => {
    setTransactionsInitialView('needs_review');
    setActiveTab('transactions');
  };
  
  const showMessage = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 8000);
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    if (errorParam) {
       let msg = "Google Authentication Failed.";
       if (errorParam === 'oauth_denied') msg = "Google access was denied.";
       if (errorParam === 'no_refresh_token') msg = "Please disconnect and reconnect Google, ensuring you grant all requested permissions.";
       showMessage(msg, 'error');
       window.history.replaceState({}, document.title, window.location.pathname);
    }

    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        fetchStatus();
      } else {
        setPlaidItems([]);
        setGoogleConnected(false);
        setHasLoadedStatus(false);
        setStatusUnavailable(false);
        lastStatusAttemptAtRef.current = null;
      }
    });
    return () => unsubscribe();
  }, []);

  const apiFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    if (!auth.currentUser) throw new Error("No user");
    const token = await auth.currentUser.getIdToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
    return fetch(endpoint, { ...options, headers });
  }, []);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
    } catch (error) {
      showMessage("Sign in failed.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const connectGoogleSheets = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/auth/google/url');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      showMessage("Failed to start Google Sheets connection.", 'error');
      setLoading(false);
    }
  };
  
  const disconnectGoogle = async () => {
    try {
       setLoading(true);
       const res = await apiFetch('/api/auth/google/disconnect', { method: 'POST' });
       if (!res.ok) throw new Error("Failed to disconnect from server");
       setGoogleConnected(false);
       showMessage("Google Sheets disconnected.", 'success');
    } catch (error) {
       showMessage("Failed to disconnect.", 'error');
    } finally {
       setLoading(false);
    }
  };

  const [serverConfigError, setServerConfigError] = useState<string | null>(null);

  const fetchStatus = async () => {
    lastStatusAttemptAtRef.current = Date.now();
    try {
      const res = await apiFetch(`/api/status`);
      const body: unknown = await res.json();
      const errorData = body as { error?: unknown; details?: unknown };
      if (res.status === 500 && errorData.error === "Server Configuration Error") {
        setServerConfigError(
          typeof errorData.details === 'string'
            ? errorData.details
            : "Required environment variables are missing on the backend."
        );
        setStatusUnavailable(true);
        return;
      }
      if (!res.ok) {
        throw new Error(
          typeof errorData.error === 'string'
            ? errorData.error
            : 'Connection status is temporarily unavailable.'
        );
      }
      const data = extractStatusResponse(body);
      setServerConfigError(null);
      setPlaidItems(data.items);
      setTrialItemsConfirmed(data.trialItemsConfirmed);
      setTrialItemsUnresolved(data.trialItemsUnresolved);
      setGoogleConnected(data.googleConnected);
      setHasLoadedStatus(true);
      setStatusUnavailable(false);
    } catch (error) {
      console.error(error);
      setStatusUnavailable(true);
    }
  };

  useEffect(() => {
    if (!user) return;
    const refreshIfDue = () => {
      if (shouldRefreshStatus(
        lastStatusAttemptAtRef.current,
        Date.now(),
        document.visibilityState === 'visible'
      )) {
        void fetchStatus();
      }
    };
    const intervalId = window.setInterval(refreshIfDue, STATUS_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshIfDue);
    };
  }, [user]);

  const generateLinkToken = async (internalItemId?: string) => {
    if (!user) return;
    try {
      setLoading(true);
      repairingItemIdRef.current = internalItemId || null;
      const res = await apiFetch('/api/plaid/create_link_token', {
        method: 'POST',
        body: JSON.stringify({ internalItemId }),
      });
      if (!res.ok) {
        let err;
        try { err = await res.json(); } catch(e) {}
        if (err?.code === 'UNRESOLVED_PRODUCTION_EXCHANGE') {
          await fetchStatus();
          showMessage(err.error || "A previous Production connection attempt has an unresolved outcome. Reconcile it before connecting another bank.", 'error');
          return;
        }
        throw new Error((err && err.error) || "Failed to start Plaid session.");
      }
      const data = await res.json();
      setLinkToken(data.link_token);
      setSessionId(data.session_id);
    } catch (error: any) {
      showMessage(error.message || "Failed to start Plaid Link.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const onSuccess = async (public_token: string, metadata: any) => {
    if (!user) return;
    try {
      setLoading(true);
      const repairingItemId = repairingItemIdRef.current;
      
      if (repairingItemId) {
        const res = await apiFetch('/api/plaid/item/repair', {
          method: 'PUT',
          body: JSON.stringify({ internalItemId: repairingItemId })
        });
        if (!res.ok) throw new Error("Backend repair verification failed");
        
        await fetchStatus();
        showMessage(`Successfully repaired connection to ${metadata.institution?.name || 'bank'}!`, 'success');
        return;
      }

      // New Connection: Server is the sole authoritative duplicate engine
      const institutionId = metadata.institution?.institution_id;
      const newAccounts = metadata.accounts || [];

      let exchangeResponse = await apiFetch('/api/plaid/exchange_public_token', {
        method: 'POST',
        body: JSON.stringify({ 
          public_token,
          institution_id: institutionId,
          institution_name: metadata.institution?.name,
          accounts: newAccounts.map((a: any) => ({
            id: a.id, name: a.name, mask: a.mask, type: a.type, subtype: a.subtype
          })),
          session_id: sessionId
        }),
      });

      if (exchangeResponse.status === 409) {
        let err;
        try { err = await exchangeResponse.clone().json(); } catch(e) {}
        if (err && err.code === 'DUPLICATE_ABORTED') {
          showMessage("Duplicate connection prevented. This account appears to already be connected, so no new Plaid Item was created.", 'info');
          return;
        }
        if (err && err.code === 'UNRESOLVED_PRODUCTION_EXCHANGE') {
          await fetchStatus();
          showMessage(err.error || "A previous Production connection attempt has an unresolved outcome. Reconcile it before connecting another bank.", 'error');
          return;
        }
        if (err && err.code === 'DUPLICATE_CONFIRMATION_REQUIRED') {
          const proceed = window.confirm(`We detected a potential duplicate connection for ${metadata.institution?.name || 'this bank'}. This might consume an extra production trial slot. Do you want to proceed and connect it anyway?`);
          if (!proceed) {
            setLinkToken(null);
            setSessionId(null);
            setLoading(false);
            return;
          }
          const confirmRes = await apiFetch('/api/plaid/confirm_duplicate', {
            method: 'POST',
            body: JSON.stringify({ session_id: sessionId })
          });
          if (!confirmRes.ok) {
            let confirmErr;
            try { confirmErr = await confirmRes.json(); } catch(e) {}
            throw new Error(confirmErr?.error || "Failed to confirm duplicate connection.");
          }
          
          // Retry exchange with fingerprint-bound session
          exchangeResponse = await apiFetch('/api/plaid/exchange_public_token', {
            method: 'POST',
            body: JSON.stringify({ 
              public_token,
              institution_id: institutionId,
              institution_name: metadata.institution?.name,
              accounts: newAccounts.map((a: any) => ({
                id: a.id, name: a.name, mask: a.mask, type: a.type, subtype: a.subtype
              })),
              session_id: sessionId
            }),
          });
        }
      }
         
      if (!exchangeResponse.ok) {
        let err;
        try { err = await exchangeResponse.json(); } catch(e) {}
        if (err && err.code === 'DUPLICATE_ABORTED') {
          showMessage("Duplicate connection prevented. This account appears to already be connected, so no new Plaid Item was created.", 'info');
          return;
        }
        if (err && err.code === 'UNRESOLVED_PRODUCTION_EXCHANGE') {
          await fetchStatus();
          showMessage(err.error || "A previous Production connection attempt has an unresolved outcome. Reconcile it before connecting another bank.", 'error');
          return;
        }
        if (err && err.code === 'PLAID_EXCHANGE_OUTCOME_UNKNOWN') {
          await fetchStatus();
          showMessage("Connection outcome uncertain. Plaid may already have created this Item. FinSync has blocked new Production connections until this attempt is reconciled.", 'error');
          return;
        }
        if (err && err.code === 'PLAID_PERSISTENCE_FAILED') {
          await fetchStatus();
          showMessage("Failed to durably store access token. Attempt remains unresolved in quota accounting.", 'error');
          return;
        }
        throw new Error((err && err.error) || "Failed to securely persist connection.");
      }
      await fetchStatus();
      showMessage(`Successfully linked ${metadata.institution?.name || 'bank account'}!`, 'success');
    } catch (error: any) {
      showMessage(error.message || "Failed to connect securely.", 'error');
    } finally {
      setLoading(false);
      setLinkToken(null);
      setSessionId(null);
      repairingItemIdRef.current = null;
    }
  };
  
  const onExit = async (error: any, metadata: any) => {
    if (sessionId) {
      apiFetch('/api/plaid/exit', {
         method: 'POST',
         body: JSON.stringify({ session_id: sessionId, error, metadata })
      }).catch(console.error);
    }
    setLinkToken(null);
    setSessionId(null);
    repairingItemIdRef.current = null;
  };

  const { open, ready } = usePlaidLink({
    token: linkToken!,
    onSuccess,
    onExit
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);
  
  const removeBank = async (internalItemId: string) => {
    if (!confirm("Are you sure you want to disconnect this bank? It will stop syncing future transactions, but will NOT restore a Trial quota slot.")) return;
    try {
      setLoading(true);
      const res = await apiFetch('/api/plaid/item/remove', {
         method: 'POST',
         body: JSON.stringify({ internalItemId })
      });
      if (!res.ok) throw new Error("Failed to disconnect bank on server");
      showMessage("Bank disconnected.", 'info');
      await fetchStatus();
    } catch (e) {
      showMessage("Failed to disconnect.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const triggerServerSync = async () => {
    if (!user || plaidItems.length === 0) return;
    if (!googleConnected) {
      showMessage("Please connect Google Sheets first.", 'error');
      return;
    }

    try {
      setSyncing(true);
      showMessage("Syncing transactions from Plaid to Sheets...", 'info');
      
      const res = await apiFetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 409 && data.code === 'SYNC_ALREADY_RUNNING') {
          showMessage(data.error || "A transaction sync is already in progress.", 'info');
          return;
        }
        const e = new Error(data.error || "Sync failed");
        (e as any).code = data.code;
        throw e;
      }
      
      let msg = `Sync complete! Added ${data.added || 0} rows, updated ${data.updated || 0} rows.`;
      if (data.errors && data.errors.length > 0) {
         msg += ` Notice: ${data.errors.join(' | ')}`;
         showMessage(msg, 'error');
      } else {
         showMessage(msg, 'success');
      }
      
      setRefreshKey(prev => prev + 1);
      fetchStatus(); // Refresh statuses in case any items broke during sync
    } catch (error: any) {
      if (error.code === 'GOOGLE_REAUTH_REQUIRED') {
         showMessage("Google Sheets authorization expired. Please reconnect.", 'error');
         setGoogleConnected(false);
      } else if (error.code === 'SHEET_SCHEMA_MISMATCH') {
         showMessage(error.message, 'error');
      } else {
         showMessage(error.message || "An error occurred during sync.", 'error');
      }
      fetchStatus(); // P1: Refresh status after sync failure
    } finally {
      setSyncing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans overflow-x-hidden">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-10 py-6 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <Landmark className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">FinSync</h1>
          </div>
          <button
            onClick={handleSignIn}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-100"
          >
            <LogIn className="h-4 w-4" />
            Sign in
          </button>
        </header>
        <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-12 flex flex-col items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-bold text-slate-700 mb-4">Welcome to FinSync</h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">Please sign in to access your financial overview and settings.</p>
            <button
              onClick={handleSignIn}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-100 mx-auto"
            >
              <LogIn className="h-5 w-5" />
              Sign in with Google
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <AppShell 
      syncing={syncing}
      onSync={triggerServerSync}
      activeTab={activeTab}
      setActiveTab={navigateToTab}
    >
      {message && (
        <div className={`mb-6 p-4 rounded-xl flex items-center justify-between shadow-sm ${
          message.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'overview' && (
        <OverviewPage
          apiFetch={apiFetch}
          refreshKey={refreshKey}
          onReviewTransactions={openNeedsReview}
        />
      )}
      
      {activeTab === 'transactions' && (
        <TransactionsPage
          apiFetch={apiFetch}
          refreshKey={refreshKey}
          initialViewMode={transactionsInitialView}
        />
      )}

      {activeTab === 'accounts' && (
        <AccountsPage apiFetch={apiFetch} refreshKey={refreshKey} setActiveTab={navigateToTab} />
      )}
      
      {activeTab === 'settings' && (
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Settings & Developer Tools</h2>
            <button
              onClick={logOut}
              className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>

          {statusUnavailable && (
            <div className="mb-8 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {hasLoadedStatus
                    ? 'Connection status could not be refreshed. Showing the last known connection information; no connection changes were made.'
                    : 'Connection status is temporarily unavailable. Your existing bank and Google Sheets connections have not been changed.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchStatus()}
                className="self-start whitespace-nowrap font-semibold underline underline-offset-2 sm:self-auto"
              >
                Retry status
              </button>
            </div>
          )}

          {/* Data Sync Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileSpreadsheet className={`h-5 w-5 ${googleConnected ? 'text-emerald-600' : 'text-slate-400'}`} />
                Offline Google Sheets Vault
              </h3>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Server-side incremental syncs safely upsert your raw transaction ledger.
              </p>
            </div>
            
            <div className="flex flex-col gap-4 mt-6">
              {!hasLoadedStatus && statusUnavailable ? (
                <p className="text-sm font-medium text-amber-700">
                  Connection status unavailable. Please try again shortly.
                </p>
              ) : !googleConnected ? (
                <button
                  onClick={connectGoogleSheets}
                  disabled={loading}
                  className="w-full md:w-auto bg-slate-100 hover:bg-slate-200 text-slate-900 px-4 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                >
                  Authorize Google Sheets Offline Access
                </button>
              ) : (
                <div className="flex gap-3">
                   <button
                      onClick={triggerServerSync}
                      disabled={syncing || plaidItems.length === 0 || statusUnavailable}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 shadow-lg shadow-indigo-100"
                    >
                      {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                      {syncing ? "Syncing Background..." : "Sync Latest Transactions"}
                    </button>
                    <button 
                       onClick={disconnectGoogle}
                       title="Disconnect Google"
                       className="bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 px-4 py-3 rounded-xl transition-colors"
                    >
                       <Link2Off className="h-4 w-4" />
                    </button>
                </div>
              )}
            </div>
          </div>

          {/* Plaid Connection Card */}
          <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl flex flex-col justify-between mb-8">
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-white/70" />
                    Bank Connection
                  </h3>
                  <p className="text-sm text-white/60 mt-1 leading-relaxed">
                    Link your accounts via Plaid securely. 10-Item Trial safe.
                  </p>
                </div>
              </div>
              <div className="mt-6 p-4 bg-white/10 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs opacity-70 italic font-medium">Conservative Trial Usage</span>
                  <span className="text-xs font-mono font-bold">
                    {hasLoadedStatus
                      ? `${trialItemsConfirmed + trialItemsUnresolved} / 10`
                      : statusUnavailable ? 'Unavailable' : 'Loading...'}
                  </span>
                </div>
                {!hasLoadedStatus ? (
                  <p className="mb-2 border-t border-white/10 pt-2 text-[11px] opacity-70">
                    Waiting for verified connection status.
                  </p>
                ) : trialItemsUnresolved > 0 ? (
                  <div className="space-y-1 mb-2 pt-1 border-t border-white/10">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="opacity-70">Confirmed Items:</span>
                      <span className="font-mono">{trialItemsConfirmed}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-amber-300 font-medium">Unresolved Attempts:</span>
                      <span className="font-mono text-amber-300 font-bold">{trialItemsUnresolved}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center mb-2 text-[11px]">
                    <span className="opacity-70">Confirmed Items:</span>
                    <span className="font-mono">{trialItemsConfirmed}</span>
                  </div>
                )}
                <p className="text-[10px] opacity-40 leading-relaxed">Persistent token storage active. Duplicate Item prevention enforced. Slots are not restored by disconnecting.</p>
              </div>

              {trialItemsUnresolved > 0 && (
                <div className="mt-4 bg-amber-500/20 border border-amber-400/40 rounded-xl p-3.5 text-xs text-amber-200">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300 mb-1">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Connection Review Required
                  </div>
                  <p className="opacity-90 leading-relaxed">
                    A previous Production bank connection has an unresolved outcome. Plaid may already have created that Item. Do not reconnect the bank until the unresolved attempt has been reconciled.
                  </p>
                </div>
              )}
            </div>
            
            <button
              onClick={() => generateLinkToken()} 
              disabled={loading || trialItemsUnresolved > 0 || statusUnavailable || !hasLoadedStatus}
              title={statusUnavailable || !hasLoadedStatus
                ? "Connection status must be verified before linking another Production bank"
                : trialItemsUnresolved > 0
                  ? "Blocked while an unresolved Production exchange exists"
                  : undefined}
              className="w-full md:w-auto self-start flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed mt-6"
            >
              {loading && !linkToken && !repairingItemIdRef.current ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Connect New Bank
            </button>
          </div>

          {/* Connected Institutions Preview */}
          {plaidItems.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden mb-8">
              <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-lg text-slate-900">Connected Institutions</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {plaidItems.map((item) => (
                  <div key={item.internal_id} className="px-6 py-4 flex justify-between items-center hover:bg-slate-50 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{item.institution_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-wide font-semibold">
                        Health: {item.health.replace(/_/g, ' ')} 
                        {item.has_updates && ' • Updates Available'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.health === 'login_required' ? (
                        <button
                           onClick={() => generateLinkToken(item.internal_id)}
                           className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100 font-medium transition-colors"
                        >
                           <RefreshCcw className="h-3.5 w-3.5" />
                           Repair
                        </button>
                      ) : item.has_updates && (item.auto_sync_status === 'queued' || item.auto_sync_status === 'running') ? (
                        <span className="flex items-center gap-1.5 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg font-medium">
                          {item.auto_sync_status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                          {item.auto_sync_status === 'running' ? 'Syncing' : 'Sync queued'}
                        </span>
                      ) : item.has_updates ? (
                        <button
                          onClick={triggerServerSync}
                          title={item.auto_sync_error || 'Automatic sync is unavailable; run it now.'}
                          className="flex items-center gap-1.5 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 font-medium transition-colors"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                          Sync now
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg font-medium">
                           <CheckCircle2 className="h-3.5 w-3.5" />
                           ACTIVE
                        </span>
                      )}
                      <button 
                         onClick={() => removeBank(item.internal_id)}
                         className="text-slate-400 hover:text-rose-600 transition-colors ml-4"
                         title="Disconnect Bank"
                      >
                         <LogOut className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <DeveloperVerification user={user} />
          {(import.meta as any).env.VITE_ENABLE_SANDBOX_ACCEPTANCE === 'true' && (
            <SandboxAcceptance user={user} plaidItems={plaidItems} />
          )}
        </div>
      )}
    </AppShell>
  );
}
