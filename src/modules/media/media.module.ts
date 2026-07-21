import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { MediaService } from './application/media.service';
import { MediaController } from './presentation/media.controller';

/**
 * Stateless media upload (§6). Uses the shared, swappable StorageModule; JwtModule is registered so
 * JwtAuthGuard can verify the access token. Rate limiting uses the global ThrottlerModule.
 */
@Module({
  imports: [StorageModule, JwtModule.register({})],
  controllers: [MediaController],
  providers: [MediaService, JwtAuthGuard],
})
export class MediaModule {}
