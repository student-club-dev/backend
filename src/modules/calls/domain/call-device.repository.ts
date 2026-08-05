/** Injection token for the call-push device lookup. */
export const CALL_DEVICE_DIRECTORY = Symbol('CALL_DEVICE_DIRECTORY');

/** One device a call may ring. */
export interface CallDevice {
  id: string;
  token: string;
  /** iOS only — which of Apple's two hosts accepted this token, `null` until one has. */
  apnsEnv: 'PRODUCTION' | 'SANDBOX' | null;
}

/**
 * The devices to ring, by channel (calls spec §7.3).
 *
 * Read directly rather than through the notifications module, for the same reason
 * `ConversationDirectoryRepository` exists: chat already imports calls, so calls cannot import its
 * way back without a cycle. The query is narrow — two columns of `device_tokens` filtered by type.
 */
export interface CallDeviceDirectoryRepository {
  /** PushKit tokens: the only channel that can ring a **closed** iPhone. */
  voipTokensFor(studentId: string): Promise<CallDevice[]>;

  /** FCM tokens, for the Android data-push that wakes the app. */
  androidTokensFor(studentId: string): Promise<CallDevice[]>;

  /** Removes tokens the provider reported permanently dead, so they are not retried forever. */
  removeDead(tokens: string[]): Promise<void>;
}
