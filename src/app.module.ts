import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import type { IncomingMessage, ServerResponse } from 'http';
import { AppConfigModule } from './config/config.module';
import { RedisModule } from './infrastructure/cache/redis.module';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { ProfileModule } from './modules/profiles/profile.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const header = req.headers['x-request-id'];
          const id = (Array.isArray(header) ? header[0] : header) || randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.body.password', 'req.body.otp'],
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    // Default IP throttler config; applied only where ThrottlerGuard is used (OTP endpoints).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    PrismaModule,
    RedisModule,
    HealthModule,
    CatalogModule,
    AuthModule,
    ProfileModule,
  ],
})
export class AppModule {}
