import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiCreatedEnvelope,
  ApiErrorEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { StudentListingsService } from '../application/student-listings.service';
import { CreateStudentListingDto } from './dto/create-student-listing.dto';
import {
  JobDetailsDto,
  JobScheduleDto,
  RentalDetailsDto,
  ServiceDetailsDto,
  TaskDetailsDto,
} from './dto/listing-details.dto';
import { SetListingStatusDto } from './dto/set-status.dto';
import {
  OwnListingsQueryDto,
  PAGE_SIZE_DEFAULT,
  StudentListingPageDto,
} from './dto/student-listing-page.dto';
import { StudentListingDto } from './dto/student-listing.dto';
import { UpdateStudentListingDto } from './dto/update-student-listing.dto';

/**
 * Student-posted listings (STUDENT_LISTINGS_BACKEND.md §7.1).
 *
 * Served at `/v1/student-listings`, NOT `/v1/listings` — that prefix belongs to business discount
 * listings, whose `submit` and `DELETE` routes already exist behind a business-account guard.
 *
 * Thin by design: bind the DTO, call the service, map the entity to a response. The global
 * interceptor applies the BaseResponse envelope, so nothing here wraps a result by hand.
 */
/**
 * ⚠️ The four `*DetailsDto` classes reach the document only through the `oneOf` that
 * `CreateStudentListingDto.details` (and its siblings) declare with `getSchemaPath`. Nest's scanner
 * does not follow that: it emits the `$ref`s and never emits the components they point at, so
 * `components.schemas` had four dangling references and **every code generator stopped there**.
 *
 * `@ApiExtraModels` is what registers them. It emits nothing at runtime — it exists purely so the
 * document describes the shape the API has always had.
 */
@ApiExtraModels(TaskDetailsDto, RentalDetailsDto, ServiceDetailsDto, JobDetailsDto, JobScheduleDto)
@ApiTags('Student listings')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(JwtAuthGuard)
@Controller('student-listings')
export class StudentListingsController {
  constructor(private readonly service: StudentListingsService) {}

  @Post()
  @ApiOperation({
    summary: 'E’lon yaratish',
    description:
      '`submit: true` — to‘liq validatsiyadan o‘tsa darrov ACTIVE (yoki `validFrom` kelajakda ' +
      'bo‘lsa SCHEDULED) bo‘ladi; moderatsiya yo‘q. Aks holda validatsiyasiz DRAFT saqlanadi. ' +
      '`Idempotency-Key` sarlavhasi berilsa, takroriy so‘rov dublikat yaratmaydi.',
  })
  @ApiCreatedEnvelope(StudentListingDto)
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.LISTING_VALIDATION_FAILED,
    'Publish validation failed — `error.fields` maps a `ListingField` key to an Uzbek message.',
    'E’lonni tekshiring',
  )
  @ApiErrorEnvelope(
    429,
    ERROR_CODE.LISTING_LIMIT_REACHED,
    'Active-listing or daily-publish limit reached (§6).',
    'E’lon limiti tugadi',
  )
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStudentListingDto,
    // Lowercase: Node lowercases incoming header names, so 'Idempotency-Key' would read undefined.
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<StudentListingDto> {
    const listing = await this.service.create(user.id, dto.toInput(), idempotencyKey ?? null);
    return StudentListingDto.fromEntity(listing, user.id);
  }

  // Declared before `:id` — Nest matches routes in order, so a literal path must come first or
  // `/mine` is swallowed by the parameter route and looked up as a listing id.
  @Get('mine')
  @ApiOperation({
    summary: 'O‘z e’lonlarim',
    description: 'Barcha status va turlar, `updatedAt DESC`. Faqat egasiga ko‘rinadi.',
  })
  @ApiOkEnvelope(StudentListingPageDto)
  async mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OwnListingsQueryDto,
  ): Promise<StudentListingPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? PAGE_SIZE_DEFAULT;
    const result = await this.service.findOwn(user.id, page, size);
    return StudentListingPageDto.from(result, page, size, user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Bitta e’lon',
    description:
      'Ko‘rish soni oshadi (egasi ochganda emas). ACTIVE bo‘lmagan e’lon egasidan boshqasiga ' +
      '404 qaytaradi — begona odam e’lon borligini ham bilmasligi kerak.',
  })
  @ApiParam({ name: 'id', description: 'E’lon id' })
  @ApiOkEnvelope(StudentListingDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.LISTING_NOT_FOUND,
    'Missing, deleted, or not visible to this viewer.',
    'E’lon topilmadi',
  )
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StudentListingDto> {
    const listing = await this.service.findVisible(user.id, id);
    return StudentListingDto.fromEntity(listing, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'E’lonni tahrirlash',
    description:
      '`kind` o‘zgarmaydi. ACTIVE e’lon tahrirlansa qayta validatsiya qilinadi va ACTIVE bo‘lib ' +
      'qoladi; DRAFT esa validatsiyasiz saqlanadi.',
  })
  @ApiParam({ name: 'id', description: 'E’lon id' })
  @ApiOkEnvelope(StudentListingDto)
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.LISTING_KIND_IMMUTABLE,
    'The request tried to change `kind`, which is fixed at creation.',
    'E’lon turini o‘zgartirib bo‘lmaydi',
  )
  async patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStudentListingDto,
  ): Promise<StudentListingDto> {
    const listing = await this.service.patch(user.id, id, dto.toPatchInput());
    return StudentListingDto.fromEntity(listing, user.id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'E’lon qilish',
    description: 'To‘liq validatsiya (§5) va anti-spam limitlari, so‘ng ACTIVE yoki SCHEDULED.',
  })
  @ApiParam({ name: 'id', description: 'E’lon id' })
  @ApiOkEnvelope(StudentListingDto)
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.LISTING_VALIDATION_FAILED,
    'Publish validation failed — `error.fields` maps a `ListingField` key to an Uzbek message.',
    'E’lonni tekshiring',
  )
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StudentListingDto> {
    const listing = await this.service.submit(user.id, id);
    return StudentListingDto.fromEntity(listing, user.id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Statusni o‘zgartirish',
    description: 'ACTIVE / PAUSED / ARCHIVED. ACTIVE ga qaytishda qayta validatsiya qilinadi.',
  })
  @ApiParam({ name: 'id', description: 'E’lon id' })
  @ApiOkEnvelope(StudentListingDto)
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.LISTING_STATUS_INVALID,
    'The transition is not allowed from the listing’s current status (§6).',
    'Bu holatda bunday amal mumkin emas',
  )
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetListingStatusDto,
  ): Promise<StudentListingDto> {
    const listing = await this.service.setStatus(user.id, id, dto.status);
    return StudentListingDto.fromEntity(listing, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'E’lonni o‘chirish', description: 'Soft delete — qayta tiklanmaydi.' })
  @ApiParam({ name: 'id', description: 'E’lon id' })
  @ApiNotFoundEnvelope(
    ERROR_CODE.LISTING_NOT_FOUND,
    'Missing or already deleted.',
    'E’lon topilmadi',
  )
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.service.remove(user.id, id);
  }
}
