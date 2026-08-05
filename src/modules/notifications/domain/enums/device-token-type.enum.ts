/**
 * Which channel a device token belongs to (calls spec §7.3).
 *
 * ⚠️ `APNS_VOIP` is not "APNs with a flag" — it is a **separate channel with a rule attached**. iOS
 * requires an app woken by a VoIP push to report an incoming call to CallKit *immediately*; an app
 * that does not is killed, and after a few such kills the system stops delivering VoIP pushes to
 * that device **entirely**. One "just testing" message sent down this channel can therefore end a
 * user's ability to receive calls at all.
 *
 * That is the whole reason token type is stored rather than inferred from `platform`: an iPhone has
 * two tokens, and only calls may use the second one.
 */
export enum DeviceTokenType {
  FCM = 'FCM',
  APNS = 'APNS',
  APNS_VOIP = 'APNS_VOIP',
}
