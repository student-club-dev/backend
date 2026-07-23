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

  // Pretty, human-readable logs via pino-pretty. LOCAL DEV ONLY: pino-pretty is a devDependency
  // and is absent from the production Docker image, so this must stay off there (any deployment,
  // including dev-mode containers, emits structured JSON). Off by default. See app.module.ts.
  LOG_PRETTY: z.enum(['true', 'false']).default('false'),

  // Swagger docs. Served at `/${SWAGGER_PATH}` with the JSON at `/${SWAGGER_PATH}/json`. Protected by
  // HTTP Basic auth whenever SWAGGER_PASSWORD is set. In production the docs are NOT exposed at all
  // unless SWAGGER_PASSWORD is set — so a misconfigured prod never leaks the API surface unprotected.
  SWAGGER_PATH: z.string().min(1).default('docs'),
  SWAGGER_USER: z.string().min(1).default('admin'),
  SWAGGER_PASSWORD: z.string().optional(),

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

  // Geocoding provider: `dev` makes no external call (returns no results), `yandex` proxies Yandex
  // Geocoder (key never reaches the client). Env-only switch, mirrors SMS_PROVIDER.
  GEOCODER_PROVIDER: z.enum(['dev', 'yandex']).default('dev'),
  YANDEX_GEOCODER_API_KEY: z.string().optional(),
  YANDEX_GEOCODER_BASE_URL: z.string().url().default('https://geocode-maps.yandex.ru/1.x'),

  // Media storage (local disk). Prod overrides via .env, e.g. UPLOADS_DIR=/var/www/studentclub/uploads
  // and PUBLIC_MEDIA_BASE_URL=https://api.studentclub.uz/uploads. Switching to S3/R2 is a storage
  // adapter swap, not a config-shape change.
  UPLOADS_DIR: z.string().min(1).default('./uploads'),
  // Baked into every image URL served to the mobile clients — MUST be a valid URL. `.url()` rejects
  // a placeholder such as `https://<sening-domening>/uploads`; the prod localhost guard is below.
  PUBLIC_MEDIA_BASE_URL: z.string().url().default('http://localhost:3000/uploads'),

  // Placeholder admin credential for the admin-only endpoints (business-type CRUD). Compared
  // against the `X-Admin-Key` header by AdminGuard. Unset → every admin request is rejected.
  ADMIN_API_KEY: z.string().optional(),
})
  // Prod must serve media from a public URL, never the localhost dev default — otherwise every image
  // URL handed to the mobile clients is unreachable. Mirrors the SMS/geocoder "no dev default in
  // prod" guards. (`.url()` above already rejects a non-URL placeholder.)
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      const host = new URL(env.PUBLIC_MEDIA_BASE_URL).hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PUBLIC_MEDIA_BASE_URL'],
          message:
            'must be a public URL in production, not localhost — e.g. https://api.studentclub.uz/uploads',
        });
      }
    }
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
