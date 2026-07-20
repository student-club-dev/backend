import { Branch, BranchLocation, DeliveryZone, WorkingHours } from './entities/branch.entity';

/** Injection token for the branch repository port (bound to the Prisma impl in the module). */
export const BRANCH_REPOSITORY = Symbol('BRANCH_REPOSITORY');

/** Fields set when a branch is created. `businessId` is supplied by the service from the route. */
export interface CreateBranchData {
  businessId: string;
  name: string;
  phone: string | null;
  location: BranchLocation;
  workingHours: WorkingHours[];
  deliveryZone: DeliveryZone | null;
  isActive: boolean;
}

/** Full replace of a branch (PUT semantics — BranchRequestDto has no partial variant). */
export interface UpdateBranchData {
  name: string;
  phone: string | null;
  location: BranchLocation;
  workingHours: WorkingHours[];
  deliveryZone: DeliveryZone | null;
  isActive: boolean;
}

/**
 * Branch data-access port. The application layer depends on this interface only; the Prisma
 * implementation lives in infrastructure. Branches are hard-deleted (no status column).
 */
export interface BranchRepository {
  create(data: CreateBranchData): Promise<Branch>;
  /** By id, regardless of owning business. Null if missing. */
  findById(id: string): Promise<Branch | null>;
  /** All branches of a business, newest first. */
  findManyByBusiness(businessId: string): Promise<Branch[]>;
  update(id: string, data: UpdateBranchData): Promise<Branch>;
  /** Hard-delete the branch. */
  delete(id: string): Promise<void>;
  /**
   * Whether the business already has a branch within `radiusMeters` of the given point (PostGIS
   * `ST_DWithin`). `excludeBranchId` skips the branch being updated. Used to reject duplicates.
   */
  existsWithinRadius(
    businessId: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    excludeBranchId?: string,
  ): Promise<boolean>;
}
