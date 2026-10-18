/**
 * Machine-readable public API contract (issue #55).
 *
 * The drift problem this solves: Express routes are easy to add and impossible
 * to review by eye, so a response shape can change with nothing but a handler
 * edit. This file is the declared surface, and `tests/api-contract.test.ts`
 * walks the real router and fails if the two disagree in either direction:
 *
 *   - a route that exists but is not declared here, or
 *   - a route declared here that does not exist.
 *
 * That second direction is the one that earns its keep. Documentation that
 * silently outlives the code it describes is worse than none, because callers
 * keep building on a promise the server no longer makes.
 *
 * Error codes are not invented here. Each one is either a key in
 * `DOMAIN_ERROR_TAXONOMY` or a literal emitted by a route, and the test suite
 * rejects this file if a code appears that the server never sends — the same
 * drift rule applied one level down.
 *
 * Paths are relative to the `/api` mount point. Auth values:
 *
 *   'public'  no credential
 *   'admin'   `Authorization: Bearer $JOBS_ADMIN_TOKEN`
 *
 * Code: `backend/src/api/api-contract.ts`. Prose: `docs/API.md`.
 */

/** `session` means a signed-in caller of any role; `admin` means an operator. */
export type ApiAuth = 'public' | 'session' | 'admin';

export interface ApiRouteContract {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Relative to the `/api` mount, e.g. `/invoices/:id`. */
  path: string;
  summary: string;
  auth: ApiAuth;
  /** Present when the route returns a cursor or offset page. */
  pagination?: { style: 'cursor' | 'offset'; params: string[] };
  /** Notable non-2xx responses worth documenting beyond the shared envelope. */
  errors?: Array<{ status: number; code: string; when: string }>;
}

export const API_MOUNT = '/api';

