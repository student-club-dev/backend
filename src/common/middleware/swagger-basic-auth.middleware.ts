import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Constant-time equality that does not leak the length difference via timing. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Run a compare anyway so a length mismatch costs the same time as a value mismatch.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * HTTP Basic auth for the Swagger routes. Swagger's UI and JSON are registered by SwaggerModule at
 * the Express level — outside Nest's guards/interceptors — so they are gated with a plain Express
 * middleware mounted on the docs path. On failure it returns a raw 401 with `WWW-Authenticate` so
 * the browser shows its native login dialog (the global BaseResponse envelope only wraps Nest routes).
 */
export function swaggerBasicAuth(user: string, password: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const suppliedUser = separator === -1 ? decoded : decoded.slice(0, separator);
      const suppliedPassword = separator === -1 ? '' : decoded.slice(separator + 1);
      if (safeEqual(suppliedUser, user) && safeEqual(suppliedPassword, password)) {
        next();
        return;
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="ElonUz API docs", charset="UTF-8"');
    res.status(401).send('Authentication required.');
  };
}
