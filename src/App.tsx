import React, { useEffect, useState, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { auth, signInWithGoogle, logOut } from './firebase';
import { LogIn, LogOut, RefreshCcw, Landmark, FileSpreadsheet, Loader2, Link2Off, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const repairingItemIdRef = useRef<string | null>(null);
  
  const [plaidItems, setPlaidItems] = useState<any[]>([]);
  const [trialItemsConfirmed, setTrialItemsConfirmed] = useState(0);
  const [trialItemsUnresolved, setTrialItemsUnresolved] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [message, setMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);
  
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
      }
    });
    return () => unsubscribe();
  }, []);

  const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    if (!auth.currentUser) throw new Error("No user");
    const token = await auth.currentUser.getIdToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
    return fetch(endpoint, { ...options, headers });
  };

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
    try {
      const res = await apiFetch(`/api/status`);
      const data = await res.json();
      if (res.status === 500 && data.error === "Server Configuration Error") {
        setServerConfigError(data.details || "Required environment variables are missing on the backend.");
        return;
      }
      setServerConfigError(null);
      if (data.items) setPlaidItems(data.items);
      setTrialItemsConfirmed(data.trialItemsConfirmed || 0);
      setTrialItemsUnresolved(data.trialItemsUnresolved || 0);
      setGoogleConnected(!!data.googleConnected);
    } catch (error) {
      console.error(error);
    }
  };

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

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans overflow-x-hidden">
      <header className="bg-white border-b border-slate-200 px-10 py-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <Landmark className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">FinSync</h1>
        </div>
        {user ? (
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
               <span className="relative flex h-3 w-3">
                 <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${googleConnected ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`}></span>
                 <span className={`relative inline-flex rounded-full h-3 w-3 ${googleConnected ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
               </span>
               <span className="text-sm font-medium text-slate-500">{googleConnected ? 'Sheets: Ready' : 'Sheets: Disconnected'}</span>
            </div>
            <div className="flex items-center gap-4 border-l border-slate-200 pl-6">
              <span className="text-sm font-medium text-slate-600">{user.email}</span>
              <button
                onClick={logOut}
                className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-100"
          >
            <LogIn className="h-4 w-4" />
            Sign in
          </button>
        )}
      </header>

      <main className="max-w-5xl w-full mx-auto px-10 py-10 flex-1 relative">
        {serverConfigError && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-900 px-4 py-4 rounded-xl flex flex-col gap-2">
             <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Server Configuration Error
             </div>
             <p className="text-sm opacity-90">{serverConfigError}</p>
          </div>
        )}
        {message && (
          <div className={`absolute top-0 left-10 right-10 z-50 p-4 rounded-xl flex items-center gap-3 shadow-md ${
             message.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
             message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
             'bg-indigo-50 text-indigo-800 border border-indigo-200'
          }`}>
             {message.type === 'error' ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
             <span className="font-medium text-sm">{message.text}</span>
          </div>
        )}

        {!user ? (
          <div className="text-center py-20 mt-10">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-4">Master Your Money</h2>
            <p className="text-lg text-slate-500 mb-8 max-w-lg mx-auto">
              Securely connect your bank accounts and automatically sync transactions to an offline Google Sheet vault.
            </p>
            <button
              onClick={handleSignIn}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-base transition-colors shadow-lg shadow-indigo-100"
            >
              <LogIn className="h-5 w-5" />
              Get Started
            </button>
          </div>
        ) : (
          <div className="space-y-8 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
              {/* Plaid Connection Card */}
              <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl col-span-1 md:col-span-5 flex flex-col justify-between">
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
                      <span className="text-xs font-mono font-bold">{trialItemsConfirmed + trialItemsUnresolved} / 10</span>
                    </div>
                    {trialItemsUnresolved > 0 ? (
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
                  disabled={loading || trialItemsUnresolved > 0}
                  title={trialItemsUnresolved > 0 ? "Blocked while an unresolved Production exchange exists" : undefined}
                  className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed mt-6"
                >
                  {loading && !linkToken && !repairingItemIdRef.current ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Connect New Bank
                </button>
              </div>

              {/* Data Sync Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between col-span-1 md:col-span-7">
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
                  {!googleConnected ? (
                    <button
                      onClick={connectGoogleSheets}
                      disabled={loading}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-900 px-4 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                    >
                      Authorize Google Sheets Offline Access
                    </button>
                  ) : (
                    <div className="flex gap-3">
                       <button
                          onClick={triggerServerSync}
                          disabled={syncing || plaidItems.length === 0}
                          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 shadow-lg shadow-indigo-100"
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
            </div>

            {/* Connected Institutions Preview */}
            {plaidItems.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden mt-8">
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
                        {['login_required', 'pending_disconnect', 'permission_revoked'].includes(item.health) && (
                          <button 
                            onClick={() => generateLinkToken(item.internal_id)}
                            className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-200 transition-colors flex items-center gap-1"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Repair Connection
                          </button>
                        )}
                        {item.health === 'healthy' && (
                          <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider">
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
          </div>
        )}
      </main>
    </div>
  );
}
