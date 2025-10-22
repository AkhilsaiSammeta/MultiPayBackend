import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PaymentService } from '../services/paymentService.js';
import { asyncHandler } from '../utils/http.js';
import { AppError } from '../utils/errors.js';
import { paymentProviders } from '../types/payments.js';

const router = Router();
const paymentService = new PaymentService();

const providerSchema = z.enum(paymentProviders);

router.post(
  '/:provider',
  asyncHandler(async (req: Request, res: Response) => {
    const providerResult = providerSchema.safeParse(req.params.provider as (typeof paymentProviders)[number]);
    if (!providerResult.success) {
      throw new AppError('Unsupported provider for webhook.', {
        status: 400,
        code: 'UNSUPPORTED_PROVIDER'
      });
    }

    if (!req.rawBody) {
      throw new AppError('Raw body is required to validate webhook signatures.', {
        status: 400,
        code: 'WEBHOOK_RAW_BODY_MISSING'
      });
    }

    const event = await paymentService.processWebhook({
      provider: providerResult.data,
      payload: req.rawBody,
      headers: req.headers,
      signature: req.get('stripe-signature') ?? req.get('x-razorpay-signature')
    });

    res.status(202).json({ received: true, event: { id: event.eventId, type: event.type } });
  })
);

export const webhookRouter = router;
