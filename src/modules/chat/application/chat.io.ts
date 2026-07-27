/** A page of application results plus the unpaginated total (the controller derives `hasNext`). */
export interface Page<T> {
  items: T[];
  total: number;
}

/** Deterministic key for the DIRECT conversation of a pair — order-independent (C3). */
export function directKeyOf(a: string, b: string): string {
  return [a, b].sort().join(':');
}
