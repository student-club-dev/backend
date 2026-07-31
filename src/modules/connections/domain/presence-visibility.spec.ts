import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { PhoneVisibility } from '../../profiles/domain/enums/phone-visibility.enum';
import { StudentSummary } from './entities/student-summary.entity';
import { applyPresenceVisibility } from './presence-visibility';

function summary(overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id: 'stu-1',
    username: 'ali',
    fullName: 'Ali Valiyev',
    avatarUrl: null,
    photos: [],
    bio: null,
    universityId: null,
    gender: null,
    courseYear: null,
    online: false,
    lastSeenAt: new Date('2026-07-30T10:00:00Z'),
    phoneNumber: '+998901234567',
    lastSeenVisibility: LastSeenVisibility.CONNECTIONS,
    phoneVisibility: PhoneVisibility.NOBODY,
    ...overrides,
  };
}

describe('applyPresenceVisibility', () => {
  describe('phone number', () => {
    it('hides it by default, even from a connection', () => {
      // NOBODY is the default for every existing account: they gave us the number to sign in with.
      expect(applyPresenceVisibility(summary(), true, true).phoneNumber).toBeNull();
    });

    it('shows it to a connection when the setting says CONNECTIONS', () => {
      const student = summary({ phoneVisibility: PhoneVisibility.CONNECTIONS });
      expect(applyPresenceVisibility(student, true, false).phoneNumber).toBe('+998901234567');
      expect(applyPresenceVisibility(student, false, false).phoneNumber).toBeNull();
    });

    it('shows it to a stranger when the setting says EVERYONE', () => {
      const student = summary({ phoneVisibility: PhoneVisibility.EVERYONE });
      expect(applyPresenceVisibility(student, false, false).phoneNumber).toBe('+998901234567');
    });
  });

  describe('the two settings are independent', () => {
    it('shows the phone number while presence stays hidden', () => {
      const student = summary({
        lastSeenVisibility: LastSeenVisibility.NOBODY,
        phoneVisibility: PhoneVisibility.EVERYONE,
      });
      const seen = applyPresenceVisibility(student, true, true);
      expect(seen.phoneNumber).toBe('+998901234567');
      expect(seen.online).toBe(false);
      expect(seen.lastSeenAt).toBeNull();
    });

    it('shows presence while the phone number stays hidden', () => {
      const student = summary({
        lastSeenVisibility: LastSeenVisibility.EVERYONE,
        phoneVisibility: PhoneVisibility.NOBODY,
      });
      const seen = applyPresenceVisibility(student, false, true);
      expect(seen.phoneNumber).toBeNull();
      expect(seen.online).toBe(true);
      expect(seen.lastSeenAt).toEqual(new Date('2026-07-30T10:00:00Z'));
    });
  });

  describe('presence', () => {
    it('blanks online alongside lastSeenAt — leaking one would defeat hiding the other', () => {
      const student = summary({ lastSeenVisibility: LastSeenVisibility.NOBODY });
      const seen = applyPresenceVisibility(student, true, true);
      expect(seen.online).toBe(false);
      expect(seen.lastSeenAt).toBeNull();
    });
  });
});
