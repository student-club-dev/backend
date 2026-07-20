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

  // Comma-separated Google OAuth client ids (Business/Student × Android/iOS/web).
  GOOGLE_ALLOWED_CLIENT_IDS: z.string().optional(),
  APPLE_OAUTH_CLIENT_ID: z.string().optional(),

  // SMS provider: `dev` logs the code (never in prod), `eskiz` sends real SMS. Env-only switch.
  SMS_PROVIDER: z.enum(['dev', 'eskiz']).default('dev'),
  ESKIZ_EMAIL: z.string().optional(),
  ESKIZ_PASSWORD: z.string().optional(),
  ESKIZ_FROM: z.string().default('4546'),
  ESKIZ_BASE_URL: z.string().url().default('https://notify.eskiz.uz'),

  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  OTP_MAX_RESEND: z.coerce.number().int().positive().default(5),
  // Fixed dev OTP code — honoured only when NODE_ENV !== 'production' (defaults to 111111 in code).
  OTP_DEV_CODE: z.string().optional(),

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
