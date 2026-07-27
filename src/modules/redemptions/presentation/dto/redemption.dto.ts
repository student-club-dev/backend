import { ApiProperty } from '@nestjs/swagger';
import { StudentBrief } from '../../domain/entities/redemption.entity';
import { RedemptionPage, RedemptionView } from '../../domain/redemption.repository';

/** The redeeming student, as the cashier / owner sees them. */
export class RedemptionStudentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  fullName!: string | null;

  @ApiProperty({ nullable: true })
  username!: string | null;

  @ApiProperty({ nullable: true })
  universityId!: string | null;

  static fromBrief(student: StudentBrief): RedemptionStudentDto {
    const dto = new RedemptionStudentDto();
    dto.id = student.id;
    dto.fullName = student.fullName;
    dto.username = student.username;
    dto.universityId = student.universityId;
    return dto;
  }
}

/** A confirmed redemption (matches elon-uz.json `RedemptionDto`). */
export class RedemptionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  listingId!: string;

  @ApiProperty({ nullable: true })
  branchId!: string | null;

  @ApiProperty({ type: RedemptionStudentDto })
  student!: RedemptionStudentDto;

  @ApiProperty({ nullable: true, format: 'int64', description: 'Whole soums applied at the till' })
  amount!: number | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  redeemedAt!: string | null;

  static fromView(view: RedemptionView): RedemptionDto {
    const dto = new RedemptionDto();
    dto.id = view.redemption.id;
    dto.listingId = view.redemption.listingId;
    dto.branchId = view.redemption.branchId;
    dto.student = RedemptionStudentDto.fromBrief(view.student);
    dto.amount = view.redemption.amount;
    dto.redeemedAt =
      view.redemption.redeemedAt === null ? null : view.redemption.redeemedAt.toISOString();
    return dto;
  }
}

/** Paginated redemption history. */
export class RedemptionPageDto {
  @ApiProperty({ type: [RedemptionDto] })
  items!: RedemptionDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  hasNext!: boolean;

  static fromPage(result: RedemptionPage, page: number, size: number): RedemptionPageDto {
    const dto = new RedemptionPageDto();
    dto.items = result.items.map(RedemptionDto.fromView);
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
