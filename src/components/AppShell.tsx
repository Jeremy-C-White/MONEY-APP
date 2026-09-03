import React from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  Wallet,
  Settings,
  RefreshCcw,
  Loader2,
  Landmark,
} from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  syncing: boolean;
  onSync: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ReceiptText },
  { id: 'accounts', label: 'Accounts', icon: Wallet },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AppShell({
  children,
  syncing,
  onSync,
  activeTab,
  setActiveTab,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 fixed h-full z-20">
        <div className="p-6">
          <div className="text-xl font-bold text-slate-900 tracking-tight flex items-center">
            <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <Landmark aria-hidden="true" className="h-4 w-4 text-white" />
            </div>
            FinSync
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                activeTab === item.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen w-full relative">
        <header className="md:hidden bg-white border-b border-slate-200 sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
          <div className="px-4 h-16 flex items-center justify-between">
            <div className="text-lg font-bold text-slate-900 flex items-center">
              <div className="mr-2 flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600">
                <Landmark aria-hidden="true" className="h-3.5 w-3.5 text-white" />
              </div>
              FinSync
            </div>

            <button
              onClick={onSync}
              disabled={syncing}
              aria-label="Sync latest transactions"
              className="w-11 h-11 -mr-2 flex items-center justify-center text-slate-600 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? (
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              ) : (
                <RefreshCcw className="w-5 h-5" />
              )}
            </button>
          </div>
        </header>

        <header className="hidden md:flex bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-10 h-16 items-center justify-between px-8">
          <h1 className="text-lg font-semibold text-slate-900 capitalize">
            {activeTab === 'overview' ? 'Overview' : activeTab}
          </h1>

          <button
            onClick={onSync}
            disabled={syncing}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            ) : (
              <RefreshCcw className="w-4 h-4" />
            )}
            <span>{syncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
        </header>

        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full pb-24 md:pb-8">
          {children}
        </div>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30 pb-[env(safe-area-inset-bottom)]">
          <div className="flex justify-around items-center h-16 px-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                  activeTab === item.id
                    ? 'text-indigo-600'
                    : 'text-slate-500'
                }`}
              >
                <item.icon
                  className={`w-5 h-5 ${
                    activeTab === item.id ? 'stroke-[2.5px]' : ''
                  }`}
                />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </main>
    </div>
  );
}
