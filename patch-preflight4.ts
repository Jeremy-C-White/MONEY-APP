import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

const regex = /app\.get\('\/api\/dev\/preflight'[\s\S]*?if \(process\.env\.NODE_ENV !== "production"\) {/;
content = content.replace(regex, 'if (process.env.NODE_ENV !== "production") {');
fs.writeFileSync('server.ts', content);
