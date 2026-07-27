import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { NotificationsService } from './application/notifications.service';
import { DEVICE_TOKEN_REPOSITORY } from './domain/device-token.repository';
import { DeviceTokenPrismaRepository } from './infrastructure/device-token.prisma.repository';
import { DevicesController } from './presentation/devices.controller';

/**
 * Push notifications (chat.md C8): device-token registration + offline push. `PushModule` (global)
 * provides the push provider. Exports `NotificationsService` so chat can push to offline recipients.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [DevicesController],
  providers: [
    NotificationsService,
    JwtAuthGuard,
    StudentGuard,
    { provide: DEVICE_TOKEN_REPOSITORY, useClass: DeviceTokenPrismaRepository },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