/** Every route, in the order a caller meets them. */
export const API_CONTRACT: ApiRouteContract[] = [
  // ---------------------------------------------------------------- health
  {
    method: 'GET',
    path: '/health',
    summary: 'Liveness probe. Reports the storage mode backing the server.',
    auth: 'public',
  },
  {
    method: 'GET',
    path: '/ready',
    summary: 'Readiness probe. Checks the database before accepting traffic.',
    auth: 'public',
  },

  // -------------------------------------------------------------- invoices
  {
    method: 'POST',
    path: '/invoices',
    summary: 'Create an invoice. `externalId` is accepted here for import parity and makes the call idempotent.',
    auth: 'public',
    errors: [
    ],
  },
  {
    method: 'GET',
    path: '/invoices',
    summary: 'List invoices for a seller, newest first.',
    auth: 'public',
    pagination: { style: 'cursor', params: ['cursor', 'limit', 'sellerPublicKey'] },
    errors: [
    ],
  },
  {
    method: 'GET',
    path: '/invoices/stats',
    summary: 'Aggregate counts and totals for a seller.',
    auth: 'public',
  },
  {
    method: 'GET',
    path: '/invoices/:id',
    summary: 'Fetch one invoice. A PENDING invoice past its expiry is returned as EXPIRED.',
    auth: 'public',
    errors: [{ status: 404, code: 'INVOICE_NOT_FOUND', when: 'no invoice has that id' }],
  },
  {
    method: 'GET',
    path: '/invoices/:id/payment-info',
    summary: 'Everything a payer needs to pay: amount, asset, memo and expiry.',
    auth: 'public',
    errors: [{ status: 404, code: 'INVOICE_NOT_FOUND', when: 'no invoice has that id' }],
  },
  {
    method: 'POST',
    path: '/invoices/:id/cancel',
    summary: 'Cancel a PENDING invoice. Terminal; a cancelled invoice cannot be paid.',
    auth: 'public',
    errors: [
      { status: 404, code: 'INVOICE_NOT_FOUND', when: 'no invoice has that id' },
    ],
  },
  {
    method: 'POST',
    path: '/invoices/:id/verify',
    summary: 'Verify a payment against an invoice. Read-only with respect to the invoice.',
    auth: 'public',
    errors: [
      { status: 404, code: 'INVOICE_NOT_FOUND', when: 'no invoice has that id' },
      { status: 400, code: 'MISSING_TX_HASH', when: 'txHash is absent' },
      { status: 400, code: 'INVALID_TX_HASH', when: 'txHash is not 64 hex characters' },
      { status: 404, code: 'TRANSACTION_NOT_FOUND', when: 'Horizon has no such transaction yet' },
    ],
  },
  {
    method: 'POST',
    path: '/invoices/:id/simulate-payment',
    summary: 'Simulate a payment against the network. Does not mutate the invoice.',
    auth: 'public',
    errors: [
      { status: 404, code: 'INVOICE_NOT_FOUND', when: 'no invoice has that id' },
    ],
  },

  // ---------------------------------------------------------------- import
  {
    method: 'GET',
    path: '/imports/invoices/template',
    summary:
      'Download the canonical import CSV: the accepted header plus one valid example row.',
    auth: 'public',
  },
  {
    method: 'POST',
    path: '/imports/invoices',
    summary:
      'Bulk import invoices from JSON or CSV. Dry run by default; pass `dryRun: false` to write. `maxRows` may only tighten the server cap.',
    auth: 'public',
    errors: [
      { status: 400, code: 'INVALID_IMPORT_REQUEST', when: 'the request body is not a valid import request' },
      { status: 400, code: 'INVALID_IMPORT_PAYLOAD', when: 'the payload is not parseable JSON or CSV, or exceeds maxRows' },
    ],
  },

  // ----------------------------------------------------------------- audit
  {
    method: 'GET',
    path: '/stellar/account',
    summary: 'Account balances and sequence for an address.',
    auth: 'admin',
    errors: [
    ],
  },
  {
    method: 'GET',
    path: '/stellar/payments',
    summary: 'Recent payments for an account.',
    auth: 'admin',
    errors: [
    ],
  },
  {
    method: 'GET',
    path: '/stellar/transaction/:hash',
    summary: 'Fetch one transaction by hash.',
    auth: 'admin',
    errors: [
      { status: 400, code: 'INVALID_TX_HASH', when: 'the hash is not 64 hex characters' },
      { status: 404, code: 'TRANSACTION_NOT_FOUND', when: 'Horizon has no such transaction' },
    ],
  },
  {
    method: 'POST',
    path: '/stellar/verify-payment',
    summary: 'Verify a payment without an invoice, for reconciliation.',
    auth: 'admin',
    errors: [
      { status: 400, code: 'MISSING_TX_HASH', when: 'txHash is absent' },
      { status: 400, code: 'INVALID_TX_HASH', when: 'txHash is not 64 hex characters' },
    ],
  },

  // --------------------------------------------------------- reconciliation
  {
    method: 'POST',
    path: '/payment/sync',
    summary: 'Run a manual payment-monitor sync. Intended for maintainers and tests.',
    auth: 'public',
  },
  // ------------------------------------------------------------------ auth
  {
    method: 'POST',
    path: '/auth/session',
    summary: 'Exchange a signed wallet challenge for a server session.',
    auth: 'public',
  },
  {
    method: 'GET',
    path: '/auth/me',
    summary: 'The identity behind the current credentials.',
    auth: 'session',
  },
  {
    method: 'GET',
    path: '/auth/roles',
    summary: 'Roles and permissions granted to the current identity.',
    auth: 'session',
  },

  // -------------------------------------------------------------- invoices
  {
    method: 'GET',
    path: '/invoices/lifecycle',
    summary: 'Invoice state-machine transitions and the states that permit them.',
    auth: 'public',
  },
  {
    method: 'GET',
    path: '/invoices/:id/audit',
    summary: 'Ordered audit trail for one invoice: lifecycle and payment events as one history.',
    auth: 'public',
  },
  {
    method: 'GET',
    path: '/invoices/:id/deliveries',
    summary: 'Email delivery attempts recorded for one invoice.',
    auth: 'public',
  },
  {
    method: 'POST',
    path: '/invoices/:id/send-email',
    summary: 'Queue a reminder email for one invoice. Rate-limited per invoice and per recipient.',
    auth: 'public',
  },
  {
    method: 'POST',
    path: '/invoices/:id/send-proof',
    summary: 'Send payment proof to the buyer for one invoice.',
    auth: 'public',
  },

  // ----------------------------------------------------------------- email
  {
    method: 'GET',
    path: '/email/circuit-breaker',
    summary: 'Current state of the email circuit breaker and why it last opened.',
    auth: 'public',
  },
  {
    method: 'POST',
    path: '/email/circuit-breaker/reset',
    summary: 'Close an open email circuit breaker once the underlying fault is cleared.',
    auth: 'public',
  },

  // -------------------------------------------------------- payment monitor
  {
    method: 'GET',
    path: '/payment/monitor/status',
    summary: 'Payment monitor checkpoint and last sweep, for diagnosing a stalled monitor.',
    auth: 'public',
  },

  // --------------------------------------------------------- reconciliation
  {
    method: 'GET',
    path: '/reconciliation',
    summary: 'Read-only reconciliation dry run. Operators and services only.',
    auth: 'public',
  },
];

/** `GET /invoices/:id` for lookups by key. */
export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

export const API_CONTRACT_KEYS = API_CONTRACT.map((r) => routeKey(r.method, r.path));

/** Look up a declared route, if any. */
export function findRoute(method: string, path: string): ApiRouteContract | undefined {
  return API_CONTRACT.find((r) => routeKey(r.method, r.path) === routeKey(method, path));
}

/**
 * Routes gated behind the admin token, derived from the contract rather than
 * restated, so the two cannot drift.
 */
export function adminRoutes(): string[] {
  return API_CONTRACT.filter((r) => r.auth === 'admin').map((r) => routeKey(r.method, r.path));
}

/** Every error code the contract claims the server can return. */
export function contractErrorCodes(): string[] {
  return [...new Set(API_CONTRACT.flatMap((r) => (r.errors ?? []).map((e) => e.code)))].sort();
}
