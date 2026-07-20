/**
 * ElonUz catalog seed.
 *
 * Loads docs/api/provider/catalog-seed.json into the catalog tables:
 *   - BusinessTypeInfo (7 types)      -> upsert by `type` (PK; referenced by FKs)
 *   - Category (base + per-gender)    -> deleteMany + createMany (nullable `gender` in the
 *                                        unique key makes upsert unreliable, so replace wholesale)
 *   - AttributeSpec (type + category) -> deleteMany + createMany (nullable `categoryKey` — same reason)
 *   - Region / District               -> only if present in the JSON (currently absent -> skipped)
 *
 * Idempotent: safe to re-run. Everything runs in a single transaction.
 */
import { PrismaClient, Prisma, PriceUnit, Gender, AttributeKind } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// JSON shape (only the fields we read)
// ---------------------------------------------------------------------------
interface SeedBusinessType {
  type: string;
  nameUz: string;
  nameRu?: string;
  emoji?: string;
  accentColor?: string;
  iconUrl?: string;
  defaultPriceUnit: string;
  priceUnits: string[];
  availableForGenders: string[];
  allCategoryLabel?: string;
  optionGroupHint?: string;
}

interface SeedCategory {
  key: string;
  nameUz: string;
  nameRu?: string;
  iconUrl?: string;
  sortOrder: number;
}

interface SeedAttribute {
  key: string;
  label: string;
  kind: string;
  options?: string[];
  hint?: string;
  suffix?: string;
  required?: boolean;
}

interface SeedRegion {
  id: string;
  nameUz: string;
  nameRu?: string;
  centerLat?: number;
  centerLng?: number;
}

interface SeedDistrict {
  id: string;
  regionId: string;
  nameUz: string;
  nameRu?: string;
  centerLat?: number;
  centerLng?: number;
}

interface CatalogSeed {
  version: string;
  constants: Record<string, string>;
  businessTypes: SeedBusinessType[];
  categories: Record<string, SeedCategory[]>;
  categoriesByGender: Record<string, Record<string, SeedCategory[]>>;
  attributes: Record<string, SeedAttribute[]>;
  categoryAttributes: Record<string, Record<string, SeedAttribute[]>>;
  attributeKinds: string[];
  regions?: SeedRegion[];
  districts?: SeedDistrict[];
}

// ---------------------------------------------------------------------------
// Enum mapping — STOP (throw) on any value that has no matching Prisma member.
// ---------------------------------------------------------------------------
function asPriceUnit(value: string): PriceUnit {
  const mapped = (PriceUnit as Record<string, PriceUnit | undefined>)[value];
  if (!mapped) throw new Error(`catalog-seed.json: unknown PriceUnit "${value}"`);
  return mapped;
}

function asGender(value: string): Gender {
  const mapped = (Gender as Record<string, Gender | undefined>)[value];
  if (!mapped) throw new Error(`catalog-seed.json: unknown Gender "${value}"`);
  return mapped;
}

function asAttributeKind(value: string): AttributeKind {
  const mapped = (AttributeKind as Record<string, AttributeKind | undefined>)[value];
  if (!mapped) throw new Error(`catalog-seed.json: unknown AttributeKind "${value}"`);
  return mapped;
}

// The catalog serves options as { value, label }; the seed only provides a flat string,
// so value === label (there is no separate stored value in the source data).
function toOptions(options?: string[]): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!options || options.length === 0) return Prisma.DbNull;
  return options.map((o) => ({ value: o, label: o }));
}

