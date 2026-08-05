import { NotificationTargetType } from '../enums/notification-target-type.enum';
import { NotificationType } from '../enums/notification-type.enum';

/** Where tapping a row leads. `id` is null for the target types that address a screen (§1.2). */
export interface NotificationTarget {
  type: NotificationTargetType;
  id: string | null;
}

/**
 * One row of a student's notification list (spec §1).
 *
 * `readAt` is a timestamp rather than a boolean because the client asked for both facts at once —
 * whether it was read, and when (§2.4). A boolean would have thrown the second one away.
 */
export interface Notification {
  id: string;
  studentId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  target: NotificationTarget | null;
  readAt: Date | null;
  createdAt: Date;
}
