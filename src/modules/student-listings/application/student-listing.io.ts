import type {
  ListingOptionGroup,
  StudentListingDetails,
} from '../domain/entities/student-listing.entity';
import { ListingAudience } from '../domain/enums/listing-audience.enum';
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';
import { StudentPriceUnit } from '../domain/enums/student-price-unit.enum';
import type { StudentListingBranchData } from '../domain/student-listing.repository';

/**
 * What the controller hands the service on create. Wire concerns (ISO strings, absent keys) are
 * already resolved by the DTO, so everything here is a domain type with an explicit value —
 * `null` means "the student left it blank", which a DRAFT is allowed to do.
 */
export interface CreateListingInput {
  kind: StudentListingKind;
  /** True publishes immediately; false or absent leaves a DRAFT (§7.1). */
  submit: boolean;
  title: string;
  description: string | null;
  images: string[];
  priceUnit: StudentPriceUnit | null;
  price: number;
  priceMax: number | null;
  isNegotiable: boolean;
  contactPhone: string | null;
  universityId: string | null;
  audience: ListingAudience;
  branches: StudentListingBranchData[];
  validFrom: Date | null;
  validTo: Date | null;
  attributes: Record<string, string>;
  optionGroups: ListingOptionGroup[];
  details: StudentListingDetails;
}

/**
 * A partial edit. `kind` is accepted rather than stripped so a client trying to change it gets a
 * clear 409 instead of a silently ignored field.
 */
export type PatchListingInput = Partial<Omit<CreateListingInput, 'submit'>>;
