import { Injectable } from '@nestjs/common';
import { DiscountType, ListingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  ExpiringSavedDiscount,
  ExpiringStudentListing,
  ExpiryReminderRepository,
} from '../domain/expiry-reminder.repository';

/** Prisma implementation of the expiry-reminder reads. Prisma is used ONLY here. */
@Injectable()
export class ExpiryReminderPrismaRepository implements ExpiryReminderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `gte: from` as well as `lte: to` is what keeps this bounded. Without a lower edge the query
   * would also return everything that expired months ago and has simply not been swept yet, and
   * the ledger would be the only thing standing between the student and a reminder for each one.
   */
  async findExpiringStudentListings(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<ExpiringStudentListing[]> {
    const rows = await this.prisma.studentListing.findMany({
      where: { status: ListingStatus.ACTIVE, validTo: { gte: from, lte: to } },
      select: { id: true, ownerId: true, title: true, validTo: true },
      orderBy: { validTo: 'asc' },
      take: limit,
    });
    return rows.flatMap((row) =>
      row.validTo === null
        ? []
        : [
            {
              listingId: row.id,
              ownerId: row.ownerId,
              title: row.title,
              validTo: row.validTo,
            },
          ],
    );
  }

  async findExpiringSavedDiscounts(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<ExpiringSavedDiscount[]> {
    const rows = await this.prisma.studentFavorite.findMany({
      where: {
        listing: {
          status: ListingStatus.ACTIVE,
          isDiscount: true,
          validTo: { gte: from, lte: to },
        },
      },
      select: {
        studentId: true,
        listing: {
          select: {
            id: true,
            validTo: true,
            discountType: true,
            discountValue: true,
            business: { select: { name: true } },
          },
        },
      },
      orderBy: { listing: { validTo: 'asc' } },
      take: limit,
    });

    return rows.flatMap((row) =>
      row.listing.validTo === null
        ? []
        : [
            {
              listingId: row.listing.id,
              studentId: row.studentId,
              merchant: row.listing.business.name,
              discount: describeDiscount(row.listing.discountType, row.listing.discountValue),
              validTo: row.listing.validTo,
            },
          ],
    );
  }
}

/**
 * The discount as a person would say it. `discountValue` is a `BigInt` of so'm — integer minor
 * units, never a float — so it is formatted, not arithmetic'd.
 */
function describeDiscount(type: DiscountType, value: bigint): string {
  switch (type) {
    case DiscountType.PERCENT:
      return `${value}% chegirma`;
    case DiscountType.FIXED_AMOUNT:
      return `${formatSom(value)} chegirma`;
    case DiscountType.SPECIAL_PRICE:
      return `${formatSom(value)} maxsus narx`;
    case DiscountType.FREE_ITEM:
      return 'Sovg‘a';
    default: {
      // A new DiscountType fails to compile here rather than silently producing an empty string.
      const unhandled: never = type;
      void unhandled;
      return 'Chegirma';
    }
  }
}

/** Thousands separated with a space, the way prices are written locally. */
function formatSom(value: bigint): string {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so‘m`;
}
