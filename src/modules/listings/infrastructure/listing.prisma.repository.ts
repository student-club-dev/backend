import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Listing } from '../domain/entities/listing.entity';
import { CreateListingData, ListingRepository } from '../domain/listing.repository';
import { LISTING_INCLUDE, ListingMapper } from './listing.mapper';

/** Prisma implementation of the listing repository port. Prisma is used ONLY here. */
@Injectable()
export class ListingPrismaRepository implements ListingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists the whole aggregate — listing, its ListingBranch associations, option groups and their
   * options — in one transaction via a single nested `create`, then reads it back with its relations.
   */
  async create(data: CreateListingData): Promise<Listing> {
    const row = await this.prisma.$transaction((tx) =>
      tx.listing.create({ data: ListingMapper.toCreateData(data), include: LISTING_INCLUDE }),
    );
    return ListingMapper.toDomain(row);
  }
}
