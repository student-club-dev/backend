import {
  Prisma,
  BusinessStatus as PrismaBusinessStatus,
  type Business as BusinessRow,
} from '@prisma/client';
import type { CreateBusinessData, UpdateBusinessData } from '../domain/business.repository';
import { Business, BusinessContacts } from '../domain/entities/business.entity';
import { BusinessStatus } from '../domain/enums/business-status.enum';

/**
 * Maps between the Business Prisma row and the domain entity. The Prisma `BusinessStatus` enum
 * carries the same wire values as the domain enum (looked up by key), and the `contacts` JSONB
 * column is normalised to a typed {@link BusinessContacts} both ways.
 */
export class BusinessMapper {
  static toDomain(row: BusinessRow): Business {
    return {
      id: row.id,
      ownerId: row.ownerId,
      type: row.type,
      name: row.name,
      legalName: row.legalName,
      inn: row.inn,
      description: row.description,
      logoUrl: row.logoUrl,
      coverUrl: row.coverUrl,
      phone: row.phone,
      contacts: toContacts(row.contacts),
      isOnlineOnly: row.isOnlineOnly,
      status: BusinessStatus[row.status],
      rejectionReason: row.rejectionReason,
      rating: row.rating,
      reviewsCount: row.reviewsCount,
      listingsCount: row.listingsCount,
      createdAt: row.createdAt,
    };
  }

  static toCreateData(data: CreateBusinessData): Prisma.BusinessUncheckedCreateInput {
    return {
      ownerId: data.ownerId,
      status: PrismaBusinessStatus[data.status],
      type: data.type,
      name: data.name,
      phone: data.phone,
      legalName: data.legalName,
      inn: data.inn,
      description: data.description,
      logoUrl: data.logoUrl,
      coverUrl: data.coverUrl,
      contacts: contactsToJson(data.contacts),
      isOnlineOnly: data.isOnlineOnly,
    };
  }

  /** Status and verdict always move together — an approval must clear a stale rejection reason. */
  static toStatusData(
    status: BusinessStatus,
    rejectionReason: string | null,
  ): Prisma.BusinessUpdateInput {
    return { status: PrismaBusinessStatus[status], rejectionReason };
  }

  static toUpdateData(data: UpdateBusinessData): Prisma.BusinessUpdateInput {
    const update: Prisma.BusinessUpdateInput = {};
    if (data.name !== undefined) {
      update.name = data.name;
    }
    if (data.phone !== undefined) {
      update.phone = data.phone;
    }
    if (data.legalName !== undefined) {
      update.legalName = data.legalName;
    }
    if (data.inn !== undefined) {
      update.inn = data.inn;
    }
    if (data.description !== undefined) {
      update.description = data.description;
    }
    if (data.logoUrl !== undefined) {
      update.logoUrl = data.logoUrl;
    }
    if (data.coverUrl !== undefined) {
      update.coverUrl = data.coverUrl;
    }
    if (data.contacts !== undefined) {
      update.contacts = contactsToJson(data.contacts);
    }
    if (data.isOnlineOnly !== undefined) {
      update.isOnlineOnly = data.isOnlineOnly;
    }
    return update;
  }
}

/** Reads the JSONB `contacts` column into a typed value; unknown/absent shapes become null. */
function toContacts(value: Prisma.JsonValue | null): BusinessContacts | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  return {
    telegram: typeof obj.telegram === 'string' ? obj.telegram : null,
    instagram: typeof obj.instagram === 'string' ? obj.instagram : null,
    website: typeof obj.website === 'string' ? obj.website : null,
  };
}

/** Serialises typed contacts to the JSONB column; `null` leaves the column untouched/absent. */
function contactsToJson(contacts: BusinessContacts | null): Prisma.InputJsonValue | undefined {
  if (contacts === null) {
    return undefined;
  }
  return { telegram: contacts.telegram, instagram: contacts.instagram, website: contacts.website };
}
