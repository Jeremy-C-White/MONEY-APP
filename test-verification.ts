import { deduplicateAndNormalizeTransactions } from './server/lib/financial.js';
import { buildVerificationReport } from './server/lib/aggregations.js';
import { readFileSync } from 'fs';

// If I mock the DB connection, I can just fetch the user's txs.
// But wait, the app is already running or I can just import firebase-admin?
