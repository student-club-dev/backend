import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { NotificationDedupRepository } from '../domain/notification-dedup.repository';

/** Prisma implementation of the send-once ledger. Prisma is used ONLY here. */
@Injectable()
export class NotificationDedupPrismaRepository implements NotificationDedupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `createMany` + `skipDuplicates` rather than find-then-insert.
   *
   * The check-then-write version has a race that matters here: two replicas running the same
   * ten-minute sweep both see "not sent", both send, and the student gets the reminder twice — the
   * exact outcome §5.2 exists to prevent. Letting the primary key arbitrate means the database
   * decides, and `count` tells us which caller won.
   */
  async claim(key: string): Promise<boolean> {
    const { count } = await this.prisma.notificationDedup.createMany({
      data: [{ key }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async purgeOlderThan(before: Date): Promise<number> {
    const { count } = await this.prisma.notificationDedup.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }
}
