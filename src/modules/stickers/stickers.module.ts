import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { STICKER_REPOSITORY } from './domain/sticker.repository';
import { StickerPrismaRepository } from './infrastructure/sticker.prisma.repository';
import { StickersController } from './presentation/stickers.controller';

/**
 * Sticker catalogue. Read-only for the app: packs are seeded (`prisma/seed-stickers.ts`), never
 * user-generated. Chat validates a `stickerId` through its own narrow port rather than importing
 * this module.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [StickersController],
  providers: [
    JwtAuthGuard,
    StudentGuard,
    { provide: STICKER_REPOSITORY, useClass: StickerPrismaRepository },
  ],
})
export class StickersModule {}
