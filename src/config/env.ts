import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

if (!process.env.SKIP_ENV_LOAD) {
  loadEnv();
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_ENVIRONMENT: z.enum(['sandbox', 'live']).default('sandbox'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  IDEMPOTENCY_LOCK_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
  IDEMPOTENCY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86400)
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
