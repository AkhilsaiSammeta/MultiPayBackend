import paypal from '@paypal/checkout-server-sdk';
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

const environment = (() => {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    return null;
  }

  const ctor = env.PAYPAL_ENVIRONMENT === 'live' ? paypal.core.LiveEnvironment : paypal.core.SandboxEnvironment;
  return new ctor(env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET);
})();

const ensureClient = () => {
  if (!environment) {
    throw new AppError('PayPal is not configured. Provide PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.', {
      status: 500,
      code: 'PAYPAL_NOT_CONFIGURED'
    });
  }

  return new paypal.core.PayPalHttpClient(environment);
};

const mapPayPalStatus = (status: string | undefined): PaymentStatus => {
  switch (status) {
    case 'COMPLETED':
    case 'CAPTURED':
      return 'SUCCEEDED';
    case 'PENDING':
    case 'APPROVED':
    case 'CREATED':
      return 'PENDING';
    case 'REFUNDED':
      return 'REFUNDED';
    case 'VOIDED':
    case 'DECLINED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
};

const MINOR_UNIT_SCALE = 100;

const asCurrencyValue = (amount: number): string => {
  return (amount / MINOR_UNIT_SCALE).toFixed(2);
};

export class PayPalAdapter implements PaymentAdapter {
  async createPayment(input: CreatePaymentAdapterInput): Promise<PaymentAdapterResponse> {
    const client = ensureClient();
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.headers['PayPal-Request-Id'] = input.idempotencyKey;
    request.requestBody({
      intent: input.captureMethod === 'manual' ? 'AUTHORIZE' : 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: input.currency.toUpperCase(),
            value: asCurrencyValue(input.amount)
          },
          description: input.description,
          custom_id: input.metadata?.custom_id,
          invoice_id: input.metadata?.invoice_id
        }
      ]
    });

    const response = await client.execute(request);
    const order = response.result;

    return {
      providerPaymentId: order.id,
      status: mapPayPalStatus(order.status),
      raw: order
    };
  }

  async confirmPayment(input: ConfirmPaymentAdapterInput): Promise<PaymentAdapterResponse> {
    const client = ensureClient();
    const request = new paypal.orders.OrdersCaptureRequest(input.providerPaymentId);
    request.headers['PayPal-Request-Id'] = input.idempotencyKey ?? input.providerPaymentId;
    request.requestBody({});

    const response = await client.execute(request);
    const capture = response.result;
    const captureId =
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? capture.id ?? input.providerPaymentId;

    return {
      providerPaymentId: captureId,
      status: mapPayPalStatus(capture.purchase_units?.[0]?.payments?.captures?.[0]?.status ?? capture.status),
      raw: capture
    };
  }

  async refundPayment(input: RefundPaymentAdapterInput): Promise<PaymentAdapterResponse> {
    const client = ensureClient();

    const captureId = input.providerPaymentId;
    if (!captureId) {
      throw new AppError('PayPal refund requires a capture identifier.', {
        status: 400,
        code: 'PAYPAL_CAPTURE_ID_REQUIRED'
      });
    }

    const request = new paypal.payments.CapturesRefundRequest(captureId);
    request.headers['PayPal-Request-Id'] = input.idempotencyKey ?? captureId;
    request.requestBody({
      amount: input.amount
        ? {
            currency_code: input.metadata?.currency ?? 'USD',
            value: asCurrencyValue(input.amount)
          }
        : undefined,
      invoice_id: input.metadata?.invoice_id,
      note_to_payer: input.reason
    });

    const response = await client.execute(request);
    const refund = response.result;

    return {
      providerPaymentId: refund.id ?? captureId,
      status: mapPayPalStatus(refund.status),
      raw: refund
    };
  }

  async constructWebhookEvent(payload: Buffer, headers: Record<string, string | string[] | undefined>): Promise<WebhookConstructionResult> {
    if (!env.PAYPAL_WEBHOOK_ID) {
      throw new AppError('PayPal webhook ID is not configured.', {
        status: 500,
        code: 'PAYPAL_WEBHOOK_ID_MISSING'
      });
    }

    const requiredHeaders = [
      'paypal-transmission-id',
      'paypal-transmission-time',
      'paypal-cert-url',
      'paypal-auth-algo',
      'paypal-transmission-sig'
    ] as const;

    const headerValues = Object.fromEntries(
      requiredHeaders.map((key) => {
        const value = headers[key];
        return [key, Array.isArray(value) ? value[0] : value];
      })
    ) as Record<(typeof requiredHeaders)[number], string | undefined>;

    if (Object.values(headerValues).some((value) => !value)) {
      throw new AppError('PayPal webhook headers are incomplete.', {
        status: 400,
        code: 'PAYPAL_WEBHOOK_HEADERS_MISSING'
      });
    }

    const client = ensureClient();
    const verifyRequest = new paypal.notifications.VerifyWebhookSignatureRequest();
    verifyRequest.requestBody({
      auth_algo: headerValues['paypal-auth-algo'],
      cert_url: headerValues['paypal-cert-url'],
      transmission_id: headerValues['paypal-transmission-id'],
      transmission_sig: headerValues['paypal-transmission-sig'],
      transmission_time: headerValues['paypal-transmission-time'],
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(payload.toString('utf-8'))
    });

    const verification = await client.execute(verifyRequest);
    if (verification.result.verification_status !== 'SUCCESS') {
      throw new AppError('PayPal webhook signature verification failed.', {
        status: 400,
        code: 'PAYPAL_WEBHOOK_VERIFICATION_FAILED'
      });
    }

    const event = verification.result.webhook_event ?? JSON.parse(payload.toString('utf-8'));

    let payloadUpdate: WebhookConstructionResult['payload'] = null;
    const eventResource = event.resource as Record<string, unknown> | undefined;

    if (eventResource && 'id' in eventResource) {
      payloadUpdate = {
        provider: 'paypal',
        providerPaymentId: String(eventResource.id),
        status: mapPayPalStatus(eventResource?.status as string | undefined),
        metadata: eventResource
      };
    }

    return {
      eventId: event.id ?? headerValues['paypal-transmission-id'],
      provider: 'paypal',
      type: event.event_type ?? 'unknown',
      payload: payloadUpdate,
      rawEvent: event
    };
  }
}
