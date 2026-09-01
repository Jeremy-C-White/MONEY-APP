# FinSync

FinSync is a server-orchestrated, offline-first personal finance application that securely synchronizes your bank transactions to a private Google Sheet using Plaid.

## Runtime & Baseline Requirements

* **Node.js**: Node 22 (`>= 22.0.0`)
* **Package Manager**: `npm` is the canonical package manager (uses `package-lock.json`).
* **CI**: GitHub Actions CI workflow enforces `npm ci`, `npm run lint`, and `npm run build` on Node 22.
* **Testing Protocol**: Always perform sandbox-first testing using Plaid Sandbox credentials before connecting production accounts.

## Architecture

* **Frontend**: React + Vite + Tailwind CSS.
* **Backend**: Express + Node.js (Full-stack architecture).
* **Database**: Firebase Firestore (for storing secure metadata, session ledgers, item indexes, and sync cursors).
* **Sync Destination**: Google Sheets (Machine-owned `Transactions_Raw` worksheet).

## Plaid Integration & Production Trial Safety Model

FinSync is engineered specifically around Plaid's Production Trial plan constraints (strictly 10 Lifetime Items) and zero-token-leakage principles.

### 1. Trial Quota Accounting
* **10-Item Hard Ceiling**: The Plaid Production Trial tier grants 10 lifetime Production Item creations across your developer team.
* **Conservative Accounting**: UI and backend ledger count both confirmed items (`quota_state: 'exchanged'`) and ambiguous unresolved attempts (`quota_state: 'exchange_in_progress'`) against the 10-Item quota.
* **Disconnect Behavior**: Disconnecting or removing a bank item removes local access tokens and flags the item as disconnected, but **does not restore Plaid's consumed Trial Item slot**. Disconnected items remain tracked in historical ledgers.

### 2. Session Lifecycle & State Machine
Every Plaid Link initialization writes an immutable session record to the `plaid_sessions` collection:
* `link_started`: Link token created for a new connection.
* `exchange_in_progress`: Pre-exchange reservation locked before invoking Plaid API; serves as an idempotency barrier.
* `exchanged`: Public token successfully exchanged, access token persisted in `plaid_items`, and `plaid_item_index` indexed.
* `exchange_failed`: Definitive 4xx client rejection from Plaid (safe to retry, no item created).
* `duplicate_aborted`: Server aborts connection prior to exchange due to exact match with existing account.
* `repair_started`: Link token created with an existing `access_token` in update mode (never creates a new Plaid Item).

### 3. Production Unresolved Guard & Shared Reservation Lock
If an exchange call encounters a network timeout, process crash, or ambiguous non-4xx failure, the session outcome is preserved as `exchange_in_progress` (unresolved).
* **Shared Per-User Production Lock**: An atomic mutex at `users/{uid}/locks/plaid_new_item` is acquired concurrently with session state transition (`link_started` -> `exchange_in_progress`). All concurrent Production exchange attempts for the user contend on this document.
* **Server-Side Gate**: Both `/api/plaid/create_link_token` and `/api/plaid/exchange_public_token` reject new Production connections with `HTTP 409 UNRESOLVED_PRODUCTION_EXCHANGE` whenever an unresolved attempt or active shared lock exists.
* **Client Locking**: The frontend locks the "Connect New Bank" button and renders a persistent warning banner requiring manual review/reconciliation.
* **Lock Lifecycle**:
  - Released on confirmed durable persistence (`quota_state: 'exchanged'`).
  - Released on definitive Plaid 4xx rejection (`quota_state: 'exchange_failed'`).
  - Kept on network timeouts, 5xx errors, ambiguous failures, or persistence failures.

### 4. Duplicate Connection Policy
Server-side duplicate detection runs across all active items for the user at the institution:
* **Definite Duplicate (Exact Match)**: If an account name and mask exactly match an existing active account, the backend transitions the session to `duplicate_aborted` and rejects the exchange with `HTTP 409 DUPLICATE_ABORTED`. No Plaid Item is created.
* **Probable Duplicate (Mask Match, Different Name)**: If an account mask matches but the account name differs, user confirmation is required (`DUPLICATE_CONFIRMATION_REQUIRED`). Once confirmed via `/api/plaid/confirm_duplicate`, exchange proceeds only if the account fingerprint has not mutated.
* **Ambiguous Metadata (Missing Masks/Empty Accounts)**: Requires explicit confirmation before consuming an item slot.

### 5. Repair Mode (Zero Quota Consumption)
When an existing bank item enters `ITEM_LOGIN_REQUIRED` or an unhealthy status:
* Repair mode initializes Link with the existing item's `access_token`.
* Plaid executes an update flow, modifying credentials on the existing Item without calling `itemPublicTokenExchange` or creating an additional Item.
* No Trial quota slots are consumed during repair.

### 6. Legacy Item Reconciliation
Items created prior to session ledger tracking can be reconciled idempotently via `/api/plaid/reconcile_legacy_item`:
* Allows designating legacy items as `confirmed_production` or `confirmed_sandbox`.
* Fully transactional read-before-write validation prevents duplicate quota allocations.
* Creates deterministic ledger records (`legacy_<itemId>`) preventing double-counting if an existing `exchanged` session is already present.

