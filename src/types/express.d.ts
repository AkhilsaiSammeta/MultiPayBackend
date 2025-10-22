import type { PaymentProvider } from './payments.js';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }

    interface Locals {
      idempotencyKey?: string;
      provider?: PaymentProvider;
    }
  }
}

export {};
