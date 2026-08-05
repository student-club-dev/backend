/** Injection token for the call lookup used when validating a report. */
export const CALL_DIRECTORY = Symbol('CALL_DIRECTORY');

/**
 * Just enough of the calls table to check a complaint (calls spec §14).
 *
 * A narrow read rather than an import of the calls module, matching `MESSAGE_DIRECTORY` next to it:
 * reports needs one boolean, and reaching for a whole module to get it would couple the abuse queue
 * to the call lifecycle.
 */
export interface CallDirectoryRepository {
  /**
   * Whether this student was on this call.
   *
   * Both the existence check and the authorisation check, deliberately in one question: a call the
   * reporter was not part of is not theirs to complain about, and answering "no such call" for it
   * also stops the endpoint being used to probe which call ids exist.
   */
  wasParticipant(callId: string, studentId: string): Promise<boolean>;
}
