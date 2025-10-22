import type { PaymentMetadata, PaymentProvider, PaymentStatus } from '../types/payments.js';
import type { WebhookPaymentUpdate } from '../types/webhooks.js';

export interface CreatePaymentAdapterInput {
  amount: number;
  currency: string;
  description?: string;
  metadata?: PaymentMetadata;
  captureMethod?: 'automatic' | 'manual';
  idempotencyKey: string;
}

export interface ConfirmPaymentAdapterInput {
  providerPaymentId: string;
  metadata?: PaymentMetadata;
  idempotencyKey?: string;
}

export interface RefundPaymentAdapterInput {
  providerPaymentId: string;
  amount?: number;
  metadata?: PaymentMetadata;
  reason?: string;
  idempotencyKey?: string;
}

export interface PaymentAdapterResponse {
  providerPaymentId: string;
  status: PaymentStatus;
  raw: unknown;
}

export interface WebhookConstructionResult {
  eventId: string;
  provider: PaymentProvider;
  type: string;
  payload: WebhookPaymentUpdate | null;
  rawEvent: unknown;
}

export interface PaymentAdapter {
  createPayment(input: CreatePaymentAdapterInput): Promise<PaymentAdapterResponse>;
  confirmPayment(input: ConfirmPaymentAdapterInput): Promise<PaymentAdapterResponse>;
  refundPayment(input: RefundPaymentAdapterInput): Promise<PaymentAdapterResponse>;
  constructWebhookEvent(payload: Buffer, headers: Record<string, string | string[] | undefined>): Promise<WebhookConstructionResult>;
}
