import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import type { IncomingMessage, ServerResponse } from 'http';
import { AppConfigModule } from './config/config.module';
import { RedisModule } from './infrastructure/cache/redis.module';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { BranchesModule } from './modules/branches/branches.module';
import { BusinessModule } from './modules/business/business.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ChatModule } from './modules/chat/chat.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { GeoModule } from './modules/geo/geo.module';
import { HealthModule } from './modules/health/health.module';
import { ListingsModule } from './modules/listings/listings.module';
import { MediaModule } from './modules/media/media.module';
import { ProfileModule } from './modules/profiles/profile.module';
import { RedemptionsModule } from './modules/redemptions/redemptions.module';
import { TradeCentersModule } from './modules/trade-centers/trade-centers.module';

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
        // Pretty logs are opt-in via LOG_PRETTY, NOT tied to NODE_ENV: pino-pretty is a
        // devDependency absent from the prod image, so a dev-mode container (NODE_ENV=development
        // with --omit=dev deps) would otherwise crash here. Deployments emit structured JSON.
        transport:
          process.env.LOG_PRETTY === 'true'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    // Default IP throttler config; applied only where ThrottlerGuard is used (OTP endpoints).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    PrismaModule,
    RedisModule,
    StorageModule,
    HealthModule,
    CatalogModule,
    DiscountsModule,
    GeoModule,
    AuthModule,
    ProfileModule,
    BusinessModule,
    BranchesModule,
    TradeCentersModule,
    ListingsModule,
    RedemptionsModule,
    ConnectionsModule,
    ChatModule,
    MediaModule,
  ],
})
export class AppModule {}
