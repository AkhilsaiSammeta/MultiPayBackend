# MultiPay Backend (Node + TypeScript)

Simple payments API for Stripe, PayPal, and Razorpay. Includes idempotency, secure webhooks, and Postgres via Prisma.

## Requirements
- Node.js 18.18+
- PostgreSQL (local or hosted)
- Provider keys (optional to start; needed for real calls)

## Quick start
1) Copy env and fill at least `DATABASE_URL` (provider keys later):
```powershell
Copy-Item .env.example .env
```
2) Install and set up the database:
```powershell
npm install
npx prisma migrate dev --name init
```
3) Run the server (default http://localhost:3000):
```powershell
npm run dev
```

## Core endpoints
- POST /payments — create a payment (requires header: Idempotency-Key)
- POST /payments/:id/confirm — confirm when extra steps (e.g., 3DS) are needed
- POST /payments/:id/refund — issue a refund
- POST /webhooks/:provider — provider webhooks (server-to-server)

Tip: Use any REST client to call POST /payments with a unique `Idempotency-Key` to avoid duplicates.

## Configure providers later
Fill these in `.env` when ready:
- Stripe: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- PayPal: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID
- Razorpay: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET

## Learn more (short reads)
- `docs/beginner-guide.md` — step-by-step setup and sample requests
- `docs/linking-to-frontend.md` — how to call this API from a UI (CORS, idempotency, examples)
- `docs/backend-overview.md` — how the code is organized (routes, services, adapters)
- `docs/file-by-file-overview.md` — what each file does

That’s it. Start with the beginner guide, then try creating a payment. If you want a sample UI, tell me your stack and I’ll scaffold it.
