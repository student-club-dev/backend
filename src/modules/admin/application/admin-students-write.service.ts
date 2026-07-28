import { Inject, Injectable } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { UpdateProfileInput } from '../../profiles/application/profile.io';
import { ProfileService } from '../../profiles/application/profile.service';
import {
  ADMIN_STUDENT_WRITE_REPOSITORY,
  AdminStudentWriteRepository,
} from '../domain/admin-student-write.repository';
import { AdminStudent } from '../domain/entities/admin-student.entity';
import { AdminCreateStudentInput } from './admin-user-write.io';
import { AdminStudentsService } from './admin-students.service';

/**
 * Admin student writes (Faza 3). Edit reuses {@link ProfileService.updateById} (the same rules as
 * the student's own profile update — phone-change resets `phoneVerified`, username normalisation +
 * uniqueness, account-type dispatch); create reuses argon2 hashing + per-table uniqueness. Both
 * re-fetch the full record through {@link AdminStudentsService} to return it minus `passwordHash`.
 */
@Injectable()
export class AdminStudentsWriteService {
  constructor(
    private readonly reads: AdminStudentsService,
    @Inject(ADMIN_STUDENT_WRITE_REPOSITORY)
    private readonly students: AdminStudentWriteRepository,
    private readonly profileService: ProfileService,
  ) {}

  /**
   * Applies a partial update to the student identified by `id`. 404 `STUDENT_NOT_FOUND` when the id
   * is unknown; 409 on a taken phone (`ACCOUNT_EXISTS`) or username (`USERNAME_TAKEN`).
   */
  async update(id: string, input: UpdateProfileInput): Promise<AdminStudent> {
    await this.reads.getById(id);
    await this.profileService.updateById(AccountType.STUDENT, id, input);
    return this.reads.getById(id);
  }

  /**
   * Creates a student with an admin-set initial password. Uniqueness is pre-checked per the
   * `students` table (409 `ACCOUNT_EXISTS` / `USERNAME_TAKEN`); the password is hashed with argon2.
   */
  async create(input: AdminCreateStudentInput): Promise<AdminStudent> {
    await this.ensureIdentifiersAvailable(input.email, input.phoneNumber);
    if (input.username !== null && (await this.students.existsByUsername(input.username))) {
      throw AppException.conflict(ERROR_CODE.USERNAME_TAKEN, 'Bu username band');
    }
    const passwordHash = await hash(input.password);
    const id = await this.students.create({
      email: input.email,
      phoneNumber: input.phoneNumber,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      gender: input.gender,
      universityId: input.universityId,
      universityEmail: input.universityEmail,
      birthYear: input.birthYear,
      courseYear: input.courseYear,
      avatarUrl: input.avatarUrl,
    });
    return this.reads.getById(id);
  }

  /**
   * Bans the student (Faza 3): sets status=BANNED with the reason and revokes all the student's
   * refresh tokens (force logout). Re-banning updates the reason. 404 `STUDENT_NOT_FOUND` when the
   * id is unknown (the read pre-check runs first).
   */
  async ban(id: string, reason: string): Promise<AdminStudent> {
    await this.reads.getById(id);
    await this.students.ban(id, reason);
    return this.reads.getById(id);
  }

  /** Un-bans the student: status=ACTIVE, clears bannedAt/banReason. 404 when the id is unknown. */
  async unban(id: string): Promise<AdminStudent> {
    await this.reads.getById(id);
    await this.students.unban(id);
    return this.reads.getById(id);
  }

  private async ensureIdentifiersAvailable(
    email: string | null,
    phoneNumber: string | null,
  ): Promise<void> {
    if (email !== null && (await this.students.existsByEmail(email))) {
      throw this.accountExists();
    }
    if (phoneNumber !== null && (await this.students.existsByPhone(phoneNumber))) {
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
