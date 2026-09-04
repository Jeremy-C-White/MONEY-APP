# FinSync — Working Notes

Personal finance app. Plaid → Google Sheets → dashboard. Single user (the owner).

Read this before changing anything. The constraints below are not stylistic preferences; each one exists because breaking it cost real time or real money.

---

## The one constraint that matters most

**Plaid Production Items are capped at 10, permanently.**

An Item is one bank connection. The quota is consumed when `/item/public_token/exchange` returns an access token. Calling `/item/remove` does **not** give the slot back on a Trial plan. There is no way to recover a lost access token — Plaid support is the only recourse.

This app is currently running against real bank data in Production. Some slots are already spent.

Consequences:
- Never call `itemPublicTokenExchange` outside the existing guarded flow.
- Never "reset" or recreate a connection to fix something.
- Never write a test or script that links a new Production Item.
- If you think a change requires a new Item, stop and ask.

The pre-exchange session reservation, the per-user Production lock, and the quota ledger in `plaid_sessions` all exist to protect this. Do not simplify them.

---

## Do not modify without explicit approval

These files hold verified financial logic with a reconciled baseline. Changing them invalidates months of validation.

- `server/lib/financial.ts` — transaction classification
- `server/lib/aggregations.ts` — spending/income aggregation, reconciliation
- `server/lib/sandbox-acceptance.ts` — acceptance harness
- `server/lib/connected-accounts.ts` — account inventory transform
- The Plaid exchange, repair, remove, webhook, and sync handlers in `server.ts`
- The Google Sheets writer (`Transactions_Raw` schema and write path)

If a task seems to require touching these, say so and wait rather than proceeding.

---

## Architecture

```
Plaid → server.ts sync → Google Sheet (Transactions_Raw) → server aggregation → React
```

The Google Sheet is the ledger and the source of truth for transactions. Firestore holds connection state (`plaid_items`), quota ledger (`plaid_sessions`), and user config (`users`).

**All financial math happens on the server.** React formats; it never computes. No `reduce`, no percentage math, no summation in components. Format with `Intl.NumberFormat` via `src/lib/formatters.ts`.

### Two account endpoints — they mean different things

- `GET /api/accounts` — accounts appearing in transaction history. Used by the Transactions filter. Currently returns 7.
- `GET /api/connected-accounts` — accounts stored on Plaid Item documents. Used by the Accounts page. Currently returns 18.

They disagree on purpose. 11 connected accounts have no transaction history. Do not merge them, do not "fix" the discrepancy.

### Layout

```
server.ts                  Express app, all routes
server/lib/*.ts            Pure helpers, each with a .test.ts
src/App.tsx                Auth + Plaid/Google connection handlers, tab routing
src/pages/                 OverviewPage, TransactionsPage, AccountsPage
src/components/            AppShell, MetricCard, TrendChart, dev tools
src/lib/api-contracts.ts   Response unwrapping — use these, see below
src/lib/formatters.ts      Currency, percent, category/classification labels
```

---

## Rules learned the hard way

**`Response.json()` is `any`.** TypeScript will not catch a wrong response shape. Three endpoints returning `{ categories: [...] }`, `{ merchants: [...] }`, `{ monthly: [...] }` were assigned straight into array state; it compiled, passed lint, and broke at runtime. Always unwrap through `src/lib/api-contracts.ts` and add an extractor + test for any new endpoint.

**One concept, one implementation.** Three separate bugs came from the same shape of mistake: two readers disagreeing about the same data. A pending column written as `Yes`/`No` and read as `TRUE`/`FALSE`. A field renamed `status` → `health` in one place but not another. Two duplicate-detection algorithms. When you need a predicate or a parser in two places, export one and import it.

**Pure helpers, not handler logic.** Every server bug in this project lived in untestable code inside an Express handler. New logic goes in `server/lib/` as a pure function with a test.

**Never fabricate a value the server didn't send.** No inferred balances. No `|| 0` on a null the server meant as "unknown." No `Math.abs()` on a signed amount for display. If the server returns null, render nothing or an explicit unknown state.

**Amounts keep Plaid's precision.** `Transactions_Raw` stores exactly what Plaid returned, including sub-cent values. Round at display only.

**Classification names describe evidence, not inferred purpose.** Plaid category codes describe a transaction channel or merchant type; they do not establish the economic meaning of the money. Use a neutral review label until stronger evidence or an owner override establishes that meaning.

**Cursor commits last.** The Plaid transactions cursor is persisted only after the full pagination completes *and* the Sheets write succeeds. This makes a failed sync replay rather than silently skip. Do not move it earlier.

**Verify before reporting.** Don't say a test passed, a value matched, or a page rendered unless you ran it. Reported-but-unobserved results have been a recurring problem here.

---

## Commands

```bash
npm run lint      # tsc --noEmit
npm run build     # vite build + esbuild server bundle
npx vitest run    # 154 tests, 9 files
npm run dev       # local server
```

All four must pass before committing. There is no `test` script in package.json — use `npx vitest run` directly.

**Do not weaken or delete a test to make the suite green.** If a test fails after a refactor, the refactor is wrong until proven otherwise.

---

## Commit discipline

One focused commit per change, with a descriptive message. Not "update."

Never commit: patch scripts, `.backup` files, temp files, or anything used to generate code. This has happened twice — six scratch files in one commit, a 650-line server-rewriting script in another. `.gitignore` should cover `*.backup`, `temp_*`, `patch_*.cjs`, `fix_*.cjs`.

Never commit secrets. Plaid keys, Google OAuth secrets, and Cloud Tasks config live in Firebase App Hosting environment settings, not the repo. `.env.example` holds placeholder names only.

---

## Current state

All four tabs live: Overview, Transactions, Accounts, Settings. Running against real Production bank data. Automatic sync via Cloud Tasks is configured and enabled (`autoSyncConfigured: true`).

### Known open items

- **Dataset gaps in the acceptance harness.** `explicitRefund`, `cashWithdrawal`, and `incomingP2P` read NOT EXERCISED — the data never contained those shapes. Not code defects.
- **Cached account balances.** Successful transaction syncs now call the free `/accounts/get` endpoint after the ledger cursor is safely committed. Current balance state and one dated snapshot per day are stored in Firestore; balances are never inferred from transactions. `/accounts/balance/get` is not called, so the display is explicitly sync-fresh rather than real-time.
- **Developer Tools in Production.** `DeveloperVerification` and `SandboxAcceptance` still render in Settings behind an env flag. Sandbox-only actions should be hidden or inert in Production — worth confirming.
- **Access tokens unencrypted at the application layer.** Firestore encrypts at rest, but there is no field-level encryption. Considered acceptable for a single-user app; revisit if that changes.

### Reasonable next work

Budgets by category, recurring/subscription detection, month-over-month comparison, transaction detail view. All buildable on existing endpoints with no new financial logic.

Balance history begins with the first successful sync after the balance pass. Do not backfill it from transaction history. The Overview calls the total a connected-account position rather than net worth because unconnected assets and debts are outside its scope.

---

## When to stop and ask

- Anything that could create, remove, or re-link a Plaid Item
- Anything touching the files listed under "Do not modify"
- Anything that changes the `Transactions_Raw` schema
- Anything where the fix is "reset it and try again"

The cost of asking is a minute. The cost of a wrong guess here is a permanent bank connection slot.
