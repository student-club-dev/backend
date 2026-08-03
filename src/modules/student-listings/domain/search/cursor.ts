import { createHash } from 'node:crypto';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { SearchCriteria } from './search-criteria';

/** Where the last page stopped: the sort key's value plus the id that broke its ties. */
export interface CursorPosition {
  sortValue: string | number | null;
  id: string;
}

interface CursorPayload extends CursorPosition {
  /** Fingerprint of the query this position belongs to. */
  h: string;
}

/**
 * A fingerprint of everything that changes the result set or its order — but not of the page
 * position itself.
 *
 * Paging by offset breaks under an infinite scroll: a listing published while the student reads
 * shifts every later row, so they see one twice and miss another. A cursor fixes that, but only
 * while the query is unchanged. Comparing this hash is how a stale cursor is caught instead of
 * silently returning rows from a different query.
 */
export function filterHashOf(criteria: SearchCriteria): string {
  const material = JSON.stringify({
    kind: criteria.kind,
    query: criteria.query,
    geo: criteria.geo,
    minPrice: criteria.minPrice,
    maxPrice: criteria.maxPrice,
    filter: criteria.filter,
    sort: criteria.sort,
    viewerId: criteria.viewerId,
  });
  return createHash('sha256').update(material).digest('base64url').slice(0, 16);
}

export function encodeCursor(position: CursorPosition, filterHash: string): string {
  const payload: CursorPayload = { ...position, h: filterHash };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Reads a cursor, or throws `422 PAGE_CURSOR_INVALID` so the app restarts from the first page.
 *
 * Every failure is the same error on purpose: a tampered token and a stale one are equally
 * unusable, and telling them apart would only help someone probing the format.
 */
export function decodeCursor(token: string, expectedHash: string): CursorPosition {
  const payload = parse(token);
  if (payload === null || payload.h !== expectedHash) {
    throw invalidCursor();
  }
  return { sortValue: payload.sortValue, id: payload.id };
}

function parse(token: string): CursorPayload | null {
  if (token.length === 0) {
    return null;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    // Not base64, or not JSON — either way there is no position to resume from.
    return null;
  }
  if (typeof decoded !== 'object' || decoded === null) {
    return null;
  }
  const candidate = decoded as Record<string, unknown>;
  const { id, h, sortValue } = candidate;
  if (typeof id !== 'string' || typeof h !== 'string') {
    return null;
  }
  if (sortValue !== null && typeof sortValue !== 'string' && typeof sortValue !== 'number') {
    return null;
  }
  return { id, h, sortValue };
}

function invalidCursor(): AppException {
  return new AppException(
    ERROR_CODE.PAGE_CURSOR_INVALID,
    422,
    'Ro‘yxat yangilandi — boshidan boshlang',
  );
}
