import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { STICKER_PROVIDER } from './domain/sticker-provider.port';
import { STICKER_REPOSITORY } from './domain/sticker.repository';
import { KlipyStickerAdapter } from './infrastructure/klipy-sticker.adapter';
import { StickerPrismaRepository } from './infrastructure/sticker.prisma.repository';
import { StickersController } from './presentation/stickers.controller';

/**
 * Stickers. Two independent sources behind one controller:
 *
 * - our own catalogue — seeded (`prisma/seed-stickers.ts`), never user-generated, read through
 *   `StickerRepository`;
 * - the provider catalogue — proxied through `StickerProviderAdapter`, stateless, nothing stored and
 *   no file copied to our disk (re-hosting is against their terms, which is also why a sticker
 *   picked from search has no `mediaId`).
 *
 * Chat validates a catalogue `stickerId` through its own narrow port rather than importing this
 * module, and re-checks a provider sticker's URLs against the same allowlist search used.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [StickersController],
  providers: [
    JwtAuthGuard,
    StudentGuard,
    { provide: STICKER_REPOSITORY, useClass: StickerPrismaRepository },
    { provide: STICKER_PROVIDER, useClass: KlipyStickerAdapter },
  ],
  exports: [STICKER_PROVIDER],
})
export class StickersModule {}
