import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { CATALOG_REPOSITORY, CatalogRepository } from '../domain/catalog.repository';
import { BusinessType } from '../domain/entities/business-type.entity';
import { Category } from '../domain/entities/category.entity';
import { TypeAttributeSchema } from '../domain/entities/type-attribute-schema.entity';
import { Gender } from '../domain/enums/gender.enum';

/**
 * Catalog use-cases. Serves static reference data (business types, categories, fields)
 * and applies the gender personalisation rules. Depends on the repository interface only.
 */
@Injectable()
export class CatalogService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly catalogRepository: CatalogRepository) {}

  /**
   * Business types, personalised by gender: a type is included when no gender is given,
   * or the given gender is in the type's `availableForGenders`
   * (MALE excludes BEAUTY_SALON, FEMALE excludes BARBERSHOP).
   */
  async getBusinessTypes(gender: Gender | null): Promise<BusinessType[]> {
    const types = await this.catalogRepository.findBusinessTypes();
    if (gender === null) {
      return types;
    }
    return types.filter((type) => type.availableForGenders.includes(gender));
  }

  /**
   * Every attribute field defined for a business type — the schema a client builds the listing
   * form from without hardcoding it (§5.1). Unknown type → 404, matching {@link getCategories}.
   */
  async getAttributesSchema(type: string): Promise<TypeAttributeSchema> {
    const schema = await this.catalogRepository.findTypeAttributeSchema(type);
    if (schema === null) {
      throw AppException.notFound(ERROR_CODE.NOT_FOUND, 'Biznes turi topilmadi');
    }
    return schema;
  }

  /**
   * Categories for a business type: the base list (gender = null) plus, when a gender is
   * given, the matching per-gender list (CLOTHING). Unknown type → 404.
   */
  async getCategories(type: string, gender: Gender | null): Promise<Category[]> {
    const categories = await this.catalogRepository.findCategoriesByType(type);
    if (categories === null) {
      throw AppException.notFound(ERROR_CODE.NOT_FOUND, 'Biznes turi topilmadi');
    }
    return categories.filter(
      (category) => category.gender === null || (gender !== null && category.gender === gender),
    );
  }
}
