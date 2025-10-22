# File-by-File Overview (Beginner Friendly)

This document walks through every important file in the repository so you can understand what each one does. Work through it in order and open the referenced files in VS Code as you go.

## Project Root

- **`package.json`** – Lists dependencies, npm scripts (`dev`, `build`, `lint`, `test`), and project metadata. Run `npm run <script>` to execute common tasks.
- **`package-lock.json`** – Auto-generated lockfile that records exact dependency versions. Do not edit manually.
- **`.gitignore`** – Tells Git which files/folders to ignore (like `node_modules/`, `.env`).
- **`.eslintrc.cjs`** – ESLint configuration. Defines linting rules and environments.
- **`tsconfig.json`** – Base TypeScript configuration for development (module resolution, strictness, path aliases).
- **`tsconfig.build.json`** – Build-specific TypeScript config (extends `tsconfig.json` but customizes output directory, excludes tests, etc.).
- **`vitest.config.ts`** – Configuration for Vitest test runner (TypeScript + DOM settings, coverage options if added).
- **`.env.example`** – Template for required environment variables. Copy it to `.env` and fill with real values.
- **`README.md`** – High-level project description and quick-start steps.
- **`docs/`** – Additional documentation (beginner guide, backend overview, linking to frontend, and this file).
- **`prisma/`** – Prisma ORM schema and migrations (see below).
- **`src/`** – Main application source code (detailed later).
- **`dist/`** – Compiled output after running `npm run build`.
- **`tests/`** – Placeholder for automated tests (you can add unit/integration tests here).
- **`.vscode/`** – Editor settings for VS Code (tasks, recommended extensions if any).

## `.github/` Directory

- **`copilot-instructions.md`** – Custom guidance to GitHub Copilot for this workspace. Maintainers can edit it to add project-specific instructions.

## `docs/` Directory

- **`beginner-guide.md`** – Step-by-step onboarding (installing dependencies, configuring env, running server, hitting endpoints).
- **`backend-overview.md`** – Architecture summary, request lifecycle, environment variables, operational notes.
- **`linking-to-frontend.md`** – Guidance for integrating the backend with a frontend app (CORS, idempotency, sample fetch/Stripe flows).
- **`file-by-file-overview.md`** – This document.

## `prisma/` Directory

- **`schema.prisma`** – Defines the database schema (models for `Payment`, `PaymentMetadata`, `WebhookEvent`, `IdempotencyKey`, enums). Prisma uses this to generate the TypeScript client.
- (Migration files appear under `prisma/migrations/` if you run `prisma migrate dev`.)

## `src/` Directory Summary

```
adapters/         // Payment provider integrations
config/           // Environment + logger setup
lib/              // Shared singletons (Prisma client)
middleware/       // Express middleware
repositories/     // Database persistence helpers
routes/           // Express routers
services/         // Business logic orchestrators
types/            // Shared TypeScript types and augmentations
utils/            // Helpers (errors, async wrapper, etc.)
app.ts            // Express app creation
server.ts         // Application entrypoint (starts the HTTP server)
index.ts          // CLI/runner (loads env, starts server)
```

### `src/app.ts`
Creates the Express application: wires middlewares (logging, JSON parsing, raw body for webhooks), registers routes (`/payments`, `/webhooks`), and attaches the global error handler.

### `src/server.ts`
Exports a function `startServer()` that reads the port from configuration, creates the app, starts listening, and handles shutdown signals (SIGINT/SIGTERM). Useful for tests and CLI entrypoint.

### `src/index.ts`
Minimal script that loads the environment, calls `startServer()`, and logs startup success/failure. Used by `npm run dev` and `npm start`.

### `src/config/env.ts`
Loads `.env` using `dotenv`, validates variables with Zod (ensures required keys exist and types are correct), and exports a typed `env` object consumed across the project.

### `src/config/logger.ts`
Configures the `pino` logger. Exposes a logger instance with the correct log level based on `env.LOG_LEVEL`.

### `src/lib/prisma.ts`
Creates a singleton Prisma client to avoid multiple database connections. Other modules import `prisma` from here.

### `src/utils/errors.ts`
Defines `AppError`, a custom error class that includes HTTP status and machine-readable `code`. The Express error handler uses it to format consistent JSON responses.

### `src/utils/asyncHandler.ts`
Helper to wrap async route handlers and pass errors to Express’s `next()`, preventing unhandled promise rejections.

### `src/middleware/logging.ts`
Express middleware that logs incoming requests/responses using Pino.

### `src/middleware/errorHandler.ts`
Final Express error handler. Converts thrown errors (including `AppError`) into HTTP responses with JSON body `{ code, message, details }`.

### `src/middleware/requireIdempotencyKey.ts`
Ensures critical routes receive the `Idempotency-Key` header. Normalizes header case, stores the key in `res.locals`, or throws `AppError` if missing.

