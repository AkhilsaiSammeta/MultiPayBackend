import type { ErrorRequestHandler } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError, isAppError } from '../utils/errors.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const appError = isAppError(err)
    ? err
    : new AppError('Internal Server Error', {
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        cause: err instanceof Error ? err : undefined
      });

  logger.error({ err, path: req.path, method: req.method }, appError.message);

  res.status(appError.status).json({
    error: {
      message: appError.message,
      code: appError.code,
      details: appError.details,
      ...(env.NODE_ENV !== 'production' && appError.cause instanceof Error
        ? { stack: appError.cause.stack }
        : {})
    }
  });

  next();
};
