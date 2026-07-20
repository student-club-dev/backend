import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../../config/env';
import { TokenService } from './application/token.service';

/**
 * Shared token infrastructure. Configures the JwtModule with the access secret + TTL and
 * exports the TokenService, so both per-type auth modules issue tokens the same way.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) },
      }),
    }),
  ],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
