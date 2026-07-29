import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { GifSearchService } from './application/gif-search.service';
import { GifsController } from './presentation/gifs.controller';

/**
 * GIF search proxy. Stateless: nothing is stored, and provider files are never copied to our disk —
 * re-hosting is against their terms, which is also why a GIF picked from search has no `mediaId`.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [GifsController],
  providers: [GifSearchService, JwtAuthGuard, StudentGuard],
  exports: [GifSearchService],
})
export class GifsModule {}
