import { z } from 'zod';

/**
 * Environment schema — validated once at boot. Fail fast on misconfiguration.
 * DATABASE_URL / SMS / OAuth are optional at this stage (M0) and become required
 * as the modules that need them land.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    API_PREFIX: z.string().min(1).default('v1'),

    CORS_ORIGINS: z.string().min(1).default('http://localhost:3000'),

    LOG_PRETTY: z.enum(['true', 'false']).default('false'),

    SWAGGER_PATH: z.string().min(1).default('docs'),
    SWAGGER_USER: z.string().min(1).default('admin'),
    SWAGGER_PASSWORD: z.string().optional(),

    DATABASE_URL: z.string().url().optional(),

    JWT_ACCESS_SECRET: z.string().min(1).default('change-me-access'),
    JWT_ACCESS_TTL: z.string().min(1).default('15m'),
    JWT_REFRESH_SECRET: z.string().min(1).default('change-me-refresh'),
    JWT_REFRESH_TTL: z.string().min(1).default('30d'),

    GOOGLE_ALLOWED_CLIENT_IDS: z.string().optional(),
    APPLE_ALLOWED_CLIENT_IDS: z.string().optional(),

    SMS_PROVIDER: z.enum(['dev', 'eskiz']).default('dev'),
    ESKIZ_EMAIL: z.string().optional(),
    ESKIZ_PASSWORD: z.string().optional(),
    ESKIZ_FROM: z.string().default('4546'),
    ESKIZ_BASE_URL: z.string().url().default('https://notify.eskiz.uz'),

    OTP_CHANNEL: z.enum(['dev', 'telegram', 'sms']).default('dev'),
    TELEGRAM_GATEWAY_TOKEN: z.string().optional(),
    TELEGRAM_GATEWAY_BASE_URL: z.string().url().default('https://gatewayapi.telegram.org'),

    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
    OTP_MAX_RESEND: z.coerce.number().int().positive().default(5),

    OTP_DEV_CODE: z.string().optional(),

    REDIS_URL: z.string().optional(),

    GEOCODER_PROVIDER: z.enum(['dev', 'yandex']).default('dev'),
    YANDEX_GEOCODER_API_KEY: z.string().optional(),
    YANDEX_GEOCODER_BASE_URL: z.string().url().default('https://geocode-maps.yandex.ru/1.x'),

    UPLOADS_DIR: z.string().min(1).default('./uploads'),
    PUBLIC_MEDIA_BASE_URL: z.string().url().default('http://localhost:3000/uploads'),

    // Chat media. Unlike listing images these are private: they are served through
    // `GET /v1/media/{id}/raw`, which checks conversation membership, never over the static path.
    CHAT_MEDIA_DIR: z.string().min(1).default('./uploads/chat'),
    // Per-student upload quota (abuse limits, chat spec §9).
    CHAT_UPLOADS_PER_MINUTE: z.coerce.number().int().positive().default(20),
    CHAT_UPLOAD_BYTES_PER_DAY: z.coerce
      .number()
      .int()
      .positive()
      .default(500 * 1024 * 1024),
    // Transcoding binaries. Present in the Docker image; override for a non-standard local install.
    FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
    FFPROBE_PATH: z.string().min(1).default('ffprobe'),

    // GIF search proxy. The key never leaves the server — that is the entire point of proxying
    // instead of shipping it in the app. Absent ⇒ the GIF endpoints answer 503.
    TENOR_API_KEY: z.string().optional(),
    TENOR_BASE_URL: z.string().url().default('https://tenor.googleapis.com/v2'),

    ADMIN_EMAIL: z.string().optional(),
    ADMIN_PASSWORD_HASH: z.string().optional(),
    MODERATOR_EMAIL: z.string().optional(),
    MODERATOR_PASSWORD_HASH: z.string().optional(),
  })
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
