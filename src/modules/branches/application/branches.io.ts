import {
  BranchLocation,
  BranchTradeCenterFieldInput,
  DeliveryZone,
  WorkingHours,
} from '../domain/entities/branch.entity';

/**
 * Normalised branch payload (from BranchRequestDto). Used for both create and update — the spec
 * has a single BranchRequestDto with PUT (full-replace) semantics. Absent optionals are `null`.
 */
export interface BranchInput {
  name: string;
  phone: string | null;
  location: BranchLocation;
  workingHours: WorkingHours[];
  deliveryZone: DeliveryZone | null;
  isActive: boolean;
  /** Null when the branch is not in a trade center; `tradeCenterFields` is then ignored. */
  tradeCenterId: string | null;
  /** Submitted trade-center field values (validated in the service). */
  tradeCenterFields: BranchTradeCenterFieldInput[];
}
