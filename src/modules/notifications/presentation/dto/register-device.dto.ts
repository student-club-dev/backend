import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DevicePlatform } from '../../domain/enums/device-platform.enum';

/** Body of `POST /v1/devices`. */
export class RegisterDeviceDto {
  @ApiProperty({ description: 'The device push token (FCM/APNs)' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ enum: DevicePlatform, enumName: 'DevicePlatformDto' })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}
