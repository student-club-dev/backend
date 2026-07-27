import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { FavoritesRepository } from '../domain/favorites.repository';
import { VISIBLE_LISTING } from './visible-scope.sql';

/** Prisma implementation of the favorites port. Prisma is used ONLY here. */
@Injectable()
export class FavoritesPrismaRepository implements FavoritesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isListingVisible(listingId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ visible: number }[]>(Prisma.sql`
      SELECT 1 AS visible
      FROM listings l
      JOIN businesses b ON b.id = l.business_id
      WHERE l.id = ${listingId}
        AND ${VISIBLE_LISTING}
      LIMIT 1
    `);
    return rows.length > 0;
  }

  /**
   * `createMany` + `skipDuplicates` compiles to `INSERT ... ON CONFLICT DO NOTHING`, so a double
   * tap is idempotent in a single statement — an upsert would still race two concurrent requests
   * into a primary-key violation.
   */
  async add(studentId: string, listingId: string): Promise<void> {
    await this.prisma.studentFavorite.createMany({
      data: [{ studentId, listingId }],
      skipDuplicates: true,
    });
  }

  /** `deleteMany` rather than `delete`: removing a row that is not there must not throw. */
  async remove(studentId: string, listingId: string): Promise<void> {
    await this.prisma.studentFavorite.deleteMany({ where: { studentId, listingId } });
  }
}
