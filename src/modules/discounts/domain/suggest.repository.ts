import { Suggestion, SuggestQuery } from './suggestion.model';

/** Injection token for the suggest repository port (bound to the Prisma impl in the module). */
export const SUGGEST_REPOSITORY = Symbol('SUGGEST_REPOSITORY');

/**
 * Autocomplete lookup over the visible listings. The application layer depends on this interface
 * only; the matching SQL lives in the infrastructure layer.
 */
export interface SuggestRepository {
  /**
   * Matching suggestions, at most `limit` per kind, each already carrying its visible-listing
   * count. Ranking across kinds is the service's job — having the top `limit` of every kind is
   * enough for it to pick the global top `limit`.
   */
  findCandidates(query: SuggestQuery): Promise<Suggestion[]>;
}
