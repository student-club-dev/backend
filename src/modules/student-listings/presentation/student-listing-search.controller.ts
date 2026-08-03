import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiErrorEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { StudentListingSearchService } from '../application/student-listing-search.service';
import { ListingSearchPageDto } from './dto/listing-search-page.dto';
import { SearchListingsDto, SearchListingsQueryDto } from './dto/search-listings.dto';

/**
 * The student-listing feed (§7.2).
 *
 * Two entry points, one behaviour: `POST /search` for the full filter set and `GET /` for tab
 * switches and deep links. Both build the same `SearchCriteria` and call the same service — §7.2.5
 * requires them to agree, and sharing the path is the only way to guarantee it.
 */
@ApiTags('Student listings')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(JwtAuthGuard)
@Controller('student-listings')
export class StudentListingSearchController {
  constructor(private readonly service: StudentListingSearchService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'E’lonlarni qidirish',
    description:
      '`kind` majburiy — turlar aralashmaydi. Turga tegishli bo‘lmagan filtr jimgina ' +
      'e’tiborsiz qoldiriladi. Joylashuv berilmasa butun O‘zbekiston bo‘yicha qidiriladi.',
  })
  @ApiOkEnvelope(ListingSearchPageDto)
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.PAGE_CURSOR_INVALID,
    'The cursor belongs to a different filter or sort — restart from the first page.',
    'Ro‘yxat yangilandi — boshidan boshlang',
  )
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SearchListingsDto,
  ): Promise<ListingSearchPageDto> {
    const result = await this.service.search(dto.toCriteria(user.id));
    return ListingSearchPageDto.from(result, user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'E’lonlar ro‘yxati (query-parametrlar bilan)',
    description: 'POST /search bilan bir xil mantiq; deep-link va tab almashish uchun qulay.',
  })
  @ApiOkEnvelope(ListingSearchPageDto)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchListingsQueryDto,
  ): Promise<ListingSearchPageDto> {
    const result = await this.service.search(query.toCriteria(user.id));
    return ListingSearchPageDto.from(result, user.id);
  }
}