### `src/types/express.d.ts`
Augments Express `Request` and `Response` types so TypeScript knows about `res.locals.idempotencyKey` and other custom properties set by middleware.

### `src/types/payments.ts`
Defines TypeScript types/enums for providers (`'stripe' | 'paypal' | 'razorpay'`), payment statuses, metadata shapes, DTOs, and service input/output contracts.

### `src/types/webhooks.ts`
Types describing webhook payloads and the payload shape stored in the database.

### `src/adapters/paymentAdapter.ts`
Declares a TypeScript interface `PaymentAdapter` that all provider adapters implement. Ensures consistent methods (`createPayment`, `confirmPayment`, `refundPayment`, `verifyWebhook`, etc.).

### `src/adapters/index.ts`
Factory function `getPaymentAdapter(provider)` that returns the correct adapter instance (Stripe, PayPal, Razorpay). Caches single instances to avoid recreating clients repeatedly.

### `src/adapters/stripeAdapter.ts`
Implements `PaymentAdapter` using the Stripe SDK:
- Creates PaymentIntents
- Confirms intents
- Issues refunds
- Verifies webhooks
- Maps Stripe statuses to project statuses
Throws `AppError` if Stripe secrets are missing.

### `src/adapters/paypalAdapter.ts`
Implements PayPal-specific logic:
- Uses PayPal REST SDK to create orders, capture payments, and process refunds.
- Sets `PayPal-Request-Id` header for idempotency.
- Handles provider-specific API responses and converts them to shared DTOs.

### `src/adapters/razorpayAdapter.ts`
Handles Razorpay orders, payments, and refunds using Razorpay SDK with proper signature validation for webhooks.

### `src/repositories/paymentRepository.ts`
- Provides functions to create payments, update status, find by id, and find by provider payment id.
- Maps between project-level provider/status strings and database enums.
- Includes `toPaymentDTO` helper to flatten Prisma output into API-friendly shape.

### `src/repositories/idempotencyRepository.ts`
CRUD operations for `IdempotencyKey` table (lookup by key, create, lock rows, store cached responses, purge expired keys).

### `src/repositories/webhookRepository.ts` *(if present)*
Stores incoming webhook events for auditing. (If the file isn’t present yet, add one when implementing webhook persistence.)

### `src/services/idempotencyService.ts`
Central logic to enforce idempotency:
- Checks if an idempotency key exists.
- Compares hashes to prevent different payloads using same key.
- Creates and locks records before running business logic.
- Stores response for future retries.

### `src/services/paymentService.ts`
High-level orchestration of payment flows:
- `createPayment` uses idempotency service, delegates to provider adapter, saves DB records, returns DTO.
- `confirmPayment` handles payment confirmation after client actions.
- `refundPayment` issues refunds through provider and updates local status.
- Also handles linking webhook events to payments when needed.

### `src/routes/payments.ts`
Express router with endpoints:
- `POST /payments` (create)
- `POST /payments/:id/confirm`
- `POST /payments/:id/refund`
Uses Zod schemas for request validation and `requireIdempotencyKey` middleware.

### `src/routes/webhooks.ts`
Express router for `POST /webhooks/:provider`. Verifies provider signature, delegates to adapters/services to process events.

### `src/routes/health.ts` *(if present)*
Simple `GET /health` endpoint returning `{ status: 'ok' }` used by load balancers/probes.

### `src/routes/index.ts`
Combines payment and webhook routers into a single router mounted in `app.ts`.

### `tests/` Directory
Placeholder for automated tests. Example patterns:
- `tests/paymentService.test.ts` – Unit tests for service logic with mocked adapters/repositories.
- `tests/routes/payments.test.ts` – Integration tests hitting Express endpoints with Supertest.

## How Things Connect

1. **Entry**: `index.ts` loads env, calls `startServer()`.
2. **Server**: `startServer()` builds the Express app from `app.ts` and starts listening.
3. **Routes** call **services**, which use **repositories** and **adapters**.
4. **Middleware** adds cross-cutting behavior (logging, error handling, idempotency).
5. **Prisma client** in `lib/prisma.ts` gives repositories access to Postgres tables defined in `prisma/schema.prisma`.
6. **Types** ensure TypeScript knows the shape of data passed between layers.

## Suggested Learning Path

1. Read `docs/beginner-guide.md` to set up the project.
2. Open `src/app.ts` to see how the server is constructed.
3. Explore `routes/payments.ts` and `services/paymentService.ts` to understand one request end-to-end.
4. Look into `adapters/stripeAdapter.ts` to see real provider integration.
5. Check `repositories/paymentRepository.ts` to understand database interactions.
6. Review `prisma/schema.prisma` to see the underlying database structure.
7. Scan this document anytime you forget what a file does.

Happy hacking! If any section is unclear, ask for a deeper dive on that file or flow.