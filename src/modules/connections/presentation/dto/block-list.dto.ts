import { ApiProperty } from '@nestjs/swagger';
import { BlockedListItem, Page } from '../../application/connections.io';
import { StudentSummaryDto } from './student-summary.dto';

/** A blocked student from the blocker's side (§18). Presence is always masked — they were cut off. */
export class BlockedStudentDto {
  @ApiProperty({ type: StudentSummaryDto })
  student!: StudentSummaryDto;

  @ApiProperty({ type: String, format: 'date-time' })
  blockedAt!: string;

  static fromItem(item: BlockedListItem): BlockedStudentDto {
    const dto = new BlockedStudentDto();
    dto.student = StudentSummaryDto.fromDomain(item.student);
    dto.blockedAt = item.blockedAt.toISOString();
    return dto;
  }
}

/** Paginated blocked-students list. */
export class BlockedStudentPageDto {
  @ApiProperty({ type: [BlockedStudentDto] })
  items!: BlockedStudentDto[];

  @ApiProperty({ type: 'integer', format: 'int32' })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  total!: number;

  @ApiProperty()
  hasNext!: boolean;

  static fromPage(
    result: Page<BlockedListItem>,
    page: number,
    size: number,
  ): BlockedStudentPageDto {
    const dto = new BlockedStudentPageDto();
    dto.items = result.items.map(BlockedStudentDto.fromItem);
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
