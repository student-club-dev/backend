import { BusinessStatus } from '../enums/business-status.enum';

/** Social/contact links for a business (stored as the `contacts` JSONB column). */
export interface BusinessContacts {
  telegram: string | null;
  instagram: string | null;
  website: string | null;
}

/**
 * A business owned by a business-owner account. Pure domain type — the presentation layer
 * projects it to BusinessDto and the infrastructure layer maps it from the Prisma row.
 */
export interface Business {
  id: string;
  ownerId: string;
  type: string;
  name: string;
  legalName: string | null;
  inn: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string;
  contacts: BusinessContacts | null;
  isOnlineOnly: boolean;
  status: BusinessStatus;
  rejectionReason: string | null;
  rating: number | null;
  reviewsCount: number;
  listingsCount: number;
  createdAt: Date;
}
