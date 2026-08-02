import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DevicePlatform } from '../../domain/enums/device-platform.enum';

/** Body of `POST /v1/devices`. */
export class RegisterDeviceDto {
  @ApiProperty({
    description:
      'The device push token. `ANDROID`/`WEB`: the FCM registration token. `IOS`: the raw APNs ' +
      'device token — 64 lowercase hex characters; anything else is rejected with 422 ' +
      '`INVALID_DEVICE_TOKEN`.',
    example: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ enum: DevicePlatform, enumName: 'DevicePlatformDto' })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}
