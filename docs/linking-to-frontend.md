# Linking the Frontend to this Payments Backend

This document explains the recommended approach to integrate a frontend application with this payments backend. It covers the core endpoints, CORS, idempotency, webhook handling, security, and practical examples (vanilla fetch + Stripe client flow).

## Overview

- Backend base path: your server (e.g. `https://api.example.com` or `http://localhost:3000` for local dev).
- Primary endpoints used by frontends:
  - `POST /payments` — create a payment (returns a payment DTO and any provider client data required to continue on the client)
  - `POST /payments/:id/confirm` — confirm a payment that requires client-side action (e.g. 3DS)
  - `POST /payments/:id/refund` — request a refund
  - Webhook route(s): `POST /webhooks/:provider` — provider server-to-server callbacks (not called from frontend)

Adjust the base path and route prefixes depending on how you mount the Express app (check the project `src/routes` for exact paths).

## CORS and same-origin considerations

- Enable CORS in the backend to allow requests from the frontend origin during development and production. Only allow trusted origins in production.
- Example minimal CORS configuration (Express):

```ts
import cors from 'cors';
app.use(cors({
  origin: ['http://localhost:5173', 'https://app.example.com'],
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Idempotency-Key'],
  credentials: true,
}));
```

## Idempotency (important)

- The backend requires an `Idempotency-Key` header for payment-creating endpoints. This prevents duplicate payments if the frontend retries a request.
- Generate a unique, collision-resistant key per user-intent (e.g., order ID + random suffix or UUID).
- Example header:

```
Idempotency-Key: order_1234::b4f3a9e2
```

- If a frontend retries the same operation, reuse the same idempotency key so the backend returns the stored response instead of creating a duplicate.

## Typical client flow (generic)

1. Frontend posts to `POST /payments` with minimal body (provider, amount, currency, optional metadata and description) and `Idempotency-Key` header.
2. Backend responds with a Payment DTO. For some providers (Stripe) the response may include client-side details (e.g. client secret or intent id) that the frontend must use with the provider SDK to complete authentication.
3. If provider requires further client-side action (3DS), the frontend calls the provider SDK (Stripe.js), then calls `POST /payments/:id/confirm` to tell the backend to capture/confirm if necessary.

### Example: create payment (fetch)

```js
const payload = {
  provider: 'stripe',
  amount: 5000, // integer smallest-currency-unit (e.g. cents)
  currency: 'USD',
  description: 'Order #1234',
  metadata: { orderId: '1234', userId: 'u-789' }
};

const res = await fetch('http://localhost:3000/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': 'order_1234::' + crypto.randomUUID()
  },
  body: JSON.stringify(payload)
});

const data = await res.json();
// data may contain provider-specific fields (e.g. stripe.clientSecret) to use with provider SDK
```

### Example: Stripe client flow (high-level)

1. Frontend calls `POST /payments` and backend responds with a payment DTO that includes a Stripe `clientSecret` (created server-side).
2. Frontend calls Stripe.js to confirm the payment intent:

```js
const stripe = Stripe('pk_live_...'); // use publishable key in frontend
const {error} = await stripe.confirmCardPayment(clientSecret, {
  payment_method: { card: cardElement }
});
if (error) {
  // Show error to user; user can retry, reusing same idempotency key
} else {
  // Success — you can optionally call backend `POST /payments/:id/confirm` if the app requires explicit confirmation step
}
```

Note: Never expose secret keys on the frontend. The backend uses secret API keys for providers and should create any provider-side intents/tokens.

## Webhooks and real-time updates

- Webhooks are delivered server-to-server to `POST /webhooks/:provider`. Do NOT call these from the browser. Instead:
  - Configure the provider dashboard (Stripe / PayPal / Razorpay) to point to your backend webhook URL.
  - Backend validates signatures and updates payment records.

- To notify the frontend of payment status changes, options include:
  - Polling: frontend polls `GET /payments/:id` for status updates.
  - WebSockets or Server-Sent Events (SSE): backend emits events to connected clients when webhooks update a payment.
  - Push notifications or a messaging layer if you have one.

Example: when webhook updates payment status to `SUCCEEDED`, the backend can store the update and push a socket event `payment:updated` with the payment DTO.

## Metadata and linking orders

- Use the `metadata` field on the payment to store a frontend order id, user id, or other application-level references. This makes it easy to find the payment row corresponding to a UI order.

Example metadata:

```json
{"orderId": "1234", "cartVersion": "v2"}
```

When the backend returns the Payment DTO, it contains the `id` and metadata so the frontend can correlate it with local state.

## Security best practices

- Never send provider secret keys to the frontend.
- Only accept CORS origins you control in production.
- Rate-limit endpoints and validate inputs server-side.
- Use HTTPS in production.
- Rotate keys and rotate webhook secrets if suspected leakage.

## Local development tips

- Run the backend locally (`npm run dev`) and point your frontend at `http://localhost:3000`.
- Use a webhook tunnel service (ngrok, localtunnel) to forward provider webhooks to your local machine while developing. Configure the provider webhook URL with the forwarded public URL.
- Keep `.env` values out of source control. Use `.env.example` to document required variables.

## Troubleshooting

- If the frontend sees duplicate payments, confirm the `Idempotency-Key` is stable for retry attempts.
- If webhooks aren't received locally, ensure your tunnel is forwarding the correct path and that the provider's dashboard is configured for that URL and event types.
- If Stripe client returns `requires_action`, ensure frontend runs the `stripe.confirmCardPayment` step with the provided `clientSecret`.

---

If you'd like, I can also add a small example frontend repo snippet (Vite + React) or a short server-sent-events example to demonstrate pushing webhook updates to the browser. Let me know which you'd prefer.