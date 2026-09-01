const fs = require('fs');

const oldApp = fs.readFileSync('src/App.tsx.backup', 'utf8');

let newApp = oldApp.replace(
  "import { DeveloperVerification } from './components/DeveloperVerification';",
  "import { DeveloperVerification } from './components/DeveloperVerification';\nimport { AppShell } from './components/AppShell';\nimport { OverviewPage } from './pages/OverviewPage';"
);

newApp = newApp.replace(
  "const [message, setMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);",
  "const [message, setMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);\n  const [activeTab, setActiveTab] = useState('overview');"
);

// We need to find `  if (authLoading) {` and everything after it.
const returnSplit = newApp.indexOf("  if (authLoading) {");

if (returnSplit > -1) {
  const topPart = newApp.substring(0, returnSplit);
  const bottomPart = newApp.substring(returnSplit);

  // We are going to replace the default return statement with our new one
  const defaultReturnIndex = bottomPart.indexOf("  return (");
  const bottomReturnPart = bottomPart.substring(defaultReturnIndex);

  // Instead of completely dropping the old UI, we'll extract it and put it inside activeTab === 'settings'
  // But wait, it's easier to just do a string replacement on the main wrapping div.

  // The old return is:
  /*
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans overflow-x-hidden">
      <header ...>
        ...
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-12">
  */

  // Let's just create the new bottom part manually, but embedding the old JSX if activeTab === 'settings'.
  
  const endOfMainIndex = bottomReturnPart.lastIndexOf("</main>");
  
  if (endOfMainIndex > -1) {
    const mainContentStartIndex = bottomReturnPart.indexOf("<main");
    const mainContentStartClose = bottomReturnPart.indexOf(">", mainContentStartIndex) + 1;
    
    const settingsContent = bottomReturnPart.substring(mainContentStartClose, endOfMainIndex);
    
    const headerStartIndex = bottomReturnPart.indexOf("<header");
    const headerEndIndex = bottomReturnPart.indexOf("</header>") + 9;
    const oldHeader = bottomReturnPart.substring(headerStartIndex, headerEndIndex);

    const authCheckUI = `
    if (!user) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans overflow-x-hidden">
          ${oldHeader}
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
            ${settingsContent}
          </div>
        )}
      </AppShell>
    );
`;
    
    // Remember that X needs to be imported if we use it. We can import X in App.tsx.
    
    let finalCode = topPart + "\n" + bottomPart.substring(0, defaultReturnIndex) + authCheckUI + "\n}\n";
    finalCode = finalCode.replace(
      "import { LogIn, LogOut, RefreshCcw, Landmark, FileSpreadsheet, Loader2, Link2Off, CheckCircle2, AlertTriangle } from 'lucide-react';",
      "import { LogIn, LogOut, RefreshCcw, Landmark, FileSpreadsheet, Loader2, Link2Off, CheckCircle2, AlertTriangle, X } from 'lucide-react';"
    );
    
    fs.writeFileSync('src/App.tsx', finalCode);
    console.log("Patched App.tsx");
  } else {
    console.log("Could not find end of main");
  }
} else {
  console.log("Could not find returnSplit");
}
