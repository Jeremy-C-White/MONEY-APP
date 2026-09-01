import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(
  'const plaidItemsSnap = await db.collection("users").doc(uid).collection("plaid_items").get();',
  'const plaidItemsSnap = await db.collection("plaid_items").where("userId", "==", uid).get();'
);
fs.writeFileSync('server.ts', content);
