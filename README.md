# universal-pay-backend

Node.js + TypeScript backend implementing adapters for Stripe, PayPal, and Razorpay with secure webhook handling, idempotency, and Postgres models via Prisma.

Quick start

1. Copy `.env.example` to `.env` and fill values (DATABASE_URL, provider keys, webhook secrets).
2. Install dependencies:

```powershell
npm install
```

3. Generate Prisma client and run migrations:

```powershell
npx prisma generate
npx prisma migrate dev --name init
```

4. Run in development:

```powershell
npm run dev
```

What I implemented

- Project scaffold (TypeScript, ESLint, Vitest).
- Prisma schema for Payment, IdempotencyKey, WebhookEvent, and supporting models.
- Adapters for Stripe, PayPal, and Razorpay with webhook construction and signature verification.
- Idempotency service + repository to deduplicate / cache results.
- Payment service wiring create/confirm/refund flows and webhook processing.
- Express app with routes for payments and webhooks, safe raw-body handling for signature verification.

Next steps

- Install dependencies and run the app.
- Add more unit/integration tests (I created tests folder).
- Wire CI and document environment variables (`.env.example`).
