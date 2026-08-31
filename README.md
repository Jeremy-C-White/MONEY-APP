# FinSync

FinSync is a server-orchestrated, offline-first personal finance application that securely synchronizes your bank transactions to a private Google Sheet using Plaid.

## Architecture

* **Frontend**: React + Vite + Tailwind CSS.
* **Backend**: Express + Node.js (Full-stack architecture).
* **Database**: Firebase Firestore (for storing secure metadata and Plaid cursors).
* **Sync Destination**: Google Sheets (Machine-owned `Transactions_Raw` worksheet).

## Security & Plaid Integration Features

* **Strict 10-Item Quota Protection**: Prevents duplicate account connections by checking existing institution account masks server-side *before* exchanging the public token.
* **Server-side Duplicate Ledger**: Maintains a strict `plaid_sessions` ledger for all Plaid Link instances and diagnostic exits.
* **Idempotent Syncs**: The backend orchestrates the `Transactions_Raw` worksheet sync entirely server-side, decoupling the browser from raw transaction payloads.
* **Durable Cursors**: Plaid synchronization cursors are defensively committed *only* after Google Sheets write operations successfully conclude.
* **Webhook Support**: Automatic handling for `SYNC_UPDATES_AVAILABLE`, `PENDING_DISCONNECT`, and `ITEM_LOGIN_REQUIRED`.

## Environment Setup

You must configure the following environment variables in `.env` before running:

```
# Firebase credentials (used via application default credentials in the container)
# Plaid API
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret
PLAID_ENV=sandbox

# Google OAuth2 (for Google Sheets offline access)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
APP_URL=http://localhost:3000
```

### Google OAuth Configuration

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Create an OAuth 2.0 Client ID for a Web Application.
3. Add `http://localhost:3000/api/auth/google/callback` to the **Authorized redirect URIs**. (Or your production URL).

### Plaid Webhooks

To receive live transaction updates, configure your Plaid Dashboard to send webhooks to `https://your-domain.com/api/plaid/webhook`.

## Getting Started

1. Install dependencies: `npm install`
2. Build for production: `npm run build`
3. Start the server: `npm start`
4. Visit `http://localhost:3000`
