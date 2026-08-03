import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { StudentListingSearchService } from './application/student-listing-search.service';
import { StudentListingsService } from './application/student-listings.service';
import { STUDENT_LISTING_REPOSITORY } from './domain/student-listing.repository';
import { StudentListingPrismaRepository } from './infrastructure/student-listing.prisma.repository';
import { StudentListingSearchController } from './presentation/student-listing-search.controller';
import { StudentListingsController } from './presentation/student-listings.controller';

/**
 * Student-posted listings (TASK/RENTAL/SERVICE/JOB).
 *
 * Imports nothing beyond Prisma and JwtModule: the module owns its own tables and shares no code
 * with the business `ListingsModule`, which handles a different aggregate under `/v1/listings`.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  // Search is declared first so `GET /student-listings` (the feed) is matched before the
  // parameterised `GET /student-listings/:id` in the other controller.
  controllers: [StudentListingSearchController, StudentListingsController],
  providers: [
    StudentListingsService,
    StudentListingSearchService,
    JwtAuthGuard,
    { provide: STUDENT_LISTING_REPOSITORY, useClass: StudentListingPrismaRepository },
  ],
  exports: [STUDENT_LISTING_REPOSITORY, StudentListingsService],
})
export class StudentListingsModule {}
