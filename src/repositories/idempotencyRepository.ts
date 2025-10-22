import type { IdempotencyKey } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const idempotencyRepository = {
  findByKey(key: string) {
    return prisma.idempotencyKey.findUnique({ where: { key } });
  },

  async create(options: {
    key: string;
    endpoint: string;
    method: string;
    requestHash: string;
    ttlSeconds: number;
  }): Promise<IdempotencyKey> {
    const expiresAt = new Date(Date.now() + options.ttlSeconds * 1000);

    return prisma.idempotencyKey.create({
      data: {
        key: options.key,
        endpoint: options.endpoint,
        method: options.method,
        requestHash: options.requestHash,
        expiresAt
      }
    });
  },

  async lock(id: string) {
    return prisma.idempotencyKey.update({
      where: { id },
      data: { lockedAt: new Date() }
    });
  },

  async storeResponse(id: string, response: { statusCode: number; body: unknown }) {
    return prisma.idempotencyKey.update({
      where: { id },
      data: {
        responseCode: response.statusCode,
        responseBody: response.body ? JSON.stringify(response.body) : null
      }
    });
  }
};
