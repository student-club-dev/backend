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

    // Push delivery. `dev` only writes a log line, so it is reported at ERROR level in production —
    // otherwise every offline notification would be dropped silently. `fcm` selects the real pair:
    // FCM for Android/web, APNs directly for iOS.
    PUSH_PROVIDER: z.enum(['dev', 'fcm']).default('dev'),
    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    FCM_PRIVATE_KEY: z.string().optional(),

    // Apple Push Notification service — iOS only, no Firebase in the path. The iOS app carries no
    // Firebase SDK and registers its raw APNs token, which FCM cannot address; that mismatch is why
    // iPhones received nothing while Android worked.
    // APNS_TOPIC is the iOS **bundle id** and differs from the Android applicationId — a wrong one
    // answers `400 BadTopic`. APNS_ENV picks Apple's host: a token from a Xcode debug build only
    // works against `sandbox`, a TestFlight/App Store one only against `production`.
    APNS_KEY_P8: z.string().optional(),
    APNS_KEY_ID: z.string().optional(),
    APNS_TEAM_ID: z.string().optional(),
    APNS_TOPIC: z.string().optional(),
    APNS_ENV: z.enum(['production', 'sandbox']).default('production'),

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
    // instead of shipping it in the app. No key ⇒ the GIF endpoints answer 503 and nothing else
    // breaks.
    //
    // KLIPY is the catalogue behind `GET /v1/gifs/search`. Tenor's API shut down on 30 June 2026
    // and Giphy caps a free key at 100 calls/hour, so KLIPY's free unlimited tier is the only one
    // that can actually serve production.
    // ⚠️ The key travels in the request *path*, so it must never reach a log line or an error.
    KLIPY_API_KEY: z.string().optional(),
    KLIPY_BASE_URL: z.string().url().default('https://api.klipy.com/api/v1'),

    ADMIN_EMAIL: z.string().optional(),
    ADMIN_PASSWORD_HASH: z.string().optional(),
    MODERATOR_EMAIL: z.string().optional(),
    MODERATOR_PASSWORD_HASH: z.string().optional(),

    // TURN (coturn `use-auth-secret` REST scheme) for 1:1 calls. Left optional here — a missing
    // value must fail loudly in production when CALLS_ENABLED=true (see superRefine below), not
    // silently boot with a guessable default the way JWT_ACCESS_SECRET currently does. `.min(1)`
    // matters as much as `.optional()`: `.env.example` ships these blank, and a blank string is
    // still "defined".
    TURN_HOST: z.string().min(1).optional(),
    TURN_STATIC_SECRET: z.string().min(1).optional(),
    TURN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

    // Master switch for the calls feature. Defaults OFF: the calls code ships ahead of a deployed
    // coturn server and the mobile-client prerequisites it depends on. While false, TURN
    // configuration is NOT required to boot in any environment — `GET /v1/calls/ice-servers`
    // simply keeps answering its existing 503. Flip to true only once coturn is up; production
    // then requires TURN_HOST/TURN_STATIC_SECRET exactly as before this flag existed.
    CALLS_ENABLED: z.enum(['true', 'false']).default('false'),

    // Gates `CallsGateway`'s exp+grace disconnect (design §6.4). Defaults OFF: until both mobile
    // clients send `call:auth` to refresh a socket's token in place, enforcing this tears down
    // every call longer than ~16 minutes — strictly worse than the pre-existing gap it closes.
    CALLS_ENFORCE_TOKEN_EXPIRY: z.enum(['true', 'false']).default('false'),
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

      if (env.CALLS_ENABLED === 'true' && (!env.TURN_HOST || !env.TURN_STATIC_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TURN_HOST'],
          message:
            'TURN_HOST and TURN_STATIC_SECRET are required in production when CALLS_ENABLED=true ' +
            '— without them GET /v1/calls/ice-servers returns nothing usable and calls behind NAT ' +
            'never connect.',
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
    // console, not the Pino logger: this runs at bootstrap, before Nest's DI container (and thus
    // the logger) exists — it is what decides whether boot proceeds far enough to construct one.
    // Without this, a bad env produced a bare, silent process exit with no diagnostic at all.
    console.error(`Invalid environment variables:\n${issues}`);
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
