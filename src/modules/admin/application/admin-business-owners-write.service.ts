import { Inject, Injectable, Logger } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { UpdateProfileInput } from '../../profiles/application/profile.io';
import { ProfileService } from '../../profiles/application/profile.service';
import {
  ADMIN_BUSINESS_OWNER_WRITE_REPOSITORY,
  AdminBusinessOwnerWriteRepository,
} from '../domain/admin-business-owner-write.repository';
import { AdminBusinessOwner } from '../domain/entities/admin-business-owner.entity';
import { AdminBusinessOwnersService } from './admin-business-owners.service';
import { AdminCreateOwnerInput } from './admin-user-write.io';

/**
 * Admin business-owner writes (Faza 3). Edit reuses {@link ProfileService.updateById} (same rules
 * as the owner's own profile update — phone-change resets `phoneVerified`, account-type dispatch
 * ignores student-only fields); create reuses argon2 hashing + per-table uniqueness. Both re-fetch
 * the full record through {@link AdminBusinessOwnersService} to return it minus `passwordHash`.
 */
@Injectable()
export class AdminBusinessOwnersWriteService {
  private readonly logger = new Logger(AdminBusinessOwnersWriteService.name);

  constructor(
    private readonly reads: AdminBusinessOwnersService,
    @Inject(ADMIN_BUSINESS_OWNER_WRITE_REPOSITORY)
    private readonly owners: AdminBusinessOwnerWriteRepository,
    private readonly profileService: ProfileService,
  ) {}

  /**
   * Applies a partial update to the owner identified by `id`. 404 `BUSINESS_OWNER_NOT_FOUND` when
   * the id is unknown; 409 `ACCOUNT_EXISTS` on a taken phone.
   */
  async update(id: string, input: UpdateProfileInput): Promise<AdminBusinessOwner> {
    await this.reads.getById(id);
    await this.profileService.updateById(AccountType.BUSINESS, id, input);
    return this.reads.getById(id);
  }

  /**
   * Creates a business owner with an admin-set initial password. Uniqueness is pre-checked per the
   * `business_owners` table (409 `ACCOUNT_EXISTS`); the password is hashed with argon2.
   */
  async create(input: AdminCreateOwnerInput): Promise<AdminBusinessOwner> {
    await this.ensureIdentifiersAvailable(input.email, input.phoneNumber);
    const passwordHash = await hash(input.password);
    const id = await this.owners.create({
      email: input.email,
      phoneNumber: input.phoneNumber,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      gender: input.gender,
      avatarUrl: input.avatarUrl,
    });
    return this.reads.getById(id);
  }

  /**
   * Bans the owner (Faza 3): sets status=BANNED with the reason and revokes all the owner's refresh
   * tokens (force logout). Re-banning updates the reason. 404 `BUSINESS_OWNER_NOT_FOUND` when the id
   * is unknown (the read pre-check runs first).
   */
  async ban(id: string, reason: string): Promise<AdminBusinessOwner> {
    await this.reads.getById(id);
    await this.owners.ban(id, reason);
    return this.reads.getById(id);
  }

  /**
   * Deletes the owner's row and their whole shopfront with it (15-deletion.md §4): businesses,
   * branches, listings and the redemptions students made against those listings.
   *
   * Same as the student's: the log line written before the delete is the only record that outlives
   * it, and it carries the id rather than the email to keep PII out of the logs.
   */
  async hardDelete(id: string, reason: string | null): Promise<void> {
    await this.reads.getById(id);
    this.logger.warn(`Hard-deleting business owner ${id}. Reason: ${reason ?? '(none given)'}`);
    await this.owners.hardDelete(id);
  }

  /** Un-bans the owner: status=ACTIVE, clears bannedAt/banReason. 404 when the id is unknown. */
  async unban(id: string): Promise<AdminBusinessOwner> {
    await this.reads.getById(id);
    await this.owners.unban(id);
    return this.reads.getById(id);
  }

  private async ensureIdentifiersAvailable(
    email: string | null,
    phoneNumber: string | null,
  ): Promise<void> {
    if (email !== null && (await this.owners.existsByEmail(email))) {
      throw this.accountExists();
    }
    if (phoneNumber !== null && (await this.owners.existsByPhone(phoneNumber))) {
      throw this.accountExists();
    }
  }

  private accountExists(): AppException {
    return AppException.conflict(
      ERROR_CODE.ACCOUNT_EXISTS,
      'Bu email yoki telefon bilan hisob allaqachon mavjud',
    );
  }
}
