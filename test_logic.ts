import { aggregateSummary, aggregateCategories, aggregateMerchants, aggregateTrends, filterTransactions, buildVerificationReport } from "./server/lib/aggregations";
const txs = [];
try { aggregateSummary(txs, "America/New_York"); console.log("summary OK"); } catch(e) { console.error("summary FAIL:", e.message); }
try { aggregateCategories(txs); console.log("categories OK"); } catch(e) { console.error("categories FAIL:", e.message); }
try { aggregateMerchants(txs); console.log("merchants OK"); } catch(e) { console.error("merchants FAIL:", e.message); }
try { aggregateTrends(txs, "12m", "America/New_York"); console.log("trends OK"); } catch(e) { console.error("trends FAIL:", e.message); }
try { buildVerificationReport(txs, "America/New_York"); console.log("verification OK"); } catch(e) { console.error("verification FAIL:", e.message); }
try { filterTransactions(txs, {status: 'posted', limit: '6'}); console.log("tx1 OK"); } catch(e) { console.error("tx1 FAIL:", e.message); }
try { filterTransactions(txs, {status: 'pending', limit: '4'}); console.log("tx2 OK"); } catch(e) { console.error("tx2 FAIL:", e.message); }
