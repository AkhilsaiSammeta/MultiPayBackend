import type { PaymentProvider, PaymentStatus } from './payments.js';

export interface WebhookEvent {
  id: string;
  provider: PaymentProvider;
  type: string;
  payload: unknown;
  signature: string | null;
  receivedAt: Date;
}

export interface WebhookPaymentUpdate {
  provider: PaymentProvider;
  providerPaymentId: string;
  status: PaymentStatus;
  metadata?: Record<string, unknown>;
}
