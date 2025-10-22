import { getPaymentAdapter } from '../adapters/index.js';
import type {
  ConfirmPaymentRequest,
  CreatePaymentRequest,
  PaymentDTO,
  PaymentMetadata,
  PaymentProvider,
  PaymentStatus,
  RefundPaymentRequest
} from '../types/payments.js';
import type { WebhookConstructionResult } from '../adapters/paymentAdapter.js';
import { IdempotencyService } from './idempotencyService.js';
import { assertPaymentExists, paymentRepository, providerToPrisma, toPaymentDTO } from '../repositories/paymentRepository.js';
import { AppError } from '../utils/errors.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../config/logger.js';

export interface CreatePaymentServiceResult {
  payment: PaymentDTO;
  providerResponse: unknown;
}

export interface ConfirmPaymentServiceResult {
  payment: PaymentDTO;
  providerResponse: unknown;
}

export interface RefundPaymentServiceResult {
  payment: PaymentDTO;
  providerResponse: unknown;
}

export class PaymentService {
  constructor(private readonly idempotencyService: IdempotencyService = new IdempotencyService()) {}

  private ensureProvider(paymentProvider: PaymentProvider) {
    return getPaymentAdapter(paymentProvider);
  }

  async createPayment(options: {
    payload: CreatePaymentRequest;
    idempotencyKey: string;
    requestBody: unknown;
  }): Promise<{ result: CreatePaymentServiceResult; cached: boolean; statusCode: number }> {
    const adapter = this.ensureProvider(options.payload.provider);

    const { cached, result } = await this.idempotencyService.execute<CreatePaymentServiceResult>({
      key: options.idempotencyKey,
      endpoint: '/payments',
      method: 'POST',
      requestBody: options.requestBody,
      handler: async ({ keyRecordId }) => {
        const adapterResponse = await adapter.createPayment({
          amount: options.payload.amount,
          currency: options.payload.currency,
          description: options.payload.description,
          metadata: options.payload.metadata,
          captureMethod: options.payload.captureMethod,
          idempotencyKey: options.idempotencyKey
        });

        const payment = await paymentRepository.create({
          provider: options.payload.provider,
          providerPaymentId: adapterResponse.providerPaymentId,
          amount: options.payload.amount,
          currency: options.payload.currency,
          status: adapterResponse.status,
          metadata: options.payload.metadata,
          description: options.payload.description,
          idempotencyKeyId: keyRecordId
        });

        return {
          statusCode: 201,
          body: {
            payment: toPaymentDTO(payment),
            providerResponse: adapterResponse.raw
          }
        };
      }
    });

    return {
      cached,
      statusCode: result.statusCode,
      result: result.body as CreatePaymentServiceResult
    };
  }

  async confirmPayment(options: {
    paymentId: string;
    payload: ConfirmPaymentRequest;
    idempotencyKey: string;
    requestBody: unknown;
  }): Promise<{ result: ConfirmPaymentServiceResult; cached: boolean; statusCode: number }> {
    const dbPayment = await assertPaymentExists(options.paymentId);

    if (dbPayment.provider.toLowerCase() !== options.payload.provider) {
      throw new AppError('Payment provider mismatch.', {
        status: 409,
        code: 'PAYMENT_PROVIDER_MISMATCH'
      });
    }

    const adapter = this.ensureProvider(options.payload.provider);

    const { cached, result } = await this.idempotencyService.execute<ConfirmPaymentServiceResult>({
      key: options.idempotencyKey,
      endpoint: `/payments/${options.paymentId}/confirm`,
      method: 'POST',
      requestBody: options.requestBody,
      handler: async () => {
        const adapterResponse = await adapter.confirmPayment({
          providerPaymentId: dbPayment.providerPaymentId,
          metadata: options.payload.metadata,
          idempotencyKey: options.idempotencyKey
        });

        const updated = await paymentRepository.updateStatus(dbPayment.id, {
          status: adapterResponse.status,
          providerPaymentId: adapterResponse.providerPaymentId,
          metadata: options.payload.metadata as PaymentMetadata | undefined
        });

        return {
          statusCode: 200,
          body: {
            payment: toPaymentDTO(updated),
            providerResponse: adapterResponse.raw
          }
        };
      }
    });

    return {
      cached,
      statusCode: result.statusCode,
      result: result.body as ConfirmPaymentServiceResult
    };
  }

  async refundPayment(options: {
    paymentId: string;
    payload: RefundPaymentRequest;
    idempotencyKey: string;
    requestBody: unknown;
  }): Promise<{ result: RefundPaymentServiceResult; cached: boolean; statusCode: number }> {
    const dbPayment = await assertPaymentExists(options.paymentId);

    if (dbPayment.provider.toLowerCase() !== options.payload.provider) {
      throw new AppError('Payment provider mismatch.', {
        status: 409,
        code: 'PAYMENT_PROVIDER_MISMATCH'
      });
    }

    const adapter = this.ensureProvider(options.payload.provider);

    const { cached, result } = await this.idempotencyService.execute<RefundPaymentServiceResult>({
      key: options.idempotencyKey,
      endpoint: `/payments/${options.paymentId}/refund`,
      method: 'POST',
      requestBody: options.requestBody,
      handler: async () => {
        const adapterResponse = await adapter.refundPayment({
          providerPaymentId: dbPayment.providerPaymentId,
          amount: options.payload.amount,
          metadata: options.payload.metadata,
          reason: options.payload.reason,
          idempotencyKey: options.idempotencyKey
        });

        const updated = await paymentRepository.updateStatus(dbPayment.id, {
          status: adapterResponse.status,
          metadata: options.payload.metadata as PaymentMetadata | undefined
        });

        return {
          statusCode: 200,
          body: {
            payment: toPaymentDTO(updated),
            providerResponse: adapterResponse.raw
          }
        };
      }
    });

    return {
      cached,
      statusCode: result.statusCode,
      result: result.body as RefundPaymentServiceResult
    };
  }

  async processWebhook(options: {
    provider: PaymentProvider;
    payload: Buffer;
    headers: Record<string, string | string[] | undefined>;
    signature?: string | null;
  }): Promise<WebhookConstructionResult> {
    const adapter = this.ensureProvider(options.provider);
    const event = await adapter.constructWebhookEvent(options.payload, options.headers);

    await prisma.webhookEvent.create({
      data: {
        provider: providerToPrisma[options.provider],
        eventId: event.eventId,
        eventType: event.type,
        payload: event.rawEvent as object,
        signature: options.signature ?? null
      }
    });

    if (event.payload) {
      const payment = await paymentRepository.findByProviderPaymentId(event.payload.provider, event.payload.providerPaymentId);
      if (payment) {
        await paymentRepository.updateStatus(payment.id, {
          status: event.payload.status as PaymentStatus,
          metadata: event.payload.metadata as PaymentMetadata
        });
      } else {
        logger.warn({ provider: options.provider, providerPaymentId: event.payload.providerPaymentId }, 'Received webhook for unknown payment.');
      }
    }

    return event;
  }
}
