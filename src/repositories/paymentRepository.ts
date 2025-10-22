import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { PaymentMetadata, PaymentProvider, PaymentStatus } from '../types/payments.ts';
import { AppError } from '../utils/errors.js';

export type PaymentWithRelations = Prisma.PaymentGetPayload<{
  include: { metadata: true };
}>;

type DbPaymentProvider = 'STRIPE' | 'PAYPAL' | 'RAZORPAY';
type DbPaymentStatus = 'PENDING' | 'REQUIRES_ACTION' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';

export const providerToPrisma: Record<PaymentProvider, DbPaymentProvider> = {
  stripe: 'STRIPE',
  paypal: 'PAYPAL',
  razorpay: 'RAZORPAY'
};

const statusMap: Record<PaymentStatus, DbPaymentStatus> = {
  PENDING: 'PENDING',
  REQUIRES_ACTION: 'REQUIRES_ACTION',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED'
};

const fromDbStatus: Record<DbPaymentStatus, PaymentStatus> = {
  PENDING: 'PENDING',
  REQUIRES_ACTION: 'REQUIRES_ACTION',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED'
};

export const toPaymentDTO = (payment: PaymentWithRelations) => {
  const metadataPairs = payment.metadata.map((meta) => [meta.key, meta.value] as const);
  const metadata: PaymentMetadata = Object.fromEntries(metadataPairs);

  return {
    id: payment.id,
    provider: payment.provider.toLowerCase() as PaymentProvider,
    providerPaymentId: payment.providerPaymentId,
    status: fromDbStatus[payment.status],
    amount: payment.amount,
    currency: payment.currency,
    metadata,
    description: payment.description ?? undefined,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
  } as const;
};

export const paymentRepository = {
  async create(options: {
    provider: PaymentProvider;
    providerPaymentId: string;
    amount: number;
    currency: string;
    status: PaymentStatus;
    metadata?: PaymentMetadata;
    description?: string;
    idempotencyKeyId?: string;
  }): Promise<PaymentWithRelations> {
    const metadataEntries = Object.entries(options.metadata ?? {});

    return prisma.payment.create({
      data: {
        provider: providerToPrisma[options.provider],
        providerPaymentId: options.providerPaymentId,
        amount: options.amount,
        currency: options.currency.toUpperCase(),
        status: statusMap[options.status],
        description: options.description,
        idempotencyKeyId: options.idempotencyKeyId,
        metadata: {
          create: metadataEntries.map(([key, value]) => ({ key, value }))
        }
      },
      include: { metadata: true }
    });
  },

  async updateStatus(paymentId: string, updates: {
    status: PaymentStatus;
    providerPaymentId?: string;
    metadata?: PaymentMetadata;
  }): Promise<PaymentWithRelations> {
    const metadataEntries = Object.entries(updates.metadata ?? {});

    return prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: statusMap[updates.status],
        providerPaymentId: updates.providerPaymentId,
        metadata: metadataEntries.length
          ? {
              upsert: metadataEntries.map(([key, value]) => ({
                where: {
                  paymentId_key: {
                    paymentId,
                    key
                  }
                },
                create: { key, value },
                update: { value }
              }))
            }
          : undefined
      },
      include: { metadata: true }
    });
  },

  async findById(id: string): Promise<PaymentWithRelations | null> {
    return prisma.payment.findUnique({
      where: { id },
      include: { metadata: true }
    });
  },

  async findByProviderPaymentId(provider: PaymentProvider, providerPaymentId: string): Promise<PaymentWithRelations | null> {
    return prisma.payment.findUnique({
      where: {
        provider_providerPaymentId: {
          provider: providerToPrisma[provider],
          providerPaymentId
        }
      },
      include: { metadata: true }
    });
  }
};

export const assertPaymentExists = async (id: string) => {
  const payment = await paymentRepository.findById(id);
  if (!payment) {
    throw new AppError(`Payment ${id} was not found.`, {
      status: 404,
      code: 'PAYMENT_NOT_FOUND'
    });
  }

  return payment;
};
