/**
 * BaseResponse — the single response envelope every endpoint returns
 * (success and error alike). Fixed by the generated mobile client — do not change shape.
 * See CLAUDE.md "API Contract & Response Envelope".
 */
export interface ApiError {
  code: string | null;
  message: string | null;
  fields: Record<string, string>;
}

export interface BaseResponse<T = unknown> {
  success: boolean;
  status: number;
  code: string | null;
  message: string | null;
  result: T | null;
  error: ApiError | null;
}

/** Paginated payload shape carried inside `result`. Keys are fixed: items/page/size/total/hasNext. */
export interface PaginatedResult<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export function successResponse<T>(
  result: T,
  status = 200,
  message: string | null = 'OK',
): BaseResponse<T> {
  return { success: true, status, code: null, message, result: result ?? null, error: null };
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  fields: Record<string, string> = {},
): BaseResponse<null> {
  return { success: false, status, code, message, result: null, error: { code, message, fields } };
}
