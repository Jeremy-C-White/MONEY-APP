const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<DeveloperVerification user={user} \/>[\s\S]+?<\/AppShell>[\s\S]+?}/;

const replacement = `<DeveloperVerification user={user} />
            {(import.meta as any).env.VITE_ENABLE_SANDBOX_ACCEPTANCE === 'true' && (
              <SandboxAcceptance user={user} plaidItems={plaidItems} />
            )}
          </div>
        )}
      </AppShell>
    );
}`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', content);
