/**
 * ElonUz catalog seed.
 *
 * Loads docs/api/provider/catalog-seed.json into the catalog tables:
 *   - CatalogGroup (8 groups)         -> upsert by `key` (must run first — BusinessTypeInfo FK)
 *   - BusinessTypeInfo (27 types)     -> upsert by `type` (PK; referenced by FKs)
 *   - Category (base + per-gender)    -> deleteMany + createMany (nullable `gender` in the
 *                                        unique key makes upsert unreliable, so replace wholesale)
 *   - AttributeSpec (type + category) -> deleteMany + createMany (nullable `categoryKey` — same reason)
 *   - Region (14) / District (210)    -> upsert by id from prisma/data/uz-*.json (regions first — FK)
 *   - TradeCenter (5) + fields        -> upsert center by `slug`; replace its fields wholesale
 *                                        (deleteMany + createMany) so re-running never duplicates
 *
 * Idempotent: safe to re-run. Everything runs in a single transaction.
 */
import {
  PrismaClient,
  Prisma,
  PriceUnit,
  Gender,
  AttributeKind,
  TradeCenterStatus,
  TradeCenterFieldType,
} from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { assertUniqueSlugs, districtSlug, regionSlug } from './geo-slug';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// JSON shape (only the fields we read)
// ---------------------------------------------------------------------------
interface SeedGroup {
  key: string;
  nameUz: string;
  nameRu?: string;
  emoji?: string;
  icon?: string;
  accentColor?: string;
  sortOrder: number;
}

