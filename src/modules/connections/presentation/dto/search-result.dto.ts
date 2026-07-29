import { ApiProperty } from '@nestjs/swagger';
import { Page, SearchResult } from '../../application/connections.io';
import { ConnectionView } from '../../domain/enums/connection-view.enum';
import { StudentSummaryDto } from './student-summary.dto';

/** A discovery-search hit: the student summary plus the viewer's relationship (C11). */
export class SearchResultDto extends StudentSummaryDto {
  @ApiProperty({ enum: ConnectionView, enumName: 'ConnectionViewDto' })
  connectionStatus!: ConnectionView;

  static fromResult(result: SearchResult): SearchResultDto {
    const dto = Object.assign(new SearchResultDto(), StudentSummaryDto.fromDomain(result.student));
    dto.connectionStatus = result.view;
    return dto;
  }
}

/** Paginated search results (chat.md envelope: items/page/size/total/hasNext). */
export class SearchResultPageDto {
  @ApiProperty({ type: [SearchResultDto] })
  items!: SearchResultDto[];

  @ApiProperty({ type: 'integer', format: 'int32' })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  total!: number;

  @ApiProperty()
  hasNext!: boolean;

  static fromPage(result: Page<SearchResult>, page: number, size: number): SearchResultPageDto {
    const dto = new SearchResultPageDto();
    dto.items = result.items.map(SearchResultDto.fromResult);
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