### 7. Webhook & Orphan Item Handling
* **Signature & Hash Verification**: Webhooks verify Plaid JWTs using ES256 keys from `webhookVerificationKeyGet` and SHA-256 body hash checks against `iat` expiry.
* **Orphan Evidence Classification**: Webhooks for unknown `item_id`s record evidence in `orphan_items`:
  - `single_candidate`: Exactly one plausible unresolved session was found. **Note**: This proves the Plaid Item exists, but does *not* conclusively prove local session ownership and does *not* automatically transition the session to `exchanged`.
  - `needs_review`: Multiple plausible unresolved sessions match the item environment.
  - `unmatched`: No candidate unresolved sessions matched.
* **Token Recovery Boundary**: Discovering an orphaned item from a webhook proves the item exists on Plaid, but does not recover the missing access token.

### 8. Resolving an Uncertain Production Exchange

This operational procedure applies when `quota_state = exchange_in_progress` and the UI shows an unresolved attempt locking new connections.

* **Step 1: Do NOT reconnect the bank immediately**
  FinSync intentionally blocks new Production Item creation to protect the irreversible 10-Item Trial limit.

* **Step 2: Inspect the Plaid Dashboard and Ledgers**
  - Open the Plaid Dashboard and inspect Production Items created around `exchange_started_at`.
  - Use available institution ID, timestamps, and account metadata to determine if Plaid created an Item for that attempt.
  - Inspect any `orphan_items` evidence captured from verified webhooks.

* **Step 3A: If the Plaid Item exists**
  - Call `POST /api/plaid/reconcile_session` with `outcome: "confirmed_exchanged"` and the `session_id`.
  - This marks the session as `exchanged` and releases the shared Production lock.
  - *Note on Lost Tokens*: If FinSync lost the access token during persistence, reconciling as `confirmed_exchanged` accurately accounts for the consumed Trial slot in your quota ledger, but does **not** recover access to the bank item. Contact Plaid Support if token recovery or Item removal is required.

* **Step 3B: If Plaid confirms no Item was created**
  - Call `POST /api/plaid/reconcile_session` with `outcome: "confirmed_failed"` and the `session_id`.
  - This transitions the session to `exchange_failed` and releases the shared Production lock.

* **Step 4: Verification**
  - The shared Production lock at `users/{uid}/locks/plaid_new_item` is deleted.
  - `trialItemsUnresolved` returns to 0.
  - "Connect New Bank" is re-enabled on the dashboard.
  - Remember: calling `/item/remove` revokes bank tokens but does **not** restore consumed Plaid Trial slots.

### 9. Known Limitations & Best Practices
* **Trial Quota Irreversibility**: Deleting an item in Plaid Sandbox/Production via `/item/remove` revokes token access, but Plaid's billing ledger retains the item count against your Trial limit.
* **Google Sheets Vault Security**: Transaction sync runs exclusively server-side via distributed lease locks (`users/{uid}/locks/sync`), ensuring atomic batches and protecting raw sheets tokens.

## Account Inventories & Diagnostics

FinSync maintains two distinct sources of truth for account data to guarantee accuracy between active bank connections and historical financial ledgers. These are accessible via separate endpoints:

* **Connected Account Inventory (`GET /api/connected-accounts`)**: The source of truth for accounts persisted on linked Plaid items, including disconnected health states. It reads stored `plaid_items` metadata without calling Plaid. Used to manage connected-account records.
* **Ledger Account Inventory (`GET /api/accounts`)**: The source of truth for accounts present in your historical transaction ledger. It reads the normalized transaction history and extracts all distinct account IDs that have ever recorded a transaction. Used primarily for transaction filtering.

**Why the separation?** The *connected* inventory preserves disconnected items and exposes their health state, while the *ledger* inventory preserves accounts represented in historical transactions so those transactions remain viewable and filterable.

### Accounts Preflight Diagnostic
To safely evaluate the reconciliation between these two data sources without calling Plaid, triggering syncs, or performing persistent writes, a read-only endpoint is available in development. When the ledger cache is empty, it reads normalized transaction rows from Google Sheets:
* `GET /api/dev/accounts-preflight`
* **Gated**: Requires `ENABLE_SANDBOX_ACCEPTANCE="true"`.
* **Output**: Returns precise numerical counts of items, active vs disconnected states, missing metadata, unique account IDs in both sources, and any discrepancies (ledger-only vs connected-only IDs) to assist in debugging data integrity.

## Environment Setup

You must configure the following environment variables in `.env` before running:

```env
# Plaid API
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret
PLAID_ENV=sandbox

# Google OAuth2 (for Google Sheets offline access)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Application URL (Required in Production; defaults to http://localhost:3000 in development)
APP_URL=http://localhost:3000
```

> **Important**: `APP_URL` is mandatory in Production environments (`NODE_ENV=production` or `PLAID_ENV=production`) to guarantee correct OAuth redirect callbacks, CORS origins, and Plaid webhook routing. Production startup will fail if `APP_URL` is missing.

### Google OAuth Configuration

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Create an OAuth 2.0 Client ID for a Web Application.
3. Add `${APP_URL}/api/auth/google/callback` to the **Authorized redirect URIs** (e.g. `http://localhost:3000/api/auth/google/callback` for local development).

### Plaid Webhooks

To receive live transaction updates, configure your Plaid Dashboard to send webhooks to `${APP_URL}/api/plaid/webhook`.

## Getting Started

1. Install dependencies: `npm ci`
2. Run linter: `npm run lint`
3. Build for production: `npm run build`
4. Start the server: `npm start`
5. Visit `http://localhost:3000`

