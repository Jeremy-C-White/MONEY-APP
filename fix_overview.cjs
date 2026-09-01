const fs = require('fs');
let content = fs.readFileSync('src/pages/OverviewPage.tsx', 'utf8');
content = content.replace(
  "function TransactionRow({ tx }: { tx: Transaction }) {",
  "function TransactionRow({ tx, key }: { tx: Transaction, key?: React.Key }) {"
);
fs.writeFileSync('src/pages/OverviewPage.tsx', content);
