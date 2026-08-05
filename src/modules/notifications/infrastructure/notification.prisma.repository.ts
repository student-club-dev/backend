import { Injectable } from '@nestjs/common';
// `NotificationType` is imported as a value, not just a type: the badge query compares against
// `PrismaType.CHAT` at runtime.
import { NotificationType as PrismaType } from '@prisma/client';
import type {
  Notification as PrismaNotification,
  NotificationTargetType as PrismaTargetType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Notification } from '../domain/entities/notification.entity';
import { NotificationTargetType } from '../domain/enums/notification-target-type.enum';
import { NotificationType } from '../domain/enums/notification-type.enum';
import {
  NewNotification,
  NotificationList,
  NotificationRepository,
} from '../domain/notification.repository';

/** Prisma implementation of the notification port. Prisma is used ONLY here. */
@Injectable()
export class NotificationPrismaRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(notification: NewNotification): Promise<Notification> {
    const row = await this.prisma.notification.create({
      data: {
        studentId: notification.studentId,
        type: notification.type as PrismaType,
        title: notification.title,
        body: notification.body,
        targetType: (notification.target?.type ?? null) as PrismaTargetType | null,
        targetId: notification.target?.id ?? null,
        pushDeferredUntil: notification.pushDeferredUntil ?? null,
      },
    });
    return toDomain(row);
  }

  countUnread(studentId: string): Promise<number> {
    return this.prisma.notification.count({ where: { studentId, readAt: null } });
  }

  /** `not: CHAT` — those rows describe messages the unread-message counter already counts. */
  countUnreadForBadge(studentId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { studentId, readAt: null, type: { not: PrismaType.CHAT } },
    });
  }

  /** `not: null` keeps this on the tiny `push_deferred_until` index instead of scanning the table. */
  async findPushDue(now: Date, limit: number): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { pushDeferredUntil: { not: null, lte: now } },
      orderBy: { pushDeferredUntil: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async clearPushDeferred(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { pushDeferredUntil: null },
    });
  }

  /**
   * One round trip for both halves. The count is a separate query rather than something derived
   * from `items` because it spans the whole history while `items` is capped at `limit` (§2.2) —
   * counting the page would make the home-screen dot disagree with the list it opens.
   *
   * `id DESC` is not decoration: two rows written in the same millisecond would otherwise come back
   * in whatever order the planner felt like, and the list would reshuffle between pulls (§2.1).
   */
  async list(studentId: string, limit: number): Promise<NotificationList> {
    const [rows, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { studentId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
      this.prisma.notification.count({ where: { studentId, readAt: null } }),
    ]);
    return { items: rows.map(toDomain), unreadCount };
  }

  /**
   * `readAt: null` in the filter is what makes this idempotent (§3.2): a second call matches
   * nothing and the first timestamp survives, so "when did they read it" stays true.
   *
   * `studentId` in the same filter is the authorisation check. It is here, in the query, rather
   * than in a service-level lookup because that is the version no caller can forget.
   */
  async markRead(studentId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.notification.updateMany({
      where: { studentId, id: { in: ids }, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(studentId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { studentId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }
}

function toDomain(row: PrismaNotification): Notification {
  return {
    id: row.id,
    studentId: row.studentId,
    type: NotificationType[row.type],
    title: row.title,
    body: row.body,
    target:
      row.targetType === null
        ? null
        : { type: NotificationTargetType[row.targetType], id: row.targetId },
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}
