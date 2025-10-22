import Stripe from 'stripe';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import type {
  ConfirmPaymentAdapterInput,
  CreatePaymentAdapterInput,
  PaymentAdapter,
  PaymentAdapterResponse,
  RefundPaymentAdapterInput,
  WebhookConstructionResult
} from './paymentAdapter.js';
import type { PaymentStatus } from '../types/payments.js';

const stripeClient = (() => {
  if (!env.STRIPE_SECRET_KEY) {
    return null;
  }

  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-04-10'
  });
})();

const stripeStatusMap: Record<Stripe.PaymentIntent.Status, PaymentStatus> = {
  canceled: 'FAILED',
  processing: 'PENDING',
  requires_action: 'REQUIRES_ACTION',
  requires_capture: 'REQUIRES_ACTION',
  requires_confirmation: 'REQUIRES_ACTION',
  requires_payment_method: 'FAILED',
  succeeded: 'SUCCEEDED'
};

const mapStripeStatus = (status: Stripe.PaymentIntent.Status): PaymentStatus => {
  return stripeStatusMap[status] ?? 'PENDING';
};

const ensureClient = (): Stripe => {
  if (!stripeClient) {
    throw new AppError('Stripe is not configured. Check STRIPE_SECRET_KEY env variable.', {
      status: 500,
      code: 'STRIPE_NOT_CONFIGURED'
    });
  }

  return stripeClient;
};

export class StripeAdapter implements PaymentAdapter {
  async createPayment(input: CreatePaymentAdapterInput): Promise<PaymentAdapterResponse> {
    const client = ensureClient();
    const intent = await client.paymentIntents.create(
      {
        amount: input.amount,
        currency: input.currency.toLowerCase(),
        description: input.description,
        metadata: input.metadata,
        capture_method: input.captureMethod === 'manual' ? 'manual' : 'automatic',
        automatic_payment_methods: { enabled: true }
      },
      { idempotencyKey: input.idempotencyKey }
    );

    return {
      providerPaymentId: intent.id,
      status: mapStripeStatus(intent.status),
      raw: intent
    };
  }

  async confirmPayment(input: ConfirmPaymentAdapterInput): Promise<PaymentAdapterResponse> {
    const client = ensureClient();

    if (input.metadata && Object.keys(input.metadata).length > 0) {
      await client.paymentIntents.update(input.providerPaymentId, {
        metadata: input.metadata
      });
    }

    const intent = await client.paymentIntents.confirm(input.providerPaymentId);

    return {
      providerPaymentId: intent.id,
      status: mapStripeStatus(intent.status),
      raw: intent
    };
  }

  async refundPayment(input: RefundPaymentAdapterInput): Promise<PaymentAdapterResponse> {
    const client = ensureClient();
    const refundReason: Stripe.RefundCreateParams.Reason | undefined = (() => {
      if (!input.reason) {
        return undefined;
      }

      const normalized = input.reason.toLowerCase();
      if (normalized.includes('duplicate')) return 'duplicate';
      if (normalized.includes('fraud')) return 'fraudulent';
      if (normalized.includes('customer')) return 'requested_by_customer';
      return undefined;
    })();

    const refund = await client.refunds.create(
      {
        payment_intent: input.providerPaymentId,
        amount: input.amount,
        metadata: input.metadata,
        reason: refundReason
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
    );

    const paymentIntentId = refund.payment_intent;
    if (typeof paymentIntentId !== 'string') {
      throw new AppError('Stripe refund did not include payment_intent reference.', {
        status: 502,
        code: 'STRIPE_REFUND_MISSING_INTENT'
      });
    }

    const status: PaymentStatus = refund.status === 'failed' ? 'FAILED' : 'REFUNDED';

    return {
      providerPaymentId: paymentIntentId,
      status,
      raw: refund
    };
  }

  async constructWebhookEvent(payload: Buffer, headers: Record<string, string | string[] | undefined>): Promise<WebhookConstructionResult> {
    const signatureHeader = headers['stripe-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!signature) {
      throw new AppError('Stripe webhook signature header is missing.', {
        status: 400,
        code: 'STRIPE_SIGNATURE_MISSING'
      });
    }

    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError('Stripe webhook secret is not configured.', {
        status: 500,
        code: 'STRIPE_WEBHOOK_SECRET_MISSING'
      });
    }

    const client = ensureClient();
    const event = client.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);

    let paymentUpdate: WebhookConstructionResult['payload'] = null;

    if (event.type.startsWith('payment_intent.') && event.data.object && typeof event.data.object === 'object') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      paymentUpdate = {
        provider: 'stripe',
        providerPaymentId: paymentIntent.id,
        status: mapStripeStatus(paymentIntent.status),
        metadata: paymentIntent.metadata
      };
    }

    return {
      eventId: event.id,
      provider: 'stripe',
      type: event.type,
      payload: paymentUpdate,
      rawEvent: event
    };
  }
}
