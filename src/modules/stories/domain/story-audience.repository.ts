/** Injection token for the social-graph read stories are gated on. */
export const STORY_AUDIENCE = Symbol('STORY_AUDIENCE');

/**
 * Who may see a student's stories.
 *
 * Deliberately the same gate as chat: a story is visible to your connections and to nobody else, and
 * a block hides it in both directions. Declared as its own port so the stories module states the
 * question in its own words — the binding in `StoriesModule` points it at the one implementation
 * that already answers it, rather than at a second copy that could drift.
 */
export interface StoryAudienceRepository {
  /** True iff an ACCEPTED connection exists between the pair and neither has blocked the other. */
  areConnected(a: string, b: string): Promise<boolean>;

  /** Every student this one is connected to (accepted, not blocked) — the feed's author set. */
  connectedIds(studentId: string): Promise<string[]>;
}
