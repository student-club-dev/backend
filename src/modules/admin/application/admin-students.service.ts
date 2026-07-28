import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  ADMIN_STUDENT_READ_REPOSITORY,
  AdminStudentListFilter,
  AdminStudentPage,
  AdminStudentReadRepository,
} from '../domain/admin-student-read.repository';
import { AdminStudent } from '../domain/entities/admin-student.entity';

/**
 * Admin cross-user student reads (Faza 1). Unscoped — the admin sees every student, unlike the
 * connection-scoped directory. Read-only; depends on the repository interface only.
 */
@Injectable()
export class AdminStudentsService {
  constructor(
    @Inject(ADMIN_STUDENT_READ_REPOSITORY)
    private readonly students: AdminStudentReadRepository,
  ) {}

  /** The filtered, paginated list of every student. */
  list(filter: AdminStudentListFilter): Promise<AdminStudentPage> {
    return this.students.list(filter);
  }

  /** The full student record; 404 `STUDENT_NOT_FOUND` when the id is unknown. */
  async getById(id: string): Promise<AdminStudent> {
    const student = await this.students.findById(id);
    if (student === null) {
      throw AppException.notFound(ERROR_CODE.STUDENT_NOT_FOUND, 'Student topilmadi');
    }
    return student;
  }
}
