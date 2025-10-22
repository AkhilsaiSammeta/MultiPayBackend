import type { RequestHandler } from 'express';
import { AppError } from '../utils/errors.js';

const IDEMPOTENCY_HEADER = 'idempotency-key';

export const requireIdempotencyKey: RequestHandler = (req, res, next) => {
  const key = req.headers[IDEMPOTENCY_HEADER] ?? req.headers[IDEMPOTENCY_HEADER.toUpperCase()];

  if (!key || (Array.isArray(key) ? key[0] : key).trim().length === 0) {
    return next(
      new AppError('Idempotency-Key header is required for this endpoint.', {
        status: 400,
        code: 'IDEMPOTENCY_KEY_REQUIRED'
      })
    );
  }

  const normalized = Array.isArray(key) ? key[0] : key;
  res.locals.idempotencyKey = normalized;
  return next();
};
