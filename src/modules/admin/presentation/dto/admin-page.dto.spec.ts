import { AdminBusinessOwnerPage } from '../../domain/admin-business-owner-read.repository';
import { AdminStudentPage } from '../../domain/admin-student-read.repository';
import { AdminBusinessOwnerPageDto } from './admin-business-owner.dto';
import { AdminStudentPageDto } from './admin-student.dto';

const studentPage = (total: number): AdminStudentPage => ({ items: [], total });
const ownerPage = (total: number): AdminBusinessOwnerPage => ({ items: [], total });

describe('admin page DTOs — hasNext math', () => {
  describe('AdminStudentPageDto.fromPage', () => {
    it('hasNext is true when more rows remain beyond the current page', () => {
      const dto = AdminStudentPageDto.fromPage(studentPage(45), 1, 20);
      expect(dto).toMatchObject({ page: 1, size: 20, total: 45, hasNext: true });
    });

    it('hasNext is false on the last page (page * size >= total)', () => {
      const dto = AdminStudentPageDto.fromPage(studentPage(40), 2, 20);
      expect(dto.hasNext).toBe(false);
    });

    it('hasNext is false for an empty result', () => {
      const dto = AdminStudentPageDto.fromPage(studentPage(0), 1, 20);
      expect(dto.hasNext).toBe(false);
    });
  });

  describe('AdminBusinessOwnerPageDto.fromPage', () => {
    it('hasNext is true when more rows remain', () => {
      const dto = AdminBusinessOwnerPageDto.fromPage(ownerPage(21), 1, 20);
      expect(dto.hasNext).toBe(true);
    });

    it('hasNext is false exactly on the boundary', () => {
      const dto = AdminBusinessOwnerPageDto.fromPage(ownerPage(20), 1, 20);
      expect(dto.hasNext).toBe(false);
    });
  });
});
