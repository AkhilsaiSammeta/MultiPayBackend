# Beginner Guide: Universal Pay Backend

Welcome! This guide walks you through the project from scratch. You do not need prior backend experience—just follow the steps in order.

## 1. What This Project Does

`universal-pay-backend` is a Node.js + TypeScript API that manages payments through three providers:

- **Stripe** – popular globally.
- **PayPal** – common for online storefronts.
- **Razorpay** – widely used in India.

The API exposes endpoints to:

- create a payment ("charge" the customer).
- confirm a payment (finish the flow when extra steps are needed).
- refund a payment.
- receive secure webhooks that report provider updates.

Behind the scenes it uses PostgreSQL via Prisma to store payments, metadata, webhook logs, and idempotency information (so the same request cannot run twice).

## 2. What You Need Before Starting

1. **Node.js 18.18+** – download from https://nodejs.org if you do not have it.
2. **PostgreSQL** – any local or hosted database. For experimentation you can use Docker or services like Supabase.
3. (Optional but helpful) **Stripe, PayPal, and Razorpay test accounts** so you can try real API calls.

Confirm Node works:

```powershell
node --version
npm --version
```

## 3. Clone and Install

If you already have the source open in VS Code, skip cloning. Otherwise:

```powershell
git clone <your-repo-url>
cd universal-pay-backend
```

Install dependencies (this pulls Express, Prisma, Stripe SDK, etc.):

```powershell
npm install
```

## 4. Configure Environment Variables

Copy the example environment file, then edit the copy:

```powershell
Copy-Item .env.example .env
```

Open `.env` and fill in:

- `DATABASE_URL` – your Postgres connection string.
- Provider secrets:
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

For quick testing you can leave placeholder values; just note that real provider calls will fail until you put real credentials.

## 5. Prepare the Database

Prisma turns the schema into SQL tables. Run:

```powershell
npx prisma migrate dev --name init
```

This command:

1. Creates the tables defined in `prisma/schema.prisma`.
2. Generates the Prisma client used in the TypeScript code (output goes into `node_modules/@prisma/client`).

You can re-run the client generation at any time:

```powershell
npx prisma generate
```

## 6. Start the Development Server

Use the built-in script:

```powershell
npm run dev
```

This runs `tsx watch src/index.ts`, so every time you change code the server reloads automatically. Default port is **3000** (change `PORT` in `.env` if you need to).

### Optional: VS Code Task

We already added a task (`.vscode/tasks.json`). In VS Code press **Ctrl+Shift+B** and choose **npm: dev** to start the same command in the background.

## 7. Try the API

Use any REST client (Thunder Client, Postman, curl). Example request to create a payment:

```http
POST http://localhost:3000/payments
Idempotency-Key: demo-123
Content-Type: application/json

{
  "provider": "stripe",
  "amount": 5000,
  "currency": "usd",
  "description": "Sample order",
  "metadata": {
    "orderId": "ORD-001"
  }
}
```

Responses look like:

```json
{
  "data": {
    "id": "payment-id",
    "provider": "stripe",
    "status": "PENDING",
    "amount": 5000,
    "currency": "USD",
    "metadata": { "orderId": "ORD-001" },
    "createdAt": "2025-10-22T11:30:00.000Z"
  },
  "providerResponse": { "id": "pi_..." },
  "cached": false
}
```

> **Tip:** `Idempotency-Key` is required so resending the same request does not create duplicate payments.

Other endpoints:

| Method & Path | Description |
|---------------|-------------|
| `POST /payments/:paymentId/confirm` | Confirms a payment when a provider requires follow-up. |
| `POST /payments/:paymentId/refund` | Issues a refund (optionally partial). |
| `POST /webhooks/:provider` | Receives webhook events from Stripe/PayPal/Razorpay. |
| `GET /health` | Simple health-check returning `{ "status": "ok" }`. |

## 8. Project Structure Overview

```
src/
  adapters/       // Provider-specific logic (Stripe, PayPal, Razorpay)
  config/         // Environment loader, logger configuration
  lib/            // Prisma client singleton
  middleware/     // Express middleware (logging, errors, idempotency)
  repositories/   // Database access for payments & idempotency
  routes/         // Express routers for /payments and /webhooks
  services/       // Business logic (PaymentService, IdempotencyService)
  types/          // Shared TypeScript types and augmentations
  utils/          // Helpers like async handler, error class
prisma/
  schema.prisma   // Database schema (tables & enums)
docs/
  beginner-guide.md // This guide
```

## 9. Useful Commands Recap

| Command | Purpose |
|---------|---------|
| `npm install` | Install project dependencies. |
| `npm run dev` | Start development server with auto-reload. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm start` | Run compiled output (after `npm run build`). |
| `npm run lint` | Run ESLint on source files. |
| `npm run test` | Execute Vitest tests (add your tests under `src/**/*.test.ts`). |
| `npx prisma migrate dev --name <desc>` | Create/apply database migrations. |
| `npx prisma studio` | Open a browser UI to inspect the database. |

## 10. Exploring Next

1. **Check Prisma schema** (`prisma/schema.prisma`) to understand the data model (tables for payments, metadata, webhook events, idempotency keys).
2. **Read services** (`src/services/paymentService.ts`) to see how different steps call providers.
3. **Inspect adapters** to learn how each provider’s SDK is used.
4. **Add tests** under `src/**/*.test.ts` or `tests/` to validate logic (Vitest is set up).
5. **Deploy** by building (`npm run build`) and running `npm start` on your server/hosting environment. Do not forget to set environment variables in production.

## 11. Frequently Asked Questions

**Q: Can I skip a provider?**  
Yes. If you leave a provider’s keys empty, those routes will throw a 500 error when used. Remove the adapter or return a friendly message if you only want certain providers.

**Q: Where do webhooks get stored?**  
See `WebhookEvent` in the Prisma schema. Every received event (whether it matches a payment or not) is saved for auditing.

**Q: How do I clean the database?**  
Use `npx prisma migrate reset` (this drops all tables, then reapplies migrations).

**Q: Why idempotency?**  
Many payment operations must not repeat if the client retries. The middleware stores request hashes plus responses, so your API returns the original result instead of creating duplicates.

---

You are ready to explore! Keep this document handy while learning the codebase, and feel free to extend it with notes specific to your workflow.
