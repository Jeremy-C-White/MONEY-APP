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

### 3. Production Unresolved Guard
If an exchange call encounters a network timeout, process crash, or ambiguous non-4xx failure, the session outcome is preserved as `exchange_in_progress` (unresolved).
* **Server-Side Gate**: Both `/api/plaid/create_link_token` and `/api/plaid/exchange_public_token` reject new Production connections with `HTTP 409 UNRESOLVED_PRODUCTION_EXCHANGE` whenever an unresolved attempt exists.
* **Client Locking**: The frontend locks the "Connect New Bank" button and renders a persistent warning banner requiring manual review/reconciliation.

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
* Creates deterministic ledger records (`legacy_<itemId>`) preventing double-counting if an existing `exchanged` session is already present.

### 7. Webhook & Orphan Item Handling
* **Signature & Hash Verification**: Webhooks verify Plaid JWTs using ES256 keys from `webhookVerificationKeyGet` and SHA-256 body hash checks against `iat` expiry.
* **Orphan Detection**: Webhooks for unknown `item_id`s record evidence in `orphan_items`. If exactly one unresolved session exists in that environment, it is marked as `single_candidate`; if multiple exist, it is marked as `needs_review`.
* **Token Recovery Boundary**: Discovering an orphaned item from a webhook proves the item exists on Plaid, but does not recover the missing access token.

### 8. Known Limitations & Best Practices
* **Trial Quota Irreversibility**: Deleting an item in Plaid Sandbox/Production via `/item/remove` revokes token access, but Plaid's billing ledger retains the item count against your Trial limit.
* **Google Sheets Vault Security**: Transaction sync runs exclusively server-side via distributed lease locks (`users/{uid}/locks/sync`), ensuring atomic batches and protecting raw sheets tokens.

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

