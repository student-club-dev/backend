import { ApiProperty } from '@nestjs/swagger';
import { Page, RequestListItem } from '../../application/connections.io';
import { StudentSummaryDto } from './student-summary.dto';

/** A pending request: the edge id (to accept/decline) + the other student + when it was sent. */
export class RequestItemDto {
  @ApiProperty()
  connectionId!: string;

  @ApiProperty({ type: StudentSummaryDto })
  student!: StudentSummaryDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromItem(item: RequestListItem): RequestItemDto {
    const dto = new RequestItemDto();
    dto.connectionId = item.connectionId;
    dto.student = StudentSummaryDto.fromDomain(item.student);
    dto.createdAt = item.createdAt.toISOString();
    return dto;
  }
}

/** Paginated pending requests (incoming or outgoing). */
export class RequestItemPageDto {
  @ApiProperty({ type: [RequestItemDto] })
  items!: RequestItemDto[];

  @ApiProperty({ type: 'integer', format: 'int32' })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  total!: number;

  @ApiProperty()
  hasNext!: boolean;

  static fromPage(result: Page<RequestListItem>, page: number, size: number): RequestItemPageDto {
    const dto = new RequestItemPageDto();
    dto.items = result.items.map(RequestItemDto.fromItem);
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
