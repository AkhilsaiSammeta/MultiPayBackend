import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PaymentService } from '../services/paymentService.js';
import { asyncHandler } from '../utils/http.js';
import { requireIdempotencyKey } from '../middleware/requireIdempotencyKey.js';
import { AppError } from '../utils/errors.js';

const router = Router();
const paymentService = new PaymentService();

const metadataSchema = z.record(z.string(), z.string()).optional();

const createPaymentSchema = z.object({
  provider: z.enum(['stripe', 'paypal', 'razorpay']),
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(10),
  description: z.string().optional(),
  metadata: metadataSchema,
  captureMethod: z.enum(['automatic', 'manual']).default('automatic')
});

const confirmPaymentSchema = z.object({
  provider: z.enum(['stripe', 'paypal', 'razorpay']),
  paymentId: z.string().min(1),
  metadata: metadataSchema
});

const refundPaymentSchema = z.object({
  provider: z.enum(['stripe', 'paypal', 'razorpay']),
  amount: z.number().int().positive().optional(),
  metadata: metadataSchema,
  reason: z.string().optional()
});

router.post(
  '/',
  requireIdempotencyKey,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Invalid payment payload.', {
        status: 422,
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten().fieldErrors
      });
    }

    const { result, cached, statusCode } = await paymentService.createPayment({
      payload: parsed.data,
      idempotencyKey: res.locals.idempotencyKey as string,
      requestBody: req.body
    });

    res.status(cached ? 200 : statusCode).json({
      data: result.payment,
      providerResponse: result.providerResponse,
      cached
    });
  })
);

router.post(
  '/:paymentId/confirm',
  requireIdempotencyKey,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = confirmPaymentSchema.safeParse({ ...req.body, paymentId: req.params.paymentId });
    if (!parsed.success) {
      throw new AppError('Invalid confirmation payload.', {
        status: 422,
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten().fieldErrors
      });
    }

    const { result, cached, statusCode } = await paymentService.confirmPayment({
      paymentId: parsed.data.paymentId,
      payload: parsed.data,
      idempotencyKey: res.locals.idempotencyKey as string,
      requestBody: req.body
    });

    res.status(cached ? 200 : statusCode).json({
      data: result.payment,
      providerResponse: result.providerResponse,
      cached
    });
  })
);

router.post(
  '/:paymentId/refund',
  requireIdempotencyKey,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = refundPaymentSchema.safeParse({ ...req.body, paymentId: req.params.paymentId, provider: req.body?.provider });
    if (!parsed.success) {
      throw new AppError('Invalid refund payload.', {
        status: 422,
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten().fieldErrors
      });
    }

    const { result, cached, statusCode } = await paymentService.refundPayment({
      paymentId: req.params.paymentId,
      payload: {
        provider: parsed.data.provider,
        paymentId: req.params.paymentId,
        amount: parsed.data.amount,
        metadata: parsed.data.metadata,
        reason: parsed.data.reason
      },
      idempotencyKey: res.locals.idempotencyKey as string,
      requestBody: req.body
    });

    res.status(cached ? 200 : statusCode).json({
      data: result.payment,
      providerResponse: result.providerResponse,
      cached
    });
  })
);

export const paymentsRouter = router;