function loadSeed(): CatalogSeed {
  const seedPath = join(__dirname, '..', 'docs', 'api', 'provider', 'catalog-seed.json');
  return JSON.parse(readFileSync(seedPath, 'utf-8')) as CatalogSeed;
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const seed = loadSeed();
  const otherKey = seed.constants.OTHER_KEY ?? 'OTHER';

  // Build Category rows: base list (gender = null) + CLOTHING per-gender lists.
  const categoryRows: Prisma.CategoryCreateManyInput[] = [];
  for (const [businessType, cats] of Object.entries(seed.categories)) {
    for (const c of cats) {
      categoryRows.push({
        businessType,
        gender: null,
        key: c.key,
        nameUz: c.nameUz,
        sortOrder: c.sortOrder,
        requiresCustomName: c.key === otherKey,
      });
    }
  }
  for (const [businessType, byGender] of Object.entries(seed.categoriesByGender)) {
    for (const [genderKey, cats] of Object.entries(byGender)) {
      const gender = asGender(genderKey);
      for (const c of cats) {
        categoryRows.push({
          businessType,
          gender,
          key: c.key,
          nameUz: c.nameUz,
          sortOrder: c.sortOrder,
          requiresCustomName: c.key === otherKey,
        });
      }
    }
  }

  // Build AttributeSpec rows: type-level (categoryKey = null) + category-level.
  // sortOrder = array index (the seed relies on declaration order).
  const attributeRows: Prisma.AttributeSpecCreateManyInput[] = [];
  const pushAttribute = (
    businessType: string,
    categoryKey: string | null,
    field: SeedAttribute,
    index: number,
  ): void => {
    attributeRows.push({
      businessType,
      categoryKey,
      key: field.key,
      label: field.label,
      kind: asAttributeKind(field.kind),
      required: field.required ?? false,
      hint: field.hint ?? null,
      suffix: field.suffix ?? null,
      multiple: null,
      options: toOptions(field.options),
      sortOrder: index,
    });
  };
  for (const [businessType, fields] of Object.entries(seed.attributes)) {
    fields.forEach((f, i) => pushAttribute(businessType, null, f, i));
  }
  for (const [businessType, byCategory] of Object.entries(seed.categoryAttributes)) {
    for (const [categoryKey, fields] of Object.entries(byCategory)) {
      fields.forEach((f, i) => pushAttribute(businessType, categoryKey, f, i));
    }
  }

  const hasGeo = Boolean(seed.regions?.length) || Boolean(seed.districts?.length);

  await prisma.$transaction(async (tx) => {
    // 1. Business types — upsert (PK `type` is referenced by Category/AttributeSpec/Business FKs).
    for (const bt of seed.businessTypes) {
      const data = {
        nameUz: bt.nameUz,
        nameRu: bt.nameRu ?? null,
        emoji: bt.emoji ?? null,
        accentColor: bt.accentColor ?? null,
        iconUrl: bt.iconUrl ?? null,
        defaultPriceUnit: asPriceUnit(bt.defaultPriceUnit),
        priceUnits: bt.priceUnits.map(asPriceUnit),
        availableForGenders: bt.availableForGenders.map(asGender),
        allCategoryLabel: bt.allCategoryLabel ?? null,
        optionGroupHint: bt.optionGroupHint ?? null,
      };
      await tx.businessTypeInfo.upsert({
        where: { type: bt.type },
        create: { type: bt.type, ...data },
        update: data,
      });
    }

    // 2. Categories — replace wholesale (no dependents; nullable gender in the unique key).
    await tx.category.deleteMany();
    await tx.category.createMany({ data: categoryRows });

    // 3. Attribute specs — replace wholesale (nullable categoryKey in the unique key).
    await tx.attributeSpec.deleteMany();
    await tx.attributeSpec.createMany({ data: attributeRows });

    // 4. Geo — only if the JSON carries it. Do NOT invent data.
    if (seed.regions?.length) {
      for (const r of seed.regions) {
        const data = {
          nameUz: r.nameUz,
          nameRu: r.nameRu ?? null,
          centerLat: r.centerLat ?? null,
          centerLng: r.centerLng ?? null,
        };
        await tx.region.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
      }
    }
    if (seed.districts?.length) {
      for (const d of seed.districts) {
        const data = {
          regionId: d.regionId,
          nameUz: d.nameUz,
          nameRu: d.nameRu ?? null,
          centerLat: d.centerLat ?? null,
          centerLng: d.centerLng ?? null,
        };
        await tx.district.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
      }
    }
  });

  // Summary
  const baseCategoryCount = categoryRows.filter((c) => c.gender == null).length;
  const perGenderCategoryCount = categoryRows.length - baseCategoryCount;
  const typeLevelAttrCount = attributeRows.filter((a) => a.categoryKey == null).length;
  const categoryLevelAttrCount = attributeRows.length - typeLevelAttrCount;

  console.log('Catalog seed complete:');
  console.log(`  business types:        ${seed.businessTypes.length}`);
  console.log(`  categories:            ${categoryRows.length} (base ${baseCategoryCount}, per-gender ${perGenderCategoryCount})`);
  console.log(`  attribute specs:       ${attributeRows.length} (type-level ${typeLevelAttrCount}, category-level ${categoryLevelAttrCount})`);
  console.log(`  regions:               ${seed.regions?.length ?? 0}`);
  console.log(`  districts:             ${seed.districts?.length ?? 0}`);
  if (!hasGeo) {
    console.warn('  NOTE: catalog-seed.json has no `regions`/`districts` — geo seed data is absent; skipped. Seed geo separately.');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Catalog seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
