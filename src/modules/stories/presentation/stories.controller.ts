import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiCreatedEnvelope,
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { StoriesService } from '../application/stories.service';
import { MAX_ACTIVE_STORIES, MAX_STORIES_PER_DAY } from '../domain/entities/story.entity';
import { StoryViewerPageDto, StoryViewersQueryDto } from './dto/story-viewers.dto';
import { CreateStoryDto, MyStoriesDto, StoryDto, StoryFeedDto } from './dto/story.dto';

/**
 * Stories — 24-hour posts, visible to connections only.
 *
 * The same gate as chat: connections see them, blocked people never do, and a direct link is no way
 * around either. Nothing here sends a push; a notification per frame is how users end up switching
 * notifications off altogether.
 */
@ApiTags('Stories')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Post()
  @ApiOperation({
    summary: 'Post a story',
    description:
      'Upload the file first with `POST /v1/media/chat-upload` and `kind=STORY_IMAGE` or ' +
      '`STORY_VIDEO` (no `conversationId`; video ≤ 30 s, 48 MB), then post the `id` it returns. ' +
      'The story disappears 24 hours later. Stories cannot be edited — delete and post again.',
  })
  @ApiCreatedEnvelope(StoryDto)
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.STORY_LIMIT_REACHED,
    `Already ${MAX_ACTIVE_STORIES} live stories, or ${MAX_STORIES_PER_DAY} posted in the last day.`,
  )
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.MEDIA_NOT_FOUND,
    'No such upload, not yours, or not uploaded as a `STORY_*` kind.',
  )
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.MEDIA_NOT_READY,
    'The video is still transcoding — wait for `media:ready` and post again.',
  )
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.MEDIA_ALREADY_USED,
    'That upload already backs a story — upload again to post a second one.',
  )
  @ApiValidationEnvelope()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStoryDto,
  ): Promise<StoryDto> {
    const story = await this.stories.create(user, dto.mediaId, dto.caption ?? null);
    // Freshly posted: it is yours, so it counts as seen and the count is visible (and zero).
    return StoryDto.fromDomain({ story, seen: true, viewsCount: story.viewsCount });
  }

  @Get('feed')
  @ApiOperation({
    summary: 'Your connections’ live stories, grouped by author',
    description:
      'Already grouped and ordered — authors with something unseen first, then by most recent ' +
      'story. Draw the avatar row straight from `items` and do not re-sort it. `viewsCount` is ' +
      '`null` on everyone else’s stories; only the author sees their own numbers.',
  })
  @ApiOkEnvelope(StoryFeedDto)
  async feed(@CurrentUser() user: AuthenticatedUser): Promise<StoryFeedDto> {
    return StoryFeedDto.from(await this.stories.feed(user));
  }

  @Get('mine')
  @ApiOperation({
    summary: 'Your own live stories, with their view counts',
    description: 'Expired stories are not returned.',
  })
  @ApiOkEnvelope(MyStoriesDto)
  async mine(@CurrentUser() user: AuthenticatedUser): Promise<MyStoriesDto> {
    return MyStoriesDto.from(await this.stories.mine(user));
  }

  @Post(':id/view')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Mark a story as seen',
    description:
      '**Idempotent** — call it every time a frame opens. Re-opening the same story does not move ' +
      '`viewsCount`, and viewing your own story never counts. 120 calls a minute: tapping quickly ' +
      'through a feed is normal use.',
  })
  @ApiParam({ name: 'id', description: 'Story id' })
  @ApiOkEnvelope(undefined, 'Recorded; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.STORY_NOT_FOUND,
    'No such story, or it has expired or been deleted.',
    'Story topilmadi',
  )
  @ApiErrorEnvelope(
    403,
    ERROR_CODE.STORY_FORBIDDEN,
    'Not connected to the author, or one of you has blocked the other.',
  )
  async view(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.stories.markViewed(user, id);
  }

  @Get(':id/views')
  @ApiOperation({
    summary: 'Who has seen a story — author only',
    description:
      'Deliberately **not** subject to `lastSeenVisibility`: opening someone’s story shows ' +
      'yourself to them. Hiding a viewer here would make the list and `viewsCount` disagree.',
  })
  @ApiParam({ name: 'id', description: 'Story id' })
  @ApiOkEnvelope(StoryViewerPageDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.STORY_NOT_FOUND,
    'No such story, or it has expired or been deleted.',
    'Story topilmadi',
  )
  @ApiErrorEnvelope(403, ERROR_CODE.STORY_FORBIDDEN, 'You are not the author.')
  async viewers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: StoryViewersQueryDto,
  ): Promise<StoryViewerPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 30;
    return StoryViewerPageDto.fromPage(
      await this.stories.viewers(user, id, page, size),
      page,
      size,
    );
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete your own story',
    description:
      'Gone from every response immediately. The file itself is removed by the cleanup pass a day ' +
      'later — deleting it at once would break copies already in flight or in a CDN, which shows ' +
      'up as a broken image rather than a missing one.',
  })
  @ApiParam({ name: 'id', description: 'Story id' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.STORY_NOT_FOUND,
    'Not your story, or already gone.',
    'Story topilmadi',
  )
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.stories.remove(user, id);
  }
}
