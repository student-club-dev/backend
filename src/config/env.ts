import { z } from 'zod';

/**
 * Environment schema — validated once at boot. Fail fast on misconfiguration.
 * DATABASE_URL / SMS / OAuth are optional at this stage (M0) and become required
 * as the modules that need them land.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().min(1).default('v1'),

  DATABASE_URL: z.string().url().optional(),

  JWT_ACCESS_SECRET: z.string().min(1).default('change-me-access'),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  JWT_REFRESH_SECRET: z.string().min(1).default('change-me-refresh'),
  JWT_REFRESH_TTL: z.string().min(1).default('30d'),

  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  APPLE_OAUTH_CLIENT_ID: z.string().optional(),

  SMS_PROVIDER: z.string().default('eskiz'),
  SMS_ESKIZ_EMAIL: z.string().optional(),
  SMS_ESKIZ_PASSWORD: z.string().optional(),
  SMS_ESKIZ_FROM: z.string().default('4546'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  REDIS_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
