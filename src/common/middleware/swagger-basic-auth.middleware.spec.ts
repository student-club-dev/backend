import type { NextFunction, Request, Response } from 'express';
import { swaggerBasicAuth } from './swagger-basic-auth.middleware';

describe('swaggerBasicAuth', () => {
  const middleware = swaggerBasicAuth('admin', 's3cret');

  const run = (authorization?: string): { next: jest.Mock; res: Response } => {
    const next = jest.fn() as unknown as NextFunction & jest.Mock;
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as Response;
    const req = { headers: authorization ? { authorization } : {} } as Request;
    middleware(req, res, next);
    return { next, res };
  };

  const basic = (user: string, password: string): string =>
    'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');

  it('calls next() when the credentials match', () => {
    const { next, res } = run(basic('admin', 's3cret'));
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('challenges with 401 + WWW-Authenticate when the header is missing', () => {
    const { next, res } = run(undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('Basic'),
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a wrong password', () => {
    const { next, res } = run(basic('admin', 'wrong'));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a wrong user', () => {
    const { next, res } = run(basic('root', 's3cret'));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a non-Basic scheme', () => {
    const { next, res } = run('Bearer sometoken');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
