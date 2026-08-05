import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { StudentListing } from '../../student-listings/domain/entities/student-listing.entity';
import {
  STUDENT_LISTING_REPOSITORY,
  StudentListingRepository,
} from '../../student-listings/domain/student-listing.repository';
import {
  ADMIN_STUDENT_LISTING_READ_REPOSITORY,
  AdminStudentListingListFilter,
  AdminStudentListingPage,
  AdminStudentListingReadRepository,
} from '../domain/admin-student-listing-read.repository';

/**
 * Admin reads and moderation over **student** listings (admin-panel 15-deletion.md §5.2).
 *
 * This is the module's most overdue surface, not merely a missing convenience: student listings
 * never pass through moderation — `student-listings.service.ts` publishes them the moment they are
 * submitted — so until now there was **no way at all** to take an inappropriate one down. `approve`
 * and `reject` do not exist here and never will; removing it is the only lever.
 */
@Injectable()
export class AdminStudentListingsService {
  constructor(
    @Inject(ADMIN_STUDENT_LISTING_READ_REPOSITORY)
    private readonly reads: AdminStudentListingReadRepository,
    @Inject(STUDENT_LISTING_REPOSITORY)
    private readonly listings: StudentListingRepository,
  ) {}

  list(filter: AdminStudentListingListFilter): Promise<AdminStudentListingPage> {
    return this.reads.list(filter);
  }

  async getById(id: string): Promise<StudentListing> {
    const listing = await this.reads.getById(id);
    if (listing === null) {
      throw AppException.notFound(ERROR_CODE.LISTING_NOT_FOUND, 'E’lon topilmadi');
    }
    return listing;
  }

  /**
   * Takes a listing down. Soft — `deletedAt`, the same thing the owner's own DELETE writes, so the
   * two produce one state rather than two that have to be kept in step.
   *
   * `getById` first, so an unknown id is a 404 and an already-deleted one is refused instead of
   * having its timestamp rewritten: when it went is part of the record.
   */
  async remove(id: string): Promise<StudentListing> {
    const listing = await this.getById(id);
    if (listing.deletedAt !== null) {
      throw AppException.conflict(
        ERROR_CODE.INVALID_STATUS_TRANSITION,
        'Bu e’lon allaqachon o‘chirilgan',
      );
    }
    await this.listings.softDelete(id);
    return this.getById(id);
  }
}
