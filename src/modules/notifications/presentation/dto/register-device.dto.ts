import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DevicePlatform } from '../../domain/enums/device-platform.enum';
import { DeviceTokenType } from '../../domain/enums/device-token-type.enum';

/** Body of `POST /v1/devices`. */
export class RegisterDeviceDto {
  @ApiProperty({
    description:
      'The device push token. `ANDROID`/`WEB`: the FCM registration token. `IOS`: the raw APNs ' +
      'device token — 64 lowercase hex characters; anything else is rejected with 422 ' +
      '`INVALID_DEVICE_TOKEN`. A PushKit token has the same shape.',
    example: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ enum: DevicePlatform, enumName: 'DevicePlatformDto' })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @ApiPropertyOptional({
    enum: DeviceTokenType,
    enumName: 'DeviceTokenTypeDto',
    description:
      'Which channel this token belongs to (calls spec §7.3).\n\n' +
      '**Optional — today’s app sends nothing and should not start.** Omitted, it is inferred from ' +
      '`platform`: `IOS → APNS`, everything else `→ FCM`.\n\n' +
      '⚠️ Note the iOS default is `APNS`, not `FCM` as the spec’s table has it: this backend talks ' +
      'to Apple directly and an iPhone registers its raw APNs token, so `FCM` would mislabel it.\n\n' +
      'Send `APNS_VOIP` for the **PushKit** token, and send it as a **second** registration ' +
      'alongside the ordinary one — the same iPhone has two tokens and needs both rows. Replacing ' +
      'one with the other silently disables either messages or calls.\n\n' +
      '⛔ The `APNS_VOIP` channel carries calls and nothing else. It is not a faster push: iOS ' +
      'kills an app that receives one without immediately showing an incoming call, and repeated ' +
      'kills stop VoIP delivery to that device for good.',
  })
  @IsOptional()
  @IsEnum(DeviceTokenType)
  tokenType?: DeviceTokenType;
}
