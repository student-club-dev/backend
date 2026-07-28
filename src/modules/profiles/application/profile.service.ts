import { Inject, Injectable } from '@nestjs/common';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { Profile, ProfilePatch } from '../domain/entities/profile.entity';
import {
  BUSINESS_PROFILE_REPOSITORY,
  ProfileRepository,
  STUDENT_PROFILE_REPOSITORY,
} from '../domain/profile.repository';
import { UpdateProfileInput } from './profile.io';

/**
 * Profile use-cases for the authenticated account. A single service serves both account types
 * (D6): it picks the matching per-type repository by `user.type` at request time, so `/profile/me`
 * stays one endpoint. Depends on the repository interfaces only.
 */
@Injectable()
export class ProfileService {
  constructor(
    @Inject(STUDENT_PROFILE_REPOSITORY) private readonly studentProfiles: ProfileRepository,
    @Inject(BUSINESS_PROFILE_REPOSITORY) private readonly businessProfiles: ProfileRepository,
  ) {}

  /** The authenticated account's profile. It always exists, but 404s defensively if missing. */
  async getMyProfile(user: AuthenticatedUser): Promise<Profile> {
    const profile = await this.repositoryFor(user.type).findById(user.id);
    if (profile === null) {
      throw this.profileNotFound();
    }
    return profile;
  }

  /**
   * Applies a partial update. Student-only fields are ignored for a business owner. Changing
   * the phone number resets `phoneVerified` (re-verification is a later OTP step) and is
   * rejected with 409 when the new number already belongs to another account in the same table.
   */
  async updateMyProfile(user: AuthenticatedUser, input: UpdateProfileInput): Promise<Profile> {
    const repository = this.repositoryFor(user.type);
    const current = await repository.findById(user.id);
    if (current === null) {
      throw this.profileNotFound();
    }
    const patch = this.buildPatch(user.type, current, input);
    if (patch.phoneNumber !== undefined) {
      await this.ensurePhoneAvailable(repository, patch.phoneNumber, current.id);
    }
    if (patch.username !== undefined) {
      await this.ensureUsernameAvailable(repository, patch.username, current.id);
    }
    return repository.update(current.id, patch);
  }

  private repositoryFor(type: AccountType): ProfileRepository {
    return type === AccountType.STUDENT ? this.studentProfiles : this.businessProfiles;
  }

  private buildPatch(type: AccountType, current: Profile, input: UpdateProfileInput): ProfilePatch {
    const patch: ProfilePatch = {};
    if (input.firstName !== undefined) {
      patch.firstName = input.firstName;
    }
    if (input.lastName !== undefined) {
      patch.lastName = input.lastName;
    }
    if (input.avatarUrl !== undefined) {
      patch.avatarUrl = input.avatarUrl;
    }
    // Changing the phone number invalidates its verification — the client must re-verify (OTP).
    if (input.phoneNumber !== undefined && input.phoneNumber !== current.phoneNumber) {
      patch.phoneNumber = input.phoneNumber;
      patch.phoneVerified = false;
    }
    // Gender applies to both account types.
    if (input.gender !== undefined) {
      patch.gender = input.gender;
    }
    // University/course fields + username — student-only, silently ignored for a business owner.
    if (type === AccountType.STUDENT) {
      if (input.username !== undefined) {
        patch.username = input.username;
      }
      if (input.universityId !== undefined) {
        patch.universityId = input.universityId;
      }
      if (input.universityEmail !== undefined) {
        patch.universityEmail = input.universityEmail;
      }
      if (input.birthYear !== undefined) {
        patch.birthYear = input.birthYear;
      }
      if (input.courseYear !== undefined) {
        patch.courseYear = input.courseYear;
      }
      if (input.lastSeenVisibility !== undefined) {
        patch.lastSeenVisibility = input.lastSeenVisibility;
      }
    }
    return patch;
  }

  private async ensurePhoneAvailable(
    repository: ProfileRepository,
    phoneNumber: string,
    selfId: string,
  ): Promise<void> {
    const existing = await repository.findByPhone(phoneNumber);
    if (existing !== null && existing.id !== selfId) {
      throw AppException.conflict(
        ERROR_CODE.ACCOUNT_EXISTS,
        'Bu telefon bilan hisob allaqachon mavjud',
      );
    }
  }

  private async ensureUsernameAvailable(
    repository: ProfileRepository,
    username: string,
    selfId: string,
  ): Promise<void> {
    const existing = await repository.findByUsername(username);
    if (existing !== null && existing.id !== selfId) {
      throw AppException.conflict(ERROR_CODE.USERNAME_TAKEN, 'Bu username band');
    }
  }

  private profileNotFound(): AppException {
    return AppException.notFound(ERROR_CODE.PROFILE_NOT_FOUND, 'Profil topilmadi');
  }
}
