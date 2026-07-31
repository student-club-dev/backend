/**
 * The three audiences every "who may see this" switch on a profile offers. Both
 * `LastSeenVisibility` and `PhoneVisibility` are assignable to it, which is the point: the settings
 * are separate, the rule that resolves them is not.
 */
export type Audience = 'EVERYONE' | 'CONNECTIONS' | 'NOBODY';

/**
 * Whether a viewer falls inside `audience`. One function for every such setting — presence today,
 * phone number now, whatever comes next — so a change to what "CONNECTIONS" means cannot apply to
 * one field and miss another.
 */
export function isWithinAudience(audience: Audience, isConnected: boolean): boolean {
  switch (audience) {
    case 'EVERYONE':
      return true;
    case 'CONNECTIONS':
      return isConnected;
    case 'NOBODY':
      return false;
  }
}
