import fs from 'fs';
let content = fs.readFileSync('README.md', 'utf8');

const newSection = `
## API Endpoints

### Accounts & Connections
* **\`GET /api/connected-accounts\`**
  Returns a top-level array of all connected financial accounts and their normalized health status. This endpoint reads directly from the \`plaid_items\` collection and does not infer account existence from transaction history.
* **\`GET /api/accounts\`**
  Returns an array of ledger accounts present in the normalized transaction history. Used primarily for filtering the transactions view.

### Transactions
* **\`GET /api/transactions\`**
  Returns the normalized transaction ledger fetched from Google Sheets.
`;

// Insert it before Environment Setup
content = content.replace('## Environment Setup', newSection + '\n## Environment Setup');
fs.writeFileSync('README.md', content);
