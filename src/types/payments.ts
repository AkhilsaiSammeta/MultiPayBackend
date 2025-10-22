export const paymentProviders = ['stripe', 'paypal', 'razorpay'] as const;
export type PaymentProvider = (typeof paymentProviders)[number];

export const paymentStatuses = ['PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export type PaymentMetadata = Record<string, string>;

export interface CreatePaymentRequest {
  provider: PaymentProvider;
  amount: number;
  currency: string;
  description?: string;
  metadata?: PaymentMetadata;
  captureMethod?: 'automatic' | 'manual';
}

export interface ConfirmPaymentRequest {
  paymentId: string;
  provider: PaymentProvider;
  metadata?: PaymentMetadata;
}

export interface RefundPaymentRequest {
  paymentId: string;
  provider: PaymentProvider;
  amount?: number;
  metadata?: PaymentMetadata;
  reason?: string;
}

export interface PaymentDTO {
  id: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  metadata: PaymentMetadata;
  createdAt: Date;
  updatedAt: Date;
}
