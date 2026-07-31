import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';
import { MediaKind, MediaStatus } from '../../media/domain/enums/media-kind.enum';
import {
  MEDIA_ASSET_REPOSITORY,
  MediaAssetRepository,
} from '../../media/domain/media-asset.repository';
import { MAX_PROFILE_PHOTOS, ProfilePhoto } from '../domain/entities/profile-photo.entity';
import {
  PROFILE_PHOTO_REPOSITORY,
  ProfilePhotoRepository,
} from '../domain/profile-photo.repository';

/**
 * The student's profile-photo set.
 *
 * A new photo always lands first, which is what makes "change my picture" a single call: the client
 * uploads and posts, and the avatar has moved. Reordering exists for the rarer case of promoting one
 * that is already in the set.
 */
@Injectable()
export class ProfilePhotoService {
  private readonly apiBase: string;

  constructor(
    @Inject(PROFILE_PHOTO_REPOSITORY) private readonly photos: ProfilePhotoRepository,
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly media: MediaAssetRepository,
    config: ConfigService<Env, true>,
  ) {
    this.apiBase = `/${config.get('API_PREFIX', { infer: true })}`;
  }

  list(user: AuthenticatedUser): Promise<ProfilePhoto[]> {
    return this.photos.listFor(user.id);
  }

  /** Adds an uploaded `PROFILE_PHOTO` asset to the set, at the front. */
  async add(user: AuthenticatedUser, mediaId: string): Promise<ProfilePhoto> {
    if ((await this.photos.countFor(user.id)) >= MAX_PROFILE_PHOTOS) {
      throw new AppException(
        ERROR_CODE.PHOTO_LIMIT_REACHED,
        422,
        `Profil rasmlari ${MAX_PROFILE_PHOTOS} tadan oshmasligi kerak`,
      );
    }

    const asset = await this.media.findById(mediaId);
    // Same 404 for "no such asset", "not yours" and "wrong kind": telling them apart would confirm
    // that a guessed id exists.
    if (asset === null || asset.ownerId !== user.id || asset.kind !== MediaKind.PROFILE_PHOTO) {
      throw new AppException(ERROR_CODE.MEDIA_NOT_FOUND, 422, 'Rasm topilmadi');
    }
    if (asset.status !== MediaStatus.READY) {
      throw new AppException(ERROR_CODE.MEDIA_NOT_READY, 422, 'Rasm hali tayyor emas');
    }

    return this.photos.addAsMain({
      studentId: user.id,
      mediaId: asset.id,
      // Resolved once, at write time. The client renders `url` directly, and a stored value cannot
      // start pointing somewhere else because the proxy's route changed.
      url: `${this.apiBase}/media/${asset.id}/raw`,
      thumbUrl:
        asset.thumbStorageKey === null
          ? null
          : `${this.apiBase}/media/${asset.id}/raw?variant=thumb`,
      width: asset.width,
      height: asset.height,
    });
  }

  /** Promotes an existing photo to the front of the set (and to `avatarUrl`). */
  async makeMain(user: AuthenticatedUser, photoId: string): Promise<ProfilePhoto> {
    const photo = await this.photos.makeMain(user.id, photoId);
    if (photo === null) {
      throw AppException.notFound(ERROR_CODE.PHOTO_NOT_FOUND, 'Rasm topilmadi');
    }
    return photo;
  }

  /** Removes a photo; the next one becomes the avatar, or it is cleared if none is left. */
  async remove(user: AuthenticatedUser, photoId: string): Promise<void> {
    if (!(await this.photos.remove(user.id, photoId))) {
      throw AppException.notFound(ERROR_CODE.PHOTO_NOT_FOUND, 'Rasm topilmadi');
    }
  }
}
