import { normalizeItemHealth } from './financial';

export function buildConnectedAccounts(plaidItems: any[]): any[] {
  const result: any[] = [];
  
  for (const item of plaidItems) {
    if (!item.accounts || !Array.isArray(item.accounts)) continue;
    
    const health = normalizeItemHealth(item);
    
    for (const account of item.accounts) {
      result.push({
        accountId: account.id || account.account_id,
        institutionName: item.institution_name,
        accountName: account.name,
        accountMask: account.mask,
        accountType: account.type,
        accountSubtype: account.subtype,
        health
      });
    }
  }
  
  return result;
}
