import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE, type ErrorCode } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../catalog/domain/catalog.repository';
import { SUGGEST_REPOSITORY, SuggestRepository } from '../domain/suggest.repository';
import { Suggestion, SuggestionKind } from '../domain/suggestion.model';

/** Below this, autocomplete is noise: two characters match almost anything. */
const MIN_TERM_LENGTH = 2;

/**
 * Kind ranking (STUDENT_FEED.md §9). A category or a type turns into an exact filter over many
 * listings, so it is worth more than the single listing a LISTING suggestion opens.
 */
const KIND_PRIORITY: Record<SuggestionKind, number> = {
  CATEGORY: 1,
  TYPE: 2,
  BUSINESS: 3,
  LISTING: 4,
};

/** What the client typed, and the scope it is typing inside. */
export interface SuggestRequest {
  query: string;
  groupKeys: string[];
  types: string[];
  limit: number;
}

/**
 * Search autocomplete (STUDENT_FEED.md §9). The client sends the picked suggestion back as an exact
 * filter rather than as text, so precision beats recall: every suggestion is scoped to the types the
 * user is browsing and is backed by at least one visible listing.
 */
@Injectable()
export class SuggestService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(SUGGEST_REPOSITORY) private readonly suggestions: SuggestRepository,
  ) {}

  async suggest(request: SuggestRequest): Promise<Suggestion[]> {
    const types = await this.resolveTypes(request.groupKeys, request.types);

    // Too short is not an error — the client queries on every keystroke and would otherwise get a
    // 422 for the first letter typed.
    const term = request.query.trim();
    if (term.length < MIN_TERM_LENGTH) {
      return [];
    }

    const candidates = await this.suggestions.findCandidates({
      term,
      types,
      limit: request.limit,
    });

    return candidates
      .filter((suggestion) => suggestion.count > 0)
      .sort(byKindThenCount)
      .slice(0, request.limit);
  }

  /**
   * `groupKeys` expand to their member types; explicit `types` narrow that expansion, or stand on
   * their own when no group is given. A key the catalog does not know is a client bug, not an empty
   * result — hence 422 rather than a silent empty list (Q3).
   */
  private async resolveTypes(groupKeys: string[], types: string[]): Promise<string[]> {
    if (groupKeys.length === 0 && types.length === 0) {
      throw invalidRequest(ERROR_CODE.TYPE_REQUIRED, 'Avval yo‘nalish yoki turni tanlang', {
        types: 'Kamida bitta guruh yoki tur tanlanishi kerak',
      });
    }

    const groups = await this.catalog.findGroups();
    const unknownGroups = groupKeys.filter((key) => !groups.some((group) => group.key === key));
    if (unknownGroups.length > 0) {
      throw invalidRequest(ERROR_CODE.UNKNOWN_GROUP, 'Noma’lum katalog guruhi', {
        groupKeys: `Katalogda bunday guruh yo‘q: ${unknownGroups.join(', ')}`,
      });
    }

    const known = groups.flatMap((group) => group.typeKeys);
    const unknownTypes = types.filter((type) => !known.includes(type));
    if (unknownTypes.length > 0) {
      throw invalidRequest(ERROR_CODE.UNKNOWN_TYPE, 'Noma’lum biznes turi', {
        types: `Katalogda bunday tur yo‘q: ${unknownTypes.join(', ')}`,
      });
    }

    if (groupKeys.length === 0) {
      return unique(types);
    }

    const expanded = groups
      .filter((group) => groupKeys.includes(group.key))
      .flatMap((group) => group.typeKeys);
    if (types.length === 0) {
      return unique(expanded);
    }

    const outside = types.filter((type) => !expanded.includes(type));
    if (outside.length > 0) {
      throw invalidRequest(ERROR_CODE.TYPE_GROUP_MISMATCH, 'Tur va guruh mos kelmadi', {
        types: `Tanlangan guruhlarga kirmaydigan tur: ${outside.join(', ')}`,
      });
    }
    return unique(types);
  }
}

/**
 * A 422 with a code more specific than VALIDATION_ERROR (D4 allows these); `fields` is always
 * filled so the client can point at the offending input.
 */
function invalidRequest(
  code: ErrorCode,
  message: string,
  fields: Record<string, string>,
): AppException {
  return new AppException(code, 422, message, fields);
}

/** Kind first, then the widest result set — a suggestion's count is how much it opens up. */
function byKindThenCount(a: Suggestion, b: Suggestion): number {
  if (KIND_PRIORITY[a.kind] !== KIND_PRIORITY[b.kind]) {
    return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
  }
  if (a.count !== b.count) {
    return b.count - a.count;
  }
  return a.label.localeCompare(b.label);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
