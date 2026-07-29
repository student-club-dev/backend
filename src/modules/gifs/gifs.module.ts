import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { GIF_PROVIDER } from './domain/gif-provider.port';
import { KlipyAdapter } from './infrastructure/klipy.adapter';
import { GifsController } from './presentation/gifs.controller';

/**
 * GIF search proxy. Stateless: nothing is stored, and provider files are never copied to our disk —
 * re-hosting is against their terms, which is also why a GIF picked from search has no `mediaId`.
 *
 * The controller depends on `GifProviderAdapter`, not on KLIPY. That seam is not speculative: in a
 * single month Tenor's API shut down entirely and Giphy turned out to cap a free key at 100 calls an
 * hour. Swapping catalogues has to stay a new adapter plus the binding below — never a change to
 * `GET /v1/gifs/search`, which the mobile client is generated from.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [GifsController],
  providers: [JwtAuthGuard, StudentGuard, { provide: GIF_PROVIDER, useClass: KlipyAdapter }],
  exports: [GIF_PROVIDER],
})
export class GifsModule {}
