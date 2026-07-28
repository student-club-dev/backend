import { AdminOwnerListFilter } from '../../domain/admin-business-owner-read.repository';
import { AdminUserListQueryDto } from './admin-user-list-query.dto';

/**
 * Query for `GET /v1/admin/business-owners`. Uses only the shared admin filters — `q` matches
 * firstName / lastName / phoneNumber / email (case-insensitive contains).
 */
export class AdminOwnerListQueryDto extends AdminUserListQueryDto {
  toFilter(): AdminOwnerListFilter {
    return {
      q: this.q ?? null,
      status: this.status ?? null,
      phoneVerified: this.phoneVerified ?? null,
      createdFrom: this.createdFromDate(),
      createdTo: this.createdToDate(),
      sort: this.sortOrDefault(),
      page: this.pageOrDefault(),
      size: this.sizeOrDefault(),
    };
  }
}
