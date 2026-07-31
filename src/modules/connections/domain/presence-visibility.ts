import { isWithinAudience } from '../../profiles/domain/audience';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { StudentSummary } from './entities/student-summary.entity';

/**
 * Whether `viewer` may see this student's presence (C7). `EVERYONE` is public, `CONNECTIONS` needs
 * an accepted connection, `NOBODY` hides it from everyone — including existing connections.
 */
export function canSeePresence(visibility: LastSeenVisibility, isConnected: boolean): boolean {
  return isWithinAudience(visibility, isConnected);
}

/**
 * Returns the summary with the viewer-dependent fields resolved for one specific reader.
 *
 * Two independent settings are applied here, not one: `lastSeenVisibility` governs
 * `online`/`lastSeenAt`, and `phoneVisibility` governs `phoneNumber`. A student may well publish
 * their presence and not their number, so they are masked separately.
 *
 * Blanking `online` alongside `lastSeenAt` is deliberate: leaking "currently online" would defeat
 * hiding the last-seen time.
 */
export function applyPresenceVisibility(
  student: StudentSummary,
  isConnected: boolean,
  online: boolean,
): StudentSummary {
  const phoneNumber = isWithinAudience(student.phoneVisibility, isConnected)
    ? student.phoneNumber
    : null;
  return canSeePresence(student.lastSeenVisibility, isConnected)
    ? { ...student, online, phoneNumber }
    : { ...student, online: false, lastSeenAt: null, phoneNumber };
}
