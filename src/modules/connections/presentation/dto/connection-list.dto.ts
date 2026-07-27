import { ApiProperty } from '@nestjs/swagger';
import { ConnectionListItem, Page } from '../../application/connections.io';
import { StudentSummaryDto } from './student-summary.dto';

/** An accepted connection from the caller's side: the other student + when it was accepted. */
export class ConnectionSummaryDto {
  @ApiProperty({ type: StudentSummaryDto })
  student!: StudentSummaryDto;

  @ApiProperty({ format: 'date-time' })
  connectedAt!: string;

  static fromItem(item: ConnectionListItem): ConnectionSummaryDto {
    const dto = new ConnectionSummaryDto();
    dto.student = StudentSummaryDto.fromDomain(item.student);
    dto.connectedAt = item.connectedAt.toISOString();
    return dto;
  }
}

/** Paginated connections list. */
export class ConnectionSummaryPageDto {
  @ApiProperty({ type: [ConnectionSummaryDto] })
  items!: ConnectionSummaryDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  hasNext!: boolean;

  static fromPage(
    result: Page<ConnectionListItem>,
    page: number,
    size: number,
  ): ConnectionSummaryPageDto {
    const dto = new ConnectionSummaryPageDto();
    dto.items = result.items.map(ConnectionSummaryDto.fromItem);
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