interface SeedBusinessType {
  type: string;
  groupKey: string;
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

// Trade centers (savdo markazlari) — inline data from docs/api/provider/TRADE_CENTERS.md §6.
// Array order defines TradeCenter.sortOrder (0..4); field array order defines field sortOrder.
interface SeedTradeCenterField {
  label: string;
  type: TradeCenterFieldType;
  required: boolean;
}

interface SeedTradeCenter {
  slug: string;
  name: string;
  fields: SeedTradeCenterField[];
}

const TRADE_CENTERS: SeedTradeCenter[] = [
  {
    slug: 'abu-saxiy',
    name: 'Abu Saxiy',
    fields: [
      { label: 'Qator', type: TradeCenterFieldType.TEXT, required: true },
      { label: 'Pavilon', type: TradeCenterFieldType.TEXT, required: true },
      { label: "Do'kon", type: TradeCenterFieldType.TEXT, required: true },
      { label: 'Qavat', type: TradeCenterFieldType.NUMBER, required: false },
    ],
  },
  {
    slug: 'bek-baraka',
    name: 'Bek Baraka',
    fields: [
      { label: 'Blok', type: TradeCenterFieldType.TEXT, required: true },
      { label: 'Qator', type: TradeCenterFieldType.TEXT, required: true },
      { label: "Do'kon", type: TradeCenterFieldType.TEXT, required: true },
    ],
  },
  {
    slug: 'chorsu',
    name: 'Chorsu',
    fields: [
      { label: 'Sektor', type: TradeCenterFieldType.TEXT, required: true },
      { label: 'Rastasi', type: TradeCenterFieldType.TEXT, required: true },
      { label: "Do'kon", type: TradeCenterFieldType.TEXT, required: true },
    ],
  },
  {
    slug: 'ipodrom',
    name: 'Ipodrom',
    fields: [
      { label: 'Qator', type: TradeCenterFieldType.TEXT, required: true },
      { label: "Do'kon", type: TradeCenterFieldType.TEXT, required: true },
    ],
  },
  {
    slug: 'malika',
    name: 'Malika',
    fields: [
      { label: 'Qator', type: TradeCenterFieldType.TEXT, required: true },
      { label: "Do'kon", type: TradeCenterFieldType.TEXT, required: true },
    ],
  },
];

// Raw shapes of the geo data files (prisma/data/uz-*.json). `name_oz`/`soato_id` are ignored
// (no columns); the source `id`/`region_id` numbers are NOT used as PKs — ids are semantic slugs
// derived from `name_uz` (see geo-slug.ts), matching the contract (e.g. TOSHKENT_SHAHRI, CHILONZOR).
interface RawRegion {
  id: number;
  name_uz: string;
  name_ru?: string;
}

interface RawDistrict {
  id: number;
  region_id: number;
  name_uz: string;
  name_ru?: string;
}

interface CatalogSeed {
  version: string;
  constants: Record<string, string>;
  groups: SeedGroup[];
  businessTypes: SeedBusinessType[];
  categories: Record<string, SeedCategory[]>;
  categoriesByGender: Record<string, Record<string, SeedCategory[]>>;
  attributes: Record<string, SeedAttribute[]>;
  categoryAttributes: Record<string, Record<string, SeedAttribute[]>>;
  attributeKinds: string[];
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

// The geo data files are saved with a UTF-8 BOM; strip a leading BOM (U+FEFF) before JSON.parse.
function readJsonBom<T>(filePath: string): T {
  const raw = readFileSync(filePath).toString('utf8').replace(/^﻿/, '');
  return JSON.parse(raw) as T;
}

function loadGeo(): {
  regions: Prisma.RegionCreateManyInput[];
  districts: Prisma.DistrictCreateManyInput[];
} {
  const dataDir = join(__dirname, 'data');
  const rawRegions = readJsonBom<RawRegion[]>(join(dataDir, 'uz-regions.json'));
  const rawDistricts = readJsonBom<RawDistrict[]>(join(dataDir, 'uz-districts.json'));
  const regions = rawRegions.map((r) => ({
    id: regionSlug(r.name_uz),
    nameUz: r.name_uz,
    nameRu: r.name_ru ?? null,
    centerLat: null,
    centerLng: null,
  }));
  // District.regionId FK -> Region.id (slug). Map the source numeric region_id to the region slug.
  const regionSlugByRawId = new Map(rawRegions.map((r) => [r.id, regionSlug(r.name_uz)]));
  const districts = rawDistricts.map((d) => {
    const regionId = regionSlugByRawId.get(d.region_id);
    if (regionId === undefined) {
      throw new Error(`uz-districts.json: "${d.name_uz}" has unknown region_id ${d.region_id}`);
    }
    return {
      id: districtSlug(d.name_uz),
      regionId,
      nameUz: d.name_uz,
      nameRu: d.name_ru ?? null,
      centerLat: null,
      centerLng: null,
    };
  });
  assertUniqueSlugs('region', regions.map((r) => r.id));
  assertUniqueSlugs('district', districts.map((d) => d.id));
  return { regions, districts };
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

  const geo = loadGeo();

  await prisma.$transaction(async (tx) => {
    // 0. Catalog groups — upsert by `key` (referenced by BusinessTypeInfo.groupKey FK).
    for (const g of seed.groups) {
      const data = {
        nameUz: g.nameUz,
        nameRu: g.nameRu ?? null,
        emoji: g.emoji ?? null,
        icon: g.icon ?? null,
        accentColor: g.accentColor ?? null,
        sortOrder: g.sortOrder,
      };
      await tx.catalogGroup.upsert({
        where: { key: g.key },
        create: { key: g.key, ...data },
        update: data,
      });
    }

    // 1. Business types — upsert (PK `type` is referenced by Category/AttributeSpec/Business FKs).
    for (const bt of seed.businessTypes) {
      const data = {
        groupKey: bt.groupKey,
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

    // 4. Geo — regions first (District.regionId FK -> Region). Upsert by id: idempotent and
    //    FK-safe (deleteMany would fail once Branches reference regions/districts).
    //    Prune any id the current dataset no longer produces — this clears the old numeric-id rows
    //    left by an earlier seed now that ids are slugs. Districts first (FK). Safe: a valid Branch
    //    can only reference a currently seeded id, which is in the keep-set and so never pruned.
    await tx.district.deleteMany({ where: { id: { notIn: geo.districts.map((d) => d.id) } } });
    await tx.region.deleteMany({ where: { id: { notIn: geo.regions.map((r) => r.id) } } });
    for (const r of geo.regions) {
      const data = {
        nameUz: r.nameUz,
        nameRu: r.nameRu ?? null,
        centerLat: r.centerLat ?? null,
        centerLng: r.centerLng ?? null,
      };
      await tx.region.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
    }
    for (const d of geo.districts) {
      const data = {
        regionId: d.regionId,
        nameUz: d.nameUz,
        nameRu: d.nameRu ?? null,
        centerLat: d.centerLat ?? null,
        centerLng: d.centerLng ?? null,
      };
      await tx.district.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
    }
    // 5. Trade centers — upsert center by slug (array index = sortOrder), then replace its
    //    fields wholesale so re-running never duplicates (field array index = sortOrder).
    for (const [i, tc] of TRADE_CENTERS.entries()) {
      const centerData = { name: tc.name, status: TradeCenterStatus.ACTIVE, sortOrder: i };
      const center = await tx.tradeCenter.upsert({
        where: { slug: tc.slug },
        create: { slug: tc.slug, ...centerData },
        update: centerData,
      });
      await tx.tradeCenterField.deleteMany({ where: { tradeCenterId: center.id } });
      await tx.tradeCenterField.createMany({
        data: tc.fields.map((f, idx) => ({
          tradeCenterId: center.id,
          label: f.label,
          type: f.type,
          required: f.required,
          sortOrder: idx,
        })),
      });
    }

    // Timeout bumped from the 5s default: the geo upserts add 224 sequential statements.
  }, { timeout: 60_000 });

  // Summary
  const baseCategoryCount = categoryRows.filter((c) => c.gender == null).length;
  const perGenderCategoryCount = categoryRows.length - baseCategoryCount;
  const typeLevelAttrCount = attributeRows.filter((a) => a.categoryKey == null).length;
  const categoryLevelAttrCount = attributeRows.length - typeLevelAttrCount;

  console.log('Catalog seed complete:');
  console.log(`  business types:        ${seed.businessTypes.length}`);
  console.log(`  categories:            ${categoryRows.length} (base ${baseCategoryCount}, per-gender ${perGenderCategoryCount})`);
  console.log(`  attribute specs:       ${attributeRows.length} (type-level ${typeLevelAttrCount}, category-level ${categoryLevelAttrCount})`);
  console.log(`  regions:               ${geo.regions.length}`);
  console.log(`  districts:             ${geo.districts.length}`);
  const tradeCenterFieldCount = TRADE_CENTERS.reduce((n, tc) => n + tc.fields.length, 0);
  console.log(`  trade centers:         ${TRADE_CENTERS.length} (fields ${tradeCenterFieldCount})`);
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
