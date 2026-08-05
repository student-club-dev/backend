import { Business, BusinessContacts } from './entities/business.entity';
import { BusinessStatus } from './enums/business-status.enum';

/** Injection token for the business repository port (bound to the Prisma impl in the module). */
export const BUSINESS_REPOSITORY = Symbol('BUSINESS_REPOSITORY');

/** Fields set when a business is created. `status` and `ownerId` are set by the service. */
export interface CreateBusinessData {
  ownerId: string;
  status: BusinessStatus;
  type: string;
  name: string;
  phone: string;
  legalName: string | null;
  inn: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  contacts: BusinessContacts | null;
  isOnlineOnly: boolean;
}

/** Partial update — only the present keys are written (`type` is never updatable). */
export interface UpdateBusinessData {
  name?: string;
  phone?: string;
  legalName?: string;
  inn?: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  contacts?: BusinessContacts;
  isOnlineOnly?: boolean;
}

/**
 * Business data-access port. The application layer depends on this interface only; the Prisma
 * implementation lives in infrastructure. Archived businesses are soft-deleted — excluded from
 * {@link findManyByOwner} but still returned by {@link findById} so the service can 404 them.
 */
export interface BusinessRepository {
  create(data: CreateBusinessData): Promise<Business>;
  /** By id, regardless of status (the service decides how to treat ARCHIVED). Null if missing. */
  findById(id: string): Promise<Business | null>;
  /** The owner's non-archived businesses, newest first. */
  findManyByOwner(ownerId: string): Promise<Business[]>;
  update(id: string, data: UpdateBusinessData): Promise<Business>;
  /** Soft-delete: set the business to ARCHIVED and cascade all its listings to ARCHIVED. */
  archive(id: string): Promise<void>;

  /**
   * Sets the status and `rejectionReason` together (owner submit, admin approve, admin reject).
   * The service decides and validates the target status; the repository only persists it. The two
   * always move as a pair — an approval that left a stale reason behind would keep showing the old
   * verdict on a live business.
   */
  setStatus(id: string, status: BusinessStatus, rejectionReason: string | null): Promise<Business>;
}
