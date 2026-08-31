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
* **Database**: Firebase Firestore (for storing secure metadata and Plaid cursors).
* **Sync Destination**: Google Sheets (Machine-owned `Transactions_Raw` worksheet).

## Security & Plaid Integration Features

* **Strict 10-Item Quota Protection**: Prevents duplicate account connections by checking existing institution account masks server-side *before* exchanging the public token.
* **Server-side Duplicate Ledger**: Maintains a strict `plaid_sessions` ledger for all Plaid Link instances and diagnostic exits.
* **Idempotent Syncs**: The backend orchestrates the `Transactions_Raw` worksheet sync entirely server-side, decoupling the browser from raw transaction payloads. Concurrency is managed via distributed lease locks.
* **Durable Cursors**: Plaid synchronization cursors are defensively committed *only* after Google Sheets write operations successfully conclude.
* **Webhook Support**: Automatic handling for `SYNC_UPDATES_AVAILABLE`, `PENDING_DISCONNECT`, and `ITEM_LOGIN_REQUIRED`.

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
