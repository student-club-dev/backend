import { BusinessContacts } from '../domain/entities/business.entity';

/** Normalised create payload (from CreateBusinessRequestDto). Absent optionals are `null`. */
export interface CreateBusinessInput {
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

/**
 * Normalised partial update (from UpdateBusinessRequestDto). Absent fields are left unchanged.
 * `type` is carried only so the service can reject an attempt to change it (BUSINESS_TYPE_IMMUTABLE).
 */
export interface UpdateBusinessInput {
  type?: string;
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
