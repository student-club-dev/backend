import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_REPOSITORY, CatalogRepository, GeoScope } from '../domain/catalog.repository';
import { Gender } from '../domain/enums/gender.enum';
import { BusinessTypeWithCounts, CatalogGroupWithCounts } from './catalog-counts.model';

/**
 * Catalog group use-cases for the student feed (STUDENT_FEED.md §3).
 *
 * Counts are always computed over ALL visible listings — gender only ever narrows the *list* of
 * types, never the numbers (D16). That is what keeps a group's total equal to the sum of its
 * types' totals no matter who is asking.
 */
@Injectable()
export class CatalogGroupsService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly catalogRepository: CatalogRepository) {}

  /** The 8 groups with their type and visible-listing counts. Empty groups are kept. */
  async getGroups(geo: GeoScope | null): Promise<CatalogGroupWithCounts[]> {
    const [groups, listingCounts] = await Promise.all([
      this.catalogRepository.findGroups(),
      this.catalogRepository.countVisibleListingsByType(geo),
    ]);

    return groups.map((group) => ({
      ...group,
      typesCount: group.typeKeys.length,
      listingsCount: group.typeKeys.reduce(
        (total, typeKey) => total + (listingCounts.get(typeKey) ?? 0),
        0,
      ),
    }));
  }

  /**
   * Types belonging to `groupKeys`. `gender` narrows the list (MALE hides BEAUTY_SALON,
   * FEMALE hides BARBERSHOP) but leaves every count untouched.
   */
  async getTypes(
    groupKeys: string[],
    gender: Gender | null,
    geo: GeoScope | null,
  ): Promise<BusinessTypeWithCounts[]> {
    const [types, listingCounts, categoryCounts] = await Promise.all([
      this.catalogRepository.findBusinessTypesByGroups(groupKeys),
      this.catalogRepository.countVisibleListingsByType(geo),
      this.catalogRepository.countCategoriesByType(),
    ]);

    const visible =
      gender === null ? types : types.filter((type) => type.availableForGenders.includes(gender));

    return visible.map((type) => ({
      ...type,
      categoriesCount: categoryCounts.get(type.type) ?? 0,
      listingsCount: listingCounts.get(type.type) ?? 0,
    }));
  }
}
