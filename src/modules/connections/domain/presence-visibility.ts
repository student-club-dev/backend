import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { StudentSummary } from './entities/student-summary.entity';

/**
 * Whether `viewer` may see this student's presence (C7). `EVERYONE` is public, `CONNECTIONS` needs
 * an accepted connection, `NOBODY` hides it from everyone — including existing connections.
 */
export function canSeePresence(visibility: LastSeenVisibility, isConnected: boolean): boolean {
  switch (visibility) {
    case LastSeenVisibility.EVERYONE:
      return true;
    case LastSeenVisibility.CONNECTIONS:
      return isConnected;
    case LastSeenVisibility.NOBODY:
      return false;
  }
}

/**
 * Returns the summary with presence filled in for one specific viewer: `online` from live presence,
 * `lastSeenAt` from the stored value — both blanked when the viewer may not see them. Blanking
 * `online` too is deliberate: leaking "currently online" would defeat hiding the last-seen time.
 */
export function applyPresenceVisibility(
  student: StudentSummary,
  isConnected: boolean,
  online: boolean,
): StudentSummary {
  return canSeePresence(student.lastSeenVisibility, isConnected)
    ? { ...student, online }
    : { ...student, online: false, lastSeenAt: null };
}
