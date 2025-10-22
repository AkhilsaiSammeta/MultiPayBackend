# Backend Overview

This guide explains how the backend is organized, how data flows through it, and how to operate it confidently in development and production.

## Architecture at a Glance

- **Express HTTP API (`src/app.ts`)** hosts REST endpoints for payments, refunds, and webhooks.
- **Adapters (`src/adapters/`)** wrap provider SDKs (Stripe, PayPal, Razorpay) and translate provider-specific responses into the project domain types.
- **Services (`src/services/`)** coordinate business logic: `PaymentService` orchestrates create/confirm/refund flows, `IdempotencyService` guarantees once-only execution, and additional helpers live alongside.
- **Repositories (`src/repositories/`)** offer persistence helpers and encapsulate Prisma access for payments, idempotency keys, and metadata.
- **Middleware (`src/middleware/`)** handles request validation, logging, error formatting, and enforcing idempotency headers.
- **Configuration (`src/config/`)** loads environment variables via Zod validation so misconfigured envs fail fast.
- **Prisma (`prisma/`)** defines the Postgres schema and generated client used by repositories.

The runtime entrypoint (`src/server.ts`) bootstraps env loading, constructs the Express app, and binds process-level signals.

## Request Lifecycle

1. **Incoming HTTP request** hits Express routes defined under `src/routes/`.
2. **Middleware chain** runs (`logging`, `requireIdempotencyKey`, `errorHandler`, etc.). Invalid requests surface as typed `AppError` responses.
3. **Route handler** calls a service method (e.g., `PaymentService.createPayment`).
4. **Service** fetches a payment adapter, coordinates provider SDK calls, persists records using repositories, and ensures idempotency.
5. **Repository** talks to Prisma, storing payments, metadata, idempotency keys, and webhook events.
6. **Response DTO** is shaped via helper mappers (e.g., `toPaymentDTO`) before returning JSON to clients.

Webhooks follow a similar flow but are routed through provider-specific webhook handlers that verify signatures before delegating to the service layer.

## Data Model Summary

The Prisma schema (`prisma/schema.prisma`) manages five core concepts:

- `Payment`: stores provider, amount, currency, status, metadata relation, idempotency references, and timestamps.
- `PaymentMetadata`: key/value pairs attached to a payment (used for order references, user IDs, etc.).
- `IdempotencyKey`: tracks request hashes, responses, lock timestamps, and TTL for idempotent operations.
- `WebhookEvent`: logs incoming provider webhooks with payloads and optional linkage to payments.

Run `npx prisma format` after schema edits, and regenerate the client with `npx prisma generate`.

## Environment Variables

Settings live in `.env` (with defaults documented in `.env.example`). Key entries:

- `DATABASE_URL` — Postgres connection string (use separate DB per environment).
- Provider secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
- `PORT` — Express port (default 3000).
- `IDEMPOTENCY_LOCK_TIMEOUT_SECONDS` and `IDEMPOTENCY_CACHE_TTL_SECONDS` — guard concurrent replays.

Environment validation occurs at startup; missing required values stop the server early.

## Running Locally

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

- Use Postgres locally (Docker or managed service).
- Seed test data with Prisma or scripted inserts if desired.
- Stripe/PayPal/Razorpay SDKs read secrets at runtime, so ensure `.env` is populated.

## Testing & Quality

- `npm run test` runs Vitest unit tests.
- `npm run lint` enforces ESLint rules.
- `npm run build` compiles TypeScript via `tsc -p tsconfig.build.json`.

Add provider mocks or integration tests under `tests/` as you introduce new features.

## Operational Notes

- **Idempotency**: every create/confirm/refund route expects `Idempotency-Key`. Missing keys trigger a 400 error. Cached responses are returned when duplicates arrive.
- **Logging**: Pino instance (`src/lib/logger.ts`) outputs JSON logs (structured for log aggregation). Adjust log level via env `LOG_LEVEL`.
- **Errors**: The custom `AppError` bubbles to the error handler, emitting consistent JSON structure with `code` and `status` fields.
- **Security**: Always deploy behind HTTPS, sanitize webhook origins (signature verification is built in), and restrict CORS origins.

## Extending the Backend

When adding a new provider or feature:

1. Create a new adapter implementing the `PaymentAdapter` interface.
2. Extend `getPaymentAdapter` switch and update provider enums/types.
3. Add any new database fields via Prisma migration.
4. Update services and DTO mappers to include new data.
5. Document configuration changes in `.env.example` and docs.

For cross-cutting changes (analytics, notifications), prefer adding service-layer hooks or event emitters rather than modifying route handlers directly.

## Deployment Checklist

- Apply Prisma migrations to your production database.
- Configure environment variables using your platform's secret store.
- Set up HTTPS termination and CORS allow-list.
- Register webhook URLs with Stripe/PayPal/Razorpay and keep secrets in sync.
- Enable health probes (optionally expose `GET /health` if needed) and log shipping.

---

Need deeper dives (e.g., webhook replay handling, multi-tenant setup, or infrastructure recommendations)? Let me know and I can extend this documentation.