const fs = require('fs');

// We use the backup as the single source of truth for the logic
let oldApp = fs.readFileSync('src/App.tsx.backup', 'utf8');

// Inject imports
oldApp = oldApp.replace(
  "import { DeveloperVerification } from './components/DeveloperVerification';",
  "import { DeveloperVerification } from './components/DeveloperVerification';\nimport { AppShell } from './components/AppShell';\nimport { OverviewPage } from './pages/OverviewPage';"
);

oldApp = oldApp.replace(
  "const [message, setMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);",
  "const [message, setMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);\n  const [activeTab, setActiveTab] = useState('overview');"
);

oldApp = oldApp.replace(
  "import { LogIn, LogOut, RefreshCcw, Landmark, FileSpreadsheet, Loader2, Link2Off, CheckCircle2, AlertTriangle } from 'lucide-react';",
  "import { LogIn, LogOut, RefreshCcw, Landmark, FileSpreadsheet, Loader2, Link2Off, CheckCircle2, AlertTriangle, X } from 'lucide-react';"
);


const lines = oldApp.split('\n');
const returnIdx = lines.findIndex((l, i) => i > 350 && l.includes("  return ("));

// The settings UI starts around line 434 (in backup): `        {user ? (`
// actually, let's just grab the whole settings UI we need from lines.

const newReturn = `
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans overflow-x-hidden">
        <header className="bg-white border-b border-slate-200 px-10 py-6 flex items-center justify-between sticky top-0 z-10">
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
      setActiveTab={setActiveTab}
    >
      {message && (
        <div className={\`mb-6 p-4 rounded-xl flex items-center justify-between shadow-sm \${
          message.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }\`}>
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'overview' && (
        <OverviewPage apiFetch={apiFetch} />
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

          {/* Data Sync Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileSpreadsheet className={\`h-5 w-5 \${googleConnected ? 'text-emerald-600' : 'text-slate-400'}\`} />
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
                  className="w-full md:w-auto bg-slate-100 hover:bg-slate-200 text-slate-900 px-4 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                >
                  Authorize Google Sheets Offline Access
                </button>
              ) : (
                <div className="flex gap-3">
                   <button
                      onClick={triggerServerSync}
                      disabled={syncing || plaidItems.length === 0}
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
                      {item.has_updates ? (
                        <button
                           onClick={() => generateLinkToken(item.internal_id)}
                           className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100 font-medium transition-colors"
                        >
                           <RefreshCcw className="h-3.5 w-3.5" />
                           Repair
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
`;

const topPart = lines.slice(0, returnIdx).join('\n');
fs.writeFileSync('src/App.tsx', topPart + '\n' + newReturn);
