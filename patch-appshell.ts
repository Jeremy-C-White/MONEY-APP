import fs from 'fs';
let content = fs.readFileSync('src/components/AppShell.tsx', 'utf8');

content = content.replace(
  "const NAV_ITEMS = [",
  "const NAV_ITEMS: { id: string; label: string; icon: any; disabled?: boolean }[] = ["
);

fs.writeFileSync('src/components/AppShell.tsx', content);
