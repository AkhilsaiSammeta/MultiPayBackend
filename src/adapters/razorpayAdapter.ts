import crypto from 'node:crypto';
import Razorpay from 'razorpay';
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

const razorpayClient = (() => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return null;
  }

  return new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
})();

const ensureClient = () => {
  if (!razorpayClient) {
    throw new AppError('Razorpay is not configured. Provide RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.', {
      status: 500,
      code: 'RAZORPAY_NOT_CONFIGURED'
    });
  }

  return razorpayClient;
};

const mapRazorpayStatus = (status: string | undefined): PaymentStatus => {
  switch (status) {
    case 'created':
    case 'authorized':
      return 'PENDING';
    case 'captured':
      return 'SUCCEEDED';
    case 'failed':
      return 'FAILED';
    case 'refunded':
      return 'REFUNDED';
    default:
      return 'PENDING';
  }
};

export class RazorpayAdapter implements PaymentAdapter {
  async createPayment(input: CreatePaymentAdapterInput): Promise<PaymentAdapterResponse> {
    const client = ensureClient();
    const order = await client.orders.create({
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      receipt: input.idempotencyKey,
      notes: input.metadata
    });

    return {
      providerPaymentId: order.id,
      status: mapRazorpayStatus(order.status),
      raw: order
    };
  }

  async confirmPayment(input: ConfirmPaymentAdapterInput): Promise<PaymentAdapterResponse> {
    const client = ensureClient();

    const amountToCapture = Number(input.metadata?.captureAmount ?? input.metadata?.amount);
    if (!Number.isFinite(amountToCapture)) {
      throw new AppError('Razorpay capture requires `metadata.captureAmount` (in the smallest currency unit).', {
        status: 400,
        code: 'RAZORPAY_CAPTURE_AMOUNT_REQUIRED'
      });
    }

    const captureCurrency = typeof input.metadata?.currency === 'string' ? input.metadata.currency : undefined;
    const captureResult = await (client.payments.capture as unknown as (
      paymentId: string,
      amount: number,
      currency?: string
    ) => Promise<unknown>)(input.providerPaymentId, amountToCapture, captureCurrency);

    const capture = captureResult as {
      id: string;
      status?: string;
      [key: string]: unknown;
    };

    return {
      providerPaymentId: capture.id,
      status: mapRazorpayStatus(capture.status),
      raw: capture
    };
  }

  async refundPayment(input: RefundPaymentAdapterInput): Promise<PaymentAdapterResponse> {
    const client = ensureClient();
    const refundResult = await client.payments.refund(input.providerPaymentId, {
      amount: input.amount,
      notes: input.metadata,
      speed: 'normal'
    });

    const refund = refundResult as unknown as {
      payment_id: string;
      status?: string;
      [key: string]: unknown;
    };

    return {
      providerPaymentId: refund.payment_id,
      status: mapRazorpayStatus(refund.status),
      raw: refund
    };
  }

  async constructWebhookEvent(payload: Buffer, headers: Record<string, string | string[] | undefined>): Promise<WebhookConstructionResult> {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      throw new AppError('Razorpay webhook secret is not configured.', {
        status: 500,
        code: 'RAZORPAY_WEBHOOK_SECRET_MISSING'
      });
    }

    const signatureHeader = headers['x-razorpay-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!signature) {
      throw new AppError('Razorpay webhook signature header is missing.', {
        status: 400,
        code: 'RAZORPAY_SIGNATURE_MISSING'
      });
    }

    const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');
    if (expected !== signature) {
      throw new AppError('Razorpay webhook signature verification failed.', {
        status: 400,
        code: 'RAZORPAY_WEBHOOK_VERIFICATION_FAILED'
      });
    }

    const event = JSON.parse(payload.toString('utf-8')) as {
      id: string;
      event: string;
      payload: { payment?: { entity?: { id?: string; status?: string; [key: string]: unknown } } };
    };

    const paymentEntity = event.payload?.payment?.entity;

    return {
      eventId: event.id,
      provider: 'razorpay',
      type: event.event,
      payload: paymentEntity
        ? {
            provider: 'razorpay',
            providerPaymentId: paymentEntity.id ?? 'unknown',
            status: mapRazorpayStatus(paymentEntity.status),
            metadata: paymentEntity
          }
        : null,
      rawEvent: event
    };
  }
}
