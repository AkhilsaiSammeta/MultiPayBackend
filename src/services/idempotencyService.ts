import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { idempotencyRepository } from '../repositories/idempotencyRepository.js';
import { AppError } from '../utils/errors.js';

export interface IdempotencyHandlerResult<T> {
  statusCode: number;
  body: T;
}

export class IdempotencyService {
  private hashPayload(payload: unknown): string {
    const serialized = JSON.stringify(payload ?? {});
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  async execute<T>(options: {
    key: string;
    endpoint: string;
    method: string;
    requestBody: unknown;
    handler: (context: { keyRecordId: string }) => Promise<IdempotencyHandlerResult<T>>;
  }): Promise<{ cached: boolean; result: IdempotencyHandlerResult<T>; keyRecordId: string }> {
    const requestHash = this.hashPayload(options.requestBody);

    const existing = await idempotencyRepository.findByKey(options.key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError('Idempotency key already used with different payload.', {
          status: 409,
          code: 'IDEMPOTENCY_KEY_MISMATCH'
        });
      }

      if (existing.responseBody && existing.responseCode) {
        let cachedBody: T;
        try {
          cachedBody = JSON.parse(existing.responseBody) as T;
        } catch {
          cachedBody = existing.responseBody as unknown as T;
        }

        return {
          cached: true,
          keyRecordId: existing.id,
          result: {
            statusCode: existing.responseCode,
            body: cachedBody
          }
        };
      }

      const lockAgeMs = existing.lockedAt ? Date.now() - existing.lockedAt.getTime() : Number.POSITIVE_INFINITY;
      if (lockAgeMs < env.IDEMPOTENCY_LOCK_TIMEOUT_SECONDS * 1000) {
        throw new AppError('Another request is currently processing this idempotency key.', {
          status: 425,
          code: 'IDEMPOTENCY_KEY_LOCKED'
        });
      }
    }

    const record =
      existing ??
      (await idempotencyRepository.create({
        key: options.key,
        endpoint: options.endpoint,
        method: options.method,
        requestHash,
        ttlSeconds: env.IDEMPOTENCY_CACHE_TTL_SECONDS
      }));

    await idempotencyRepository.lock(record.id);

    const result = await options.handler({ keyRecordId: record.id });

    await idempotencyRepository.storeResponse(record.id, {
      statusCode: result.statusCode,
      body: result.body
    });

    return { cached: false, result, keyRecordId: record.id };
  }
}
