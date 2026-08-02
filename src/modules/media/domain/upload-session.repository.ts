import { NewUploadSession, UploadSession } from './entities/upload-session.entity';

/** Injection token for the upload-session port (bound to the Prisma impl in the module). */
export const UPLOAD_SESSION_REPOSITORY = Symbol('UPLOAD_SESSION_REPOSITORY');

export interface UploadSessionRepository {
  create(session: NewUploadSession): Promise<UploadSession>;

  findById(id: string): Promise<UploadSession | null>;

  /**
   * How many sessions this student currently has open.
   *
   * Bounds the fan-out: each session is capped at its own promised size, so without a limit on how
   * many there are, that cap bounds nothing in aggregate.
   */
  countOpen(ownerId: string, now: Date): Promise<number>;

  delete(id: string): Promise<void>;

  /** Sessions past their expiry — the sweep, which removes the parts on disk with them. */
  findExpired(now: Date, limit: number): Promise<UploadSession[]>;
}
