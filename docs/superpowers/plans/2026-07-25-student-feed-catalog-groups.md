# Student Feed — 1-kesim: katalog guruh qatlami

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 27 biznes turi ustiga 8 ta guruh qatlamini qo'shish va StudentClub bosh ekrani uchun `POST /v1/catalog/groups` + `POST /v1/catalog/types` endpointlarini ishga tushirish — har bir guruh/tur yonida ko'rinadigan e'lonlar soni bilan.

**Architecture:** Guruh → tur moslamasi **bazada** turadi (`business_types.group_key` → `catalog_groups.key`), kodda emas — adminka orqali turni boshqa guruhga ko'chirganda ilova yangilanmaydi. Mavjud `catalog` moduli kengaytiriladi (yangi modul yaratilmaydi): domain entity + repository porti + Prisma impl + service + yangi `CatalogGroupsController`. E'lon sonlari bitta agregat SQL so'rovi bilan tur kesimida olinadi va guruhga yig'iladi; natija Redis'da 5 daqiqa keshlanadi.

**Tech Stack:** NestJS · Prisma · PostgreSQL 16 + PostGIS · Redis (ioredis) · class-validator · Jest

**Spec:** `docs/api/client/STUDENT_FEED.md` — §3 (katalog qatlami), §2 (auth), D1/D5/D16, Ilova (8 guruh)

**Bu rejadan tashqarida** (keyingi rejalar): `filter-schema` · `discounts/search` · `detail` · `suggest` · `favorites` · `is_discount` / `search_vector` / `catalog_synonyms` / `branch_working_hours` migratsiyalari.

---

## File Structure

**Yangi fayllar:**

| Fayl | Mas'uliyati |
|---|---|
| `prisma/migrations/<ts>_add_catalog_groups/migration.sql` | `catalog_groups` jadvali + 8 qator + `business_types.group_key` backfill |
| `src/modules/catalog/domain/entities/catalog-group.entity.ts` | `CatalogGroup` domain entity |
| `src/modules/catalog/application/catalog-counts.model.ts` | Sonlar bilan boyitilgan use-case natijalari + `GeoScope` |
| `src/modules/catalog/application/catalog-groups.service.ts` | `getGroups` / `getTypes` use-case'lari |
| `src/modules/catalog/application/catalog-groups.service.spec.ts` | Unit testlar (repository mock'langan) |
| `src/modules/catalog/infrastructure/catalog-count.sql.ts` | Agregat SQL — bitta joyda |
| `src/modules/catalog/presentation/catalog-groups.controller.ts` | `POST /catalog/groups`, `POST /catalog/types` |
| `src/modules/catalog/presentation/dto/geo-scope.dto.ts` | `geo` bloki (ikkala so'rovda umumiy) |
| `src/modules/catalog/presentation/dto/catalog-groups-request.dto.ts` | `POST /catalog/groups` tanasi |
| `src/modules/catalog/presentation/dto/catalog-types-request.dto.ts` | `POST /catalog/types` tanasi |
| `src/modules/catalog/presentation/dto/catalog-group.dto.ts` | Guruh javobi |
| `src/modules/catalog/presentation/dto/catalog-type.dto.ts` | Tur javobi |
| `src/common/validation/validation-exception.factory.ts` | `main.ts` dan ajratilgan 422 fabrikasi — e2e ham ishlatadi |
| `test/catalog-groups.e2e-spec.ts` | Uchidan-uchiga |

**O'zgartiriladigan fayllar:**

| Fayl | O'zgarish |
|---|---|
| `prisma/schema.prisma` | `CatalogGroup` model + `BusinessTypeInfo.groupKey` |
| `docs/api/provider/catalog-seed.json` | `groups[]` bloki + har turga `groupKey`; `version` → `2.1.0` |
| `prisma/seed.ts` | Guruhlarni upsert qilish (biznes turlaridan **oldin** — FK) |
| `src/modules/catalog/domain/entities/business-type.entity.ts` | `groupKey`, `allCategoryLabel`, `optionGroupHint` qo'shish |
| `src/modules/catalog/domain/catalog.repository.ts` | 4 ta yangi metod |
| `src/modules/catalog/infrastructure/catalog.mapper.ts` | Yangi maydonlar + `toCatalogGroup` |
| `src/modules/catalog/infrastructure/catalog.prisma.repository.ts` | Yangi metodlar implementatsiyasi |
| `src/modules/catalog/application/catalog.service.spec.ts` | Mavjud mock'ga yangi metodlar |
| `src/modules/catalog/catalog.module.ts` | Yangi service + controller + `RedisModule` |
| `src/infrastructure/cache/redis.service.ts` | `get()` metodi |
| `src/main.ts` | `'Catalog (student feed)'` tegi (`addTag` + `STUDENT_DOC_TAGS`); 422 fabrikasi ajratildi |
| `docs/api/client/STUDENT_FEED.md` | §3 — `gender` so'rov tanasidan (A1) |

---

## Amendment A1 — `gender` so'rov tanasida

`STUDENT_FEED.md` §3 (D16) `/catalog/types` jins bo'yicha filtrlashini profil jinsidan olishni nazarda tutgan. Level 1 da **so'rov tanasidagi `gender`** ishlatiladi:

- Mavjud `GET /business/types?gender=` aynan shunday ishlaydi — bir xil naqsh, bir xil xatti-harakat.
- Katalog moduli `students` jadvaliga bog'lanmaydi (qatlam chegarasi toza qoladi).
- Endpoint auth'siz ishlashda davom etadi.

Klient jinsni profilidan biladi va so'rovga qo'shadi. Bu 1-qadamda `STUDENT_FEED.md` ga yoziladi.

---

### Task 1: Prisma modeli va migratsiya

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_catalog_groups/migration.sql`

- [ ] **Step 1: `prisma/schema.prisma` ga `CatalogGroup` modelini qo'shish**

`BusinessTypeInfo` modelidan **oldin**, `// CATALOG (...)` izohidan keyin qo'ying:

```prisma
// Top-level grouping over the 27 business types (STUDENT_FEED.md, Ilova). The mapping lives in
// the DB, NOT in code — moving a type to another group must not require an app release.
model CatalogGroup {
  key         String   @id
  nameUz      String   @map("name_uz")
  nameRu      String?  @map("name_ru")
  emoji       String?
  icon        String?
  accentColor String?  @map("accent_color")
  sortOrder   Int      @default(0) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  businessTypes BusinessTypeInfo[]

  @@map("catalog_groups")
}
```

- [ ] **Step 2: `BusinessTypeInfo` ga `groupKey` qo'shish**

`prisma/schema.prisma` dagi `model BusinessTypeInfo` ichida, `type` qatoridan keyin qo'shing:

```prisma
  groupKey            String      @map("group_key")
```

va relation'lar blokiga (`categories`, `attributeSpecs`, `businesses` yonига):

```prisma
  group          CatalogGroup    @relation(fields: [groupKey], references: [key], onDelete: Restrict)
```

va `@@map("business_types")` dan oldin:

```prisma
  @@index([groupKey])
```

- [ ] **Step 3: Bo'sh migratsiya yaratish**

Run: `npx prisma migrate dev --name add_catalog_groups --create-only`
Expected: `prisma/migrations/<timestamp>_add_catalog_groups/migration.sql` yaratiladi.

- [ ] **Step 4: Migratsiya SQL'ini qo'lda yozish**

Prisma generatsiya qilgan SQL `group_key` ni NOT NULL qilib qo'shadi va mavjud 27 qatorda **uziladi**. Fayl mazmunini **to'liq** quyidagi bilan almashtiring:

```sql
-- CreateTable
CREATE TABLE "catalog_groups" (
    "key" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT,
    "emoji" TEXT,
    "icon" TEXT,
    "accent_color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_groups_pkey" PRIMARY KEY ("key")
);

-- Seed the 8 groups (STUDENT_FEED.md, Ilova). The seed script keeps these in sync afterwards.
INSERT INTO "catalog_groups" ("key", "name_uz", "emoji", "icon", "accent_color", "sort_order", "updated_at") VALUES
  ('FOOD',          'Ovqatlanish',        '🍽', 'cafe',    '#F97316', 1, CURRENT_TIMESTAMP),
  ('SPORT',         'Sport',              '⚽', 'ball',    '#16A34A', 2, CURRENT_TIMESTAMP),
  ('GAMES',         'O''yin va bo''sh vaqt', '🎮', 'gamepad', '#7C5CFF', 3, CURRENT_TIMESTAMP),
  ('ENTERTAINMENT', 'Ko''ngilochar',      '🎬', 'camera',  '#EF4444', 4, CURRENT_TIMESTAMP),
  ('EDUCATION',     'Ta''lim',            '📚', 'book',    '#3B82F6', 5, CURRENT_TIMESTAMP),
  ('BEAUTY',        'Go''zallik',         '💇', 'star',    '#EC4899', 6, CURRENT_TIMESTAMP),
  ('SHOPPING',      'Savdo va xizmat',    '🛍', 'cart',    '#06B6D4', 7, CURRENT_TIMESTAMP),
  ('HOUSING',       'Ijara',              '🏠', 'home',    '#14B8A6', 8, CURRENT_TIMESTAMP);

-- AlterTable: add nullable, backfill, then enforce NOT NULL (27 rows already exist).
ALTER TABLE "business_types" ADD COLUMN "group_key" TEXT;

UPDATE "business_types" SET "group_key" = CASE "type"
  WHEN 'NATIONAL_FOOD'      THEN 'FOOD'
  WHEN 'FAST_FOOD'          THEN 'FOOD'
  WHEN 'SOMSA'              THEN 'FOOD'
  WHEN 'TENNIS'             THEN 'SPORT'
  WHEN 'TABLE_TENNIS'       THEN 'SPORT'
  WHEN 'FOOTBALL_FIELD'     THEN 'SPORT'
  WHEN 'FOOTBALL_TRAINING'  THEN 'SPORT'
  WHEN 'BASKETBALL'         THEN 'SPORT'
  WHEN 'VOLLEYBALL'         THEN 'SPORT'
  WHEN 'SWIMMING_POOL'      THEN 'SPORT'
  WHEN 'FITNESS'            THEN 'SPORT'
  WHEN 'BOXING'             THEN 'SPORT'
  WHEN 'WRESTLING_MMA'      THEN 'SPORT'
  WHEN 'PLAYSTATION'        THEN 'GAMES'
  WHEN 'CYBER_CLUB'         THEN 'GAMES'
  WHEN 'BOWLING'            THEN 'GAMES'
  WHEN 'BILLIARDS'          THEN 'GAMES'
  WHEN 'CINEMA'             THEN 'ENTERTAINMENT'
  WHEN 'KARAOKE'            THEN 'ENTERTAINMENT'
  WHEN 'EDUCATION_CENTER'   THEN 'EDUCATION'
  WHEN 'LIBRARY'            THEN 'EDUCATION'
  WHEN 'TUTOR'              THEN 'EDUCATION'
  WHEN 'BARBERSHOP'         THEN 'BEAUTY'
  WHEN 'BEAUTY_SALON'       THEN 'BEAUTY'
  WHEN 'CLOTHING'           THEN 'SHOPPING'
  WHEN 'PRINTING'           THEN 'SHOPPING'
  WHEN 'RENTAL_HOUSE'       THEN 'HOUSING'
  ELSE 'SHOPPING'
END;

ALTER TABLE "business_types" ALTER COLUMN "group_key" SET NOT NULL;

-- CreateIndex
CREATE INDEX "business_types_group_key_idx" ON "business_types"("group_key");

-- AddForeignKey
ALTER TABLE "business_types" ADD CONSTRAINT "business_types_group_key_fkey"
  FOREIGN KEY ("group_key") REFERENCES "catalog_groups"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
```

> `ELSE 'SHOPPING'` — himoya tarmog'i: agar bazada seed'da yo'q qo'lda qo'shilgan tur bo'lsa, migratsiya uzilmaydi. Seed keyin to'g'ri qiymatni yozadi.

- [ ] **Step 5: Migratsiyani qo'llash va tekshirish**

Run: `npx prisma migrate dev`
Expected: migratsiya qo'llanadi, `prisma generate` avtomatik ishlaydi, xato yo'q.

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT group_key, count(*) FROM business_types GROUP BY group_key ORDER BY group_key;
SQL
```
Expected: 8 qator — `BEAUTY 2`, `EDUCATION 3`, `ENTERTAINMENT 2`, `FOOD 3`, `GAMES 4`, `HOUSING 1`, `SHOPPING 2`, `SPORT 10`. Yig'indi = 27.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(catalog): add catalog_groups table and business_types.group_key"
```

---

### Task 2: Seed — guruhlar

**Files:**
- Modify: `docs/api/provider/catalog-seed.json`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: `catalog-seed.json` ga `groups` blokini qo'shish**

`"version"` ni `"2.1.0"` ga o'zgartiring va `"businessTypes"` dan **oldin** yangi top-level kalit qo'shing:

```json
  "groups": [
    { "key": "FOOD",          "nameUz": "Ovqatlanish",         "emoji": "🍽", "icon": "cafe",    "accentColor": "#F97316", "sortOrder": 1 },
    { "key": "SPORT",         "nameUz": "Sport",               "emoji": "⚽", "icon": "ball",    "accentColor": "#16A34A", "sortOrder": 2 },
    { "key": "GAMES",         "nameUz": "O'yin va bo'sh vaqt", "emoji": "🎮", "icon": "gamepad", "accentColor": "#7C5CFF", "sortOrder": 3 },
    { "key": "ENTERTAINMENT", "nameUz": "Ko'ngilochar",        "emoji": "🎬", "icon": "camera",  "accentColor": "#EF4444", "sortOrder": 4 },
    { "key": "EDUCATION",     "nameUz": "Ta'lim",              "emoji": "📚", "icon": "book",    "accentColor": "#3B82F6", "sortOrder": 5 },
    { "key": "BEAUTY",        "nameUz": "Go'zallik",           "emoji": "💇", "icon": "star",    "accentColor": "#EC4899", "sortOrder": 6 },
    { "key": "SHOPPING",      "nameUz": "Savdo va xizmat",     "emoji": "🛍", "icon": "cart",    "accentColor": "#06B6D4", "sortOrder": 7 },
    { "key": "HOUSING",       "nameUz": "Ijara",               "emoji": "🏠", "icon": "home",    "accentColor": "#14B8A6", "sortOrder": 8 }
  ],
```

- [ ] **Step 2: Har bir `businessTypes` yozuviga `groupKey` qo'shish**

`businessTypes` massividagi **har** obyektga `"type"` dan keyin `"groupKey"` qo'shing. To'liq moslama (Task 1 dagi `CASE` bilan aynan bir xil):

| `type` | `groupKey` | `type` | `groupKey` |
|---|---|---|---|
| `TENNIS` | `SPORT` | `CINEMA` | `ENTERTAINMENT` |
| `TABLE_TENNIS` | `SPORT` | `KARAOKE` | `ENTERTAINMENT` |
| `FITNESS` | `SPORT` | `EDUCATION_CENTER` | `EDUCATION` |
| `BOXING` | `SPORT` | `LIBRARY` | `EDUCATION` |
| `FOOTBALL_FIELD` | `SPORT` | `TUTOR` | `EDUCATION` |
| `FOOTBALL_TRAINING` | `SPORT` | `PRINTING` | `SHOPPING` |
| `BASKETBALL` | `SPORT` | `NATIONAL_FOOD` | `FOOD` |
| `VOLLEYBALL` | `SPORT` | `FAST_FOOD` | `FOOD` |
| `SWIMMING_POOL` | `SPORT` | `SOMSA` | `FOOD` |
| `WRESTLING_MMA` | `SPORT` | `BARBERSHOP` | `BEAUTY` |
| `BOWLING` | `GAMES` | `BEAUTY_SALON` | `BEAUTY` |
| `BILLIARDS` | `GAMES` | `RENTAL_HOUSE` | `HOUSING` |
| `PLAYSTATION` | `GAMES` | `CLOTHING` | `SHOPPING` |
| `CYBER_CLUB` | `GAMES` | | |

- [ ] **Step 3: `prisma/seed.ts` — tiplarni kengaytirish**

`interface SeedBusinessType` ga qo'shing (`type: string;` dan keyin):

```ts
  groupKey: string;
```

`SeedCategory` interfeysidan **oldin** yangi interfeys qo'shing:

```ts
interface SeedGroup {
  key: string;
  nameUz: string;
  nameRu?: string;
  emoji?: string;
  icon?: string;
  accentColor?: string;
  sortOrder: number;
}
```

`interface CatalogSeed` ichiga (`businessTypes` yoniga) qo'shing:

```ts
  groups: SeedGroup[];
```

- [ ] **Step 4: `prisma/seed.ts` — guruhlarni upsert qilish**

`await prisma.$transaction(async (tx) => {` ichida, `// 1. Business types` blokidan **oldin** qo'shing (FK tartibi: guruhlar avval):

```ts
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
```

`// 1. Business types` blokidagi `const data = {` obyektiga `nameUz` dan **oldin** qo'shing:

```ts
        groupKey: bt.groupKey,
```

- [ ] **Step 5: Seed'ni ishga tushirish va tekshirish**

Run: `npm run prisma:seed`
Expected: xatosiz tugaydi.

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT g.key, g.sort_order, count(bt.type) AS types
FROM catalog_groups g LEFT JOIN business_types bt ON bt.group_key = g.key
GROUP BY g.key, g.sort_order ORDER BY g.sort_order;
SQL
```
Expected: 8 qator, `sort_order` 1..8, `types` yig'indisi 27.

- [ ] **Step 6: Commit**

```bash
git add docs/api/provider/catalog-seed.json prisma/seed.ts
git commit -m "feat(catalog): seed the 8 catalog groups and map every business type"
```

---

### Task 3: Domain qatlami

**Files:**
- Create: `src/modules/catalog/domain/entities/catalog-group.entity.ts`
- Modify: `src/modules/catalog/domain/entities/business-type.entity.ts`
- Modify: `src/modules/catalog/domain/catalog.repository.ts`

- [ ] **Step 1: `CatalogGroup` entity yaratish**

Fayl: `src/modules/catalog/domain/entities/catalog-group.entity.ts`

```ts
/**
 * A top-level catalog group over the business types (STUDENT_FEED.md, Ilova).
 * `typeKeys` is the group's membership, resolved from `business_types.group_key`.
 */
export interface CatalogGroup {
  key: string;
  nameUz: string;
  nameRu: string | null;
  emoji: string | null;
  icon: string | null;
  accentColor: string | null;
  sortOrder: number;
  typeKeys: string[];
}
```

- [ ] **Step 2: `BusinessType` entity'sini kengaytirish**

`src/modules/catalog/domain/entities/business-type.entity.ts` — interfeysga `type: string;` dan keyin `groupKey`, oxiriga qolgan ikkitasini qo'shing:

```ts
export interface BusinessType {
  type: string;
  groupKey: string;
  nameUz: string;
  nameRu: string | null;
  iconUrl: string | null;
  emoji: string | null;
  accentColor: string | null;
  defaultPriceUnit: PriceUnit;
  priceUnits: PriceUnit[];
  availableForGenders: Gender[];
  allCategoryLabel: string | null;
  optionGroupHint: string | null;
}
```

- [ ] **Step 3: Repository portiga yangi metodlar qo'shish**

`src/modules/catalog/domain/catalog.repository.ts` — importlarga qo'shing:

```ts
import { CatalogGroup } from './entities/catalog-group.entity';
```

`BusinessTypeWrite` interfeysidan **keyin** qo'shing:

```ts
/** A point + radius used to scope listing counts to what is near the student. */
export interface GeoScope {
  lat: number;
  lng: number;
  radiusMeters: number;
}
```

`CatalogRepository` interfeysi ichiga (`findBusinessTypes` dan keyin) qo'shing:

```ts
  /** All catalog groups with their member type keys, ordered by `sortOrder`. */
  findGroups(): Promise<CatalogGroup[]>;

  /** Business types belonging to any of `groupKeys`. Empty input → empty result. */
  findBusinessTypesByGroups(groupKeys: string[]): Promise<BusinessType[]>;

  /**
   * Visible-listing count per business type (STUDENT_FEED.md Q4: listing ACTIVE, business
   * APPROVED, validFrom <= now <= validTo). Scoped to `geo` when given. Types with no visible
   * listing are absent from the map — callers default to 0.
   */
  countVisibleListingsByType(geo: GeoScope | null): Promise<Map<string, number>>;

  /** Number of base (non gender-specific) categories per business type. */
  countCategoriesByType(): Promise<Map<string, number>>;
```

- [ ] **Step 4: Kompilyatsiyani tekshirish (xato kutilyapti)**

Run: `npx tsc --noEmit`
Expected: FAIL — `catalog.prisma.repository.ts` interfeysni to'liq bajarmayapti, `catalog.mapper.ts` `groupKey` ni bermayapti, `catalog.service.spec.ts` mock'i to'liq emas. Bu kutilgan holat; keyingi tasklar tuzatadi.

- [ ] **Step 5: Commit**

```bash
git add src/modules/catalog/domain
git commit -m "feat(catalog): add CatalogGroup entity and group-aware repository port"
```

---

### Task 4: Infrastructure — mapper va Prisma repository

**Files:**
- Create: `src/modules/catalog/infrastructure/catalog-count.sql.ts`
- Modify: `src/modules/catalog/infrastructure/catalog.mapper.ts`
- Modify: `src/modules/catalog/infrastructure/catalog.prisma.repository.ts`

- [ ] **Step 1: Agregat SQL faylini yaratish**

Fayl: `src/modules/catalog/infrastructure/catalog-count.sql.ts`

```ts
import { Prisma } from '@prisma/client';
import type { GeoScope } from '../domain/catalog.repository';

/** One row of the per-type visible-listing aggregate. */
export interface TypeCountRow {
  type: string;
  count: number;
}

/**
 * Visible-listing count grouped by business type (STUDENT_FEED.md Q4).
 *
 * Visible = listing ACTIVE + business APPROVED + validFrom <= now() <= validTo. When `geo` is
 * given the listing must have at least one active branch inside the radius — hence the join and
 * `COUNT(DISTINCT l.id)`, which keeps a multi-branch listing from being counted twice.
 * `::int` casts the bigint COUNT so the driver returns a JS number.
 */
export function typeCountQuery(geo: GeoScope | null): Prisma.Sql {
  const visible = Prisma.sql`
    l.status = 'ACTIVE'
    AND b.status = 'APPROVED'
    AND l.valid_from <= now()
    AND l.valid_to >= now()
  `;

  if (geo === null) {
    return Prisma.sql`
      SELECT b.type AS type, COUNT(*)::int AS count
      FROM listings l
      JOIN businesses b ON b.id = l.business_id
      WHERE ${visible}
      GROUP BY b.type
    `;
  }

  return Prisma.sql`
    SELECT b.type AS type, COUNT(DISTINCT l.id)::int AS count
    FROM listings l
    JOIN businesses b ON b.id = l.business_id
    JOIN listing_branches lb ON lb.listing_id = l.id
    JOIN branches br ON br.id = lb.branch_id
    WHERE ${visible}
      AND br.is_active = true
      AND br.geo_point IS NOT NULL
      AND ST_DWithin(
            br.geo_point,
            ST_SetSRID(ST_MakePoint(${geo.lng}, ${geo.lat}), 4326)::geography,
            ${geo.radiusMeters}
          )
    GROUP BY b.type
  `;
}
```

- [ ] **Step 2: Mapper'ni yangilash**

`src/modules/catalog/infrastructure/catalog.mapper.ts` — importlarga qo'shing:

```ts
import { CatalogGroup } from '../domain/entities/catalog-group.entity';
```

`type CatalogGroup as CatalogGroupRow,` ni `@prisma/client` importiga qo'shing.

`toBusinessType` metodini almashtiring:

```ts
  static toBusinessType(row: BusinessTypeInfoRow): BusinessType {
    return {
      type: row.type,
      groupKey: row.groupKey,
      nameUz: row.nameUz,
      nameRu: row.nameRu,
      iconUrl: row.iconUrl,
      emoji: row.emoji,
      accentColor: row.accentColor,
      defaultPriceUnit: PriceUnit[row.defaultPriceUnit],
      priceUnits: row.priceUnits.map((unit) => PriceUnit[unit]),
      availableForGenders: row.availableForGenders.map((gender) => Gender[gender]),
      allCategoryLabel: row.allCategoryLabel,
      optionGroupHint: row.optionGroupHint,
    };
  }

  /** A group row plus the type keys resolved from `business_types.group_key`. */
  static toCatalogGroup(row: CatalogGroupRow, typeKeys: string[]): CatalogGroup {
    return {
      key: row.key,
      nameUz: row.nameUz,
      nameRu: row.nameRu,
      emoji: row.emoji,
      icon: row.icon,
      accentColor: row.accentColor,
      sortOrder: row.sortOrder,
      typeKeys,
    };
  }
```

- [ ] **Step 3: Prisma repository'ni to'ldirish**

`src/modules/catalog/infrastructure/catalog.prisma.repository.ts` — importlarga qo'shing:

```ts
import { BusinessTypeWrite, CatalogRepository, GeoScope } from '../domain/catalog.repository';
import { CatalogGroup } from '../domain/entities/catalog-group.entity';
import { TypeCountRow, typeCountQuery } from './catalog-count.sql';
```

(mavjud `BusinessTypeWrite, CatalogRepository` importini yuqoridagi bilan almashtiring)

`findBusinessTypes` metodidan **keyin** qo'shing:

```ts
  async findGroups(): Promise<CatalogGroup[]> {
    const rows = await this.prisma.catalogGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { businessTypes: { select: { type: true }, orderBy: { type: 'asc' } } },
    });
    return rows.map((row) =>
      CatalogMapper.toCatalogGroup(
        row,
        row.businessTypes.map((businessType) => businessType.type),
      ),
    );
  }

  async findBusinessTypesByGroups(groupKeys: string[]): Promise<BusinessType[]> {
    if (groupKeys.length === 0) {
      return [];
    }
    const rows = await this.prisma.businessTypeInfo.findMany({
      where: { groupKey: { in: groupKeys } },
      orderBy: { type: 'asc' },
    });
    return rows.map((row) => CatalogMapper.toBusinessType(row));
  }

  async countVisibleListingsByType(geo: GeoScope | null): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<TypeCountRow[]>(typeCountQuery(geo));
    return new Map(rows.map((row) => [row.type, row.count]));
  }

  async countCategoriesByType(): Promise<Map<string, number>> {
    const rows = await this.prisma.category.groupBy({
      by: ['businessType'],
      where: { gender: null },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.businessType, row._count._all]));
  }
```

- [ ] **Step 4: Mavjud unit test mock'ini yangilash**

`src/modules/catalog/application/catalog.service.spec.ts` — `businessType()` yordamchisini almashtiring:

```ts
function businessType(type: string, genders: Gender[]): BusinessType {
  return {
    type,
    groupKey: 'SHOPPING',
    nameUz: type,
    nameRu: null,
    iconUrl: null,
    emoji: null,
    accentColor: null,
    defaultPriceUnit: PriceUnit.PER_ITEM,
    priceUnits: [PriceUnit.PER_ITEM],
    availableForGenders: genders,
    allCategoryLabel: null,
    optionGroupHint: null,
  };
}
```

`makeRepository()` ichida, `countCategoriesOfType` dan keyin qo'shing:

```ts
    findGroups: jest.fn().mockResolvedValue([]),
    findBusinessTypesByGroups: jest.fn().mockResolvedValue([]),
    countVisibleListingsByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    countCategoriesByType: jest.fn().mockResolvedValue(new Map<string, number>()),
```

- [ ] **Step 5: Kompilyatsiya va mavjud testlar**

Run: `npx tsc --noEmit`
Expected: PASS (xato yo'q)

Run: `npm test -- src/modules/catalog`
Expected: PASS — mavjud katalog testlari o'tadi.

- [ ] **Step 6: Commit**

```bash
git add src/modules/catalog/infrastructure src/modules/catalog/application/catalog.service.spec.ts
git commit -m "feat(catalog): implement group queries and visible-listing count aggregate"
```

---

### Task 5: Application — `CatalogGroupsService`

**Files:**
- Create: `src/modules/catalog/application/catalog-counts.model.ts`
- Create: `src/modules/catalog/application/catalog-groups.service.ts`
- Test: `src/modules/catalog/application/catalog-groups.service.spec.ts`

- [ ] **Step 1: Natija modellarini yozish**

Fayl: `src/modules/catalog/application/catalog-counts.model.ts`

```ts
import { BusinessType } from '../domain/entities/business-type.entity';
import { CatalogGroup } from '../domain/entities/catalog-group.entity';

/** A group plus the counts the home screen renders. */
export interface CatalogGroupWithCounts extends CatalogGroup {
  typesCount: number;
  listingsCount: number;
}

/** A business type plus its category and visible-listing counts. */
export interface BusinessTypeWithCounts extends BusinessType {
  categoriesCount: number;
  listingsCount: number;
}
```

- [ ] **Step 2: Failing testni yozish**

Fayl: `src/modules/catalog/application/catalog-groups.service.spec.ts`

```ts
import { CatalogRepository } from '../domain/catalog.repository';
import { BusinessType } from '../domain/entities/business-type.entity';
import { CatalogGroup } from '../domain/entities/catalog-group.entity';
import { Gender } from '../domain/enums/gender.enum';
import { PriceUnit } from '../domain/enums/price-unit.enum';
import { CatalogGroupsService } from './catalog-groups.service';

function group(key: string, sortOrder: number, typeKeys: string[]): CatalogGroup {
  return {
    key,
    nameUz: key,
    nameRu: null,
    emoji: null,
    icon: null,
    accentColor: null,
    sortOrder,
    typeKeys,
  };
}

function businessType(type: string, groupKey: string, genders: Gender[]): BusinessType {
  return {
    type,
    groupKey,
    nameUz: type,
    nameRu: null,
    iconUrl: null,
    emoji: null,
    accentColor: null,
    defaultPriceUnit: PriceUnit.PER_ITEM,
    priceUnits: [PriceUnit.PER_ITEM],
    availableForGenders: genders,
    allCategoryLabel: null,
    optionGroupHint: null,
  };
}

const GROUPS: CatalogGroup[] = [
  group('FOOD', 1, ['NATIONAL_FOOD', 'FAST_FOOD']),
  group('BEAUTY', 6, ['BARBERSHOP', 'BEAUTY_SALON']),
];

const BEAUTY_TYPES: BusinessType[] = [
  businessType('BARBERSHOP', 'BEAUTY', [Gender.MALE]),
  businessType('BEAUTY_SALON', 'BEAUTY', [Gender.FEMALE]),
];

function makeRepository(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    findBusinessTypes: jest.fn().mockResolvedValue([]),
    findCategoriesByType: jest.fn().mockResolvedValue([]),
    findAttributeSpecs: jest.fn().mockResolvedValue([]),
    typeExists: jest.fn().mockResolvedValue(true),
    createType: jest.fn(),
    updateType: jest.fn(),
    deleteType: jest.fn(),
    countBusinessesOfType: jest.fn().mockResolvedValue(0),
    countCategoriesOfType: jest.fn().mockResolvedValue(0),
    findGroups: jest.fn().mockResolvedValue(GROUPS),
    findBusinessTypesByGroups: jest.fn().mockResolvedValue(BEAUTY_TYPES),
    countVisibleListingsByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    countCategoriesByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    ...overrides,
  };
}

describe('CatalogGroupsService', () => {
  describe('getGroups', () => {
    it('sums the per-type counts into each group and keeps empty groups', async () => {
      const repository = makeRepository({
        countVisibleListingsByType: jest
          .fn()
          .mockResolvedValue(new Map([['NATIONAL_FOOD', 12], ['FAST_FOOD', 5]])),
      });
      const service = new CatalogGroupsService(repository);

      const groups = await service.getGroups(null);

      expect(groups).toHaveLength(2);
      expect(groups[0]).toMatchObject({ key: 'FOOD', typesCount: 2, listingsCount: 17 });
      // Empty groups still come back — the client dims them instead of hiding them.
      expect(groups[1]).toMatchObject({ key: 'BEAUTY', typesCount: 2, listingsCount: 0 });
    });

    it('passes the geo scope through to the count query', async () => {
      const countVisibleListingsByType = jest.fn().mockResolvedValue(new Map<string, number>());
      const service = new CatalogGroupsService(makeRepository({ countVisibleListingsByType }));

      await service.getGroups({ lat: 41.31, lng: 69.27, radiusMeters: 5000 });

      expect(countVisibleListingsByType).toHaveBeenCalledWith({
        lat: 41.31,
        lng: 69.27,
        radiusMeters: 5000,
      });
    });
  });

  describe('getTypes', () => {
    it('filters the type list by gender but never the counts (D16)', async () => {
      const repository = makeRepository({
        countVisibleListingsByType: jest
          .fn()
          .mockResolvedValue(new Map([['BARBERSHOP', 7], ['BEAUTY_SALON', 9]])),
        countCategoriesByType: jest.fn().mockResolvedValue(new Map([['BARBERSHOP', 8]])),
      });
      const service = new CatalogGroupsService(repository);

      const types = await service.getTypes(['BEAUTY'], Gender.MALE, null);

      expect(types).toHaveLength(1);
      expect(types[0]).toMatchObject({
        type: 'BARBERSHOP',
        categoriesCount: 8,
        listingsCount: 7,
      });
    });

    it('returns every type when no gender is given', async () => {
      const service = new CatalogGroupsService(makeRepository());

      const types = await service.getTypes(['BEAUTY'], null, null);

      expect(types.map((type) => type.type)).toEqual(['BARBERSHOP', 'BEAUTY_SALON']);
    });

    it('defaults missing counts to zero', async () => {
      const service = new CatalogGroupsService(makeRepository());

      const types = await service.getTypes(['BEAUTY'], null, null);

      expect(types[0]).toMatchObject({ categoriesCount: 0, listingsCount: 0 });
    });
  });
});
```

- [ ] **Step 3: Testni ishga tushirish (uzilishi kerak)**

Run: `npm test -- catalog-groups.service`
Expected: FAIL — `Cannot find module './catalog-groups.service'`

- [ ] **Step 4: Service'ni yozish**

Fayl: `src/modules/catalog/application/catalog-groups.service.ts`

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_REPOSITORY, CatalogRepository, GeoScope } from '../domain/catalog.repository';
import { Gender } from '../domain/enums/gender.enum';
import { BusinessTypeWithCounts, CatalogGroupWithCounts } from './catalog-counts.model';

/**
 * Catalog group use-cases for the student feed (STUDENT_FEED.md §3).
 *
 * Counts are always computed over ALL visible listings — gender only ever narrows the *list* of
 * types, never the numbers (D16). That is what keeps the group totals equal to the sum of their
 * types' totals.
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
```

- [ ] **Step 5: Testni ishga tushirish (o'tishi kerak)**

Run: `npm test -- catalog-groups.service`
Expected: PASS — 5 test.

- [ ] **Step 6: Commit**

```bash
git add src/modules/catalog/application/catalog-counts.model.ts src/modules/catalog/application/catalog-groups.service.ts src/modules/catalog/application/catalog-groups.service.spec.ts
git commit -m "feat(catalog): add CatalogGroupsService with count aggregation"
```

---

### Task 6: Presentation — DTO va controller

**Files:**
- Create: `src/modules/catalog/presentation/dto/geo-scope.dto.ts`
- Create: `src/modules/catalog/presentation/dto/catalog-groups-request.dto.ts`
- Create: `src/modules/catalog/presentation/dto/catalog-types-request.dto.ts`
- Create: `src/modules/catalog/presentation/dto/catalog-group.dto.ts`
- Create: `src/modules/catalog/presentation/dto/catalog-type.dto.ts`
- Create: `src/modules/catalog/presentation/catalog-groups.controller.ts`
- Modify: `src/modules/catalog/catalog.module.ts`

- [ ] **Step 1: `GeoScopeDto` yozish**

Fayl: `src/modules/catalog/presentation/dto/geo-scope.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';
import type { GeoScope } from '../../domain/catalog.repository';

/** Point + radius used to scope catalog counts (STUDENT_FEED.md §4 `filter.geo`). */
export class GeoScopeDto {
  @ApiProperty({ example: 41.3111, description: 'Latitude (Uzbekistan: 37..46)' })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 69.2797, description: 'Longitude (Uzbekistan: 55..74)' })
  @IsLongitude()
  lng!: number;

  @ApiProperty({ required: false, default: 5000, minimum: 100, maximum: 50000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(50_000)
  radiusMeters?: number;

  toDomain(): GeoScope {
    return { lat: this.lat, lng: this.lng, radiusMeters: this.radiusMeters ?? 5000 };
  }
}
```

- [ ] **Step 2: So'rov DTO'larini yozish**

Fayl: `src/modules/catalog/presentation/dto/catalog-groups-request.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { GeoScopeDto } from './geo-scope.dto';

/** `POST /v1/catalog/groups` body. Everything is optional — an empty body is valid. */
export class CatalogGroupsRequestDto {
  @ApiProperty({ required: false, type: GeoScopeDto, description: 'Scopes listingsCount' })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoScopeDto)
  geo?: GeoScopeDto;
}
```

Fayl: `src/modules/catalog/presentation/dto/catalog-types-request.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Gender } from '../../domain/enums/gender.enum';
import { GeoScopeDto } from './geo-scope.dto';

/**
 * `POST /v1/catalog/types` body. `groupKeys` is capped at 3 (STUDENT_FEED.md D1 — the limit sits
 * on groups, not on the types they expand to).
 */
export class CatalogTypesRequestDto {
  @ApiProperty({ type: [String], example: ['FOOD'], maxItems: 3 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  groupKeys!: string[];

  @ApiProperty({
    required: false,
    enum: Gender,
    description: 'Narrows the type list only — never the counts (D16).',
  })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false, type: GeoScopeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoScopeDto)
  geo?: GeoScopeDto;
}
```

- [ ] **Step 3: Javob DTO'larini yozish**

Fayl: `src/modules/catalog/presentation/dto/catalog-group.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { CatalogGroupWithCounts } from '../../application/catalog-counts.model';

/** CatalogGroupDto — one of the 8 home-screen groups. */
export class CatalogGroupDto {
  @ApiProperty({ example: 'FOOD' })
  key!: string;

  @ApiProperty({ example: 'Ovqatlanish' })
  nameUz!: string;

  @ApiProperty({ required: false, nullable: true })
  nameRu!: string | null;

  @ApiProperty({ required: false, nullable: true, example: '🍽' })
  emoji!: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'cafe' })
  icon!: string | null;

  @ApiProperty({ required: false, nullable: true, example: '#F97316' })
  accentColor!: string | null;

  @ApiProperty({ example: 1 })
  sortOrder!: number;

  @ApiProperty({ type: [String], example: ['NATIONAL_FOOD', 'FAST_FOOD', 'SOMSA'] })
  types!: string[];

  @ApiProperty({ example: 3 })
  typesCount!: number;

  @ApiProperty({ example: 312, description: 'Visible listings (Q4), scoped to `geo` when given' })
  listingsCount!: number;

  static fromDomain(group: CatalogGroupWithCounts): CatalogGroupDto {
    const dto = new CatalogGroupDto();
    dto.key = group.key;
    dto.nameUz = group.nameUz;
    dto.nameRu = group.nameRu;
    dto.emoji = group.emoji;
    dto.icon = group.icon;
    dto.accentColor = group.accentColor;
    dto.sortOrder = group.sortOrder;
    dto.types = group.typeKeys;
    dto.typesCount = group.typesCount;
    dto.listingsCount = group.listingsCount;
    return dto;
  }
}
```

Fayl: `src/modules/catalog/presentation/dto/catalog-type.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { BusinessTypeWithCounts } from '../../application/catalog-counts.model';
import { Gender } from '../../domain/enums/gender.enum';
import { PriceUnit } from '../../domain/enums/price-unit.enum';

/** CatalogTypeDto — a business type inside a group, with counts. */
export class CatalogTypeDto {
  @ApiProperty({ example: 'NATIONAL_FOOD' })
  key!: string;

  @ApiProperty({ example: 'FOOD' })
  groupKey!: string;

  @ApiProperty({ example: 'Milliy taomlar' })
  nameUz!: string;

  @ApiProperty({ required: false, nullable: true, example: '🍛' })
  emoji!: string | null;

  @ApiProperty({ required: false, nullable: true, example: '#EA580C' })
  accentColor!: string | null;

  @ApiProperty({ enum: PriceUnit, enumName: 'PriceUnitDto' })
  defaultPriceUnit!: PriceUnit;

  @ApiProperty({ enum: PriceUnit, enumName: 'PriceUnitDto', isArray: true })
  priceUnits!: PriceUnit[];

  @ApiProperty({ enum: Gender, enumName: 'GenderDto', isArray: true })
  availableForGenders!: Gender[];

  @ApiProperty({ required: false, nullable: true, example: 'Butun menyu' })
  allCategoryLabel!: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'Porsiya, tarkib' })
  optionGroupHint!: string | null;

  @ApiProperty({ example: 8 })
  categoriesCount!: number;

  @ApiProperty({ example: 187 })
  listingsCount!: number;

  static fromDomain(type: BusinessTypeWithCounts): CatalogTypeDto {
    const dto = new CatalogTypeDto();
    dto.key = type.type;
    dto.groupKey = type.groupKey;
    dto.nameUz = type.nameUz;
    dto.emoji = type.emoji;
    dto.accentColor = type.accentColor;
    dto.defaultPriceUnit = type.defaultPriceUnit;
    dto.priceUnits = type.priceUnits;
    dto.availableForGenders = type.availableForGenders;
    dto.allCategoryLabel = type.allCategoryLabel;
    dto.optionGroupHint = type.optionGroupHint;
    dto.categoriesCount = type.categoriesCount;
    dto.listingsCount = type.listingsCount;
    return dto;
  }
}
```

- [ ] **Step 4: Controller'ni yozish**

Fayl: `src/modules/catalog/presentation/catalog-groups.controller.ts`

```ts
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiOkEnvelope } from '../../../common/swagger/api-envelope.decorator';
import { CatalogGroupsService } from '../application/catalog-groups.service';
import { CatalogGroupsRequestDto } from './dto/catalog-groups-request.dto';
import { CatalogGroupDto } from './dto/catalog-group.dto';
import { CatalogTypeDto } from './dto/catalog-type.dto';
import { CatalogTypesRequestDto } from './dto/catalog-types-request.dto';

/**
 * Student-feed catalog endpoints (STUDENT_FEED.md §3). POST-only with ids in the body (Q2);
 * public — a student browses before signing up (D5).
 */
@ApiTags('Catalog (student feed)')
@Controller('catalog')
export class CatalogGroupsController {
  constructor(private readonly catalogGroupsService: CatalogGroupsService) {}

  @Post('groups')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List the catalog groups',
    description:
      'The 8 home-screen groups with their type and visible-listing counts. Empty groups are returned with listingsCount 0.',
  })
  @ApiOkEnvelope([CatalogGroupDto])
  async getGroups(@Body() body: CatalogGroupsRequestDto): Promise<CatalogGroupDto[]> {
    const groups = await this.catalogGroupsService.getGroups(body.geo?.toDomain() ?? null);
    return groups.map(CatalogGroupDto.fromDomain);
  }

  @Post('types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List the business types inside the given groups',
    description:
      '`gender` narrows the list of types only — counts are never gender-filtered, so group totals stay equal to the sum of their types.',
  })
  @ApiOkEnvelope([CatalogTypeDto])
  async getTypes(@Body() body: CatalogTypesRequestDto): Promise<CatalogTypeDto[]> {
    const types = await this.catalogGroupsService.getTypes(
      body.groupKeys,
      body.gender ?? null,
      body.geo?.toDomain() ?? null,
    );
    return types.map(CatalogTypeDto.fromDomain);
  }
}
```

- [ ] **Step 5: Modulga ulash**

`src/modules/catalog/catalog.module.ts` — to'liq mazmunni almashtiring:

```ts
import { Module } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { BusinessTypeAdminService } from './application/business-type-admin.service';
import { CatalogGroupsService } from './application/catalog-groups.service';
import { CatalogService } from './application/catalog.service';
import { CATALOG_REPOSITORY } from './domain/catalog.repository';
import { CatalogPrismaRepository } from './infrastructure/catalog.prisma.repository';
import { AdminBusinessTypeController } from './presentation/admin-business-type.controller';
import { CatalogGroupsController } from './presentation/catalog-groups.controller';
import { CatalogController } from './presentation/catalog.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CatalogController, CatalogGroupsController, AdminBusinessTypeController],
  providers: [
    CatalogService,
    CatalogGroupsService,
    BusinessTypeAdminService,
    AdminGuard,
    { provide: CATALOG_REPOSITORY, useClass: CatalogPrismaRepository },
  ],
  exports: [CATALOG_REPOSITORY],
})
export class CatalogModule {}
```

- [ ] **Step 6: Swagger — yangi tegni student hujjatiga qo'shish**

⚠️ **Bu qadam o'tkazib yuborilsa endpointlar mobil klient generatsiyasidan tushib qoladi.**
`src/main.ts` OpenAPI hujjatini teglar bo'yicha ikkiga bo'ladi; hech bir ro'yxatda yo'q teg
**ikkala** hujjatdan ham chiqib ketadi. Ikki joyda o'zgartirish kerak.

`src/main.ts` — `STUDENT_DOC_TAGS` massiviga `'Profiles'` dan **oldin** qo'shing:

```ts
  'Catalog (student feed)',
```

Natija:

```ts
const STUDENT_DOC_TAGS = [
  'Auth — Student',
  'Auth — Student OTP',
  'Auth — Student Password',
  'Auth — Student Sessions',
  'Catalog (student feed)',
  'Profiles',
  'Geo',
  'Media',
];
```

`swaggerConfig` da, `.addTag('Catalog', ...)` qatoridan **keyin** qo'shing:

```ts
    .addTag('Catalog (student feed)', 'Student app: catalog groups and their business types')
```

> Bootstrap `STUDENT_DOC_TAGS` dagi har bir tegni `addTag` bilan e'lon qilinganiga tekshiradi
> va mos kelmasa **ishga tushmaydi** — shuning uchun ikkalasi ham majburiy.

- [ ] **Step 7: Validatsiya xato fabrikasini ajratib chiqarish**

`main.ts` dagi `validationExceptionFactory` 422 + `error.fields` ni beradi, lekin u faylning
**ichida** yopiq. E2E testlar uni import qila olmagani uchun ular ishlab chiqarishdan boshqa
xatti-harakatni sinaydi (oddiy `ValidationPipe` 422 emas, **400** qaytaradi). Umumiy joyga
ko'chiramiz.

Fayl yarating: `src/common/validation/validation-exception.factory.ts`

```ts
import { ValidationError } from 'class-validator';
import { ERROR_CODE } from '../errors/error-code';
import { AppException } from '../exceptions/app.exception';

/**
 * Turns class-validator errors into the contract's 422 shape: `VALIDATION_ERROR` plus one
 * Uzbek message per field, keyed by its dotted path (`geo.radiusMeters`, `groupKeys`).
 *
 * Shared by `main.ts` and the e2e suites so tests exercise the real behaviour — the default
 * pipe would raise a 400 with a different body.
 */
export function validationExceptionFactory(errors: ValidationError[]): AppException {
  const fields: Record<string, string> = {};
  const walk = (errs: ValidationError[], prefix = ''): void => {
    for (const e of errs) {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) {
        fields[path] = Object.values(e.constraints)[0];
      }
      if (e.children?.length) walk(e.children, path);
    }
  };
  walk(errors);
  return new AppException(ERROR_CODE.VALIDATION_ERROR, 422, 'Ma’lumotlar noto‘g‘ri', fields);
}
```

`src/main.ts` — lokal `function validationExceptionFactory(...)` ta'rifini (`ValidationError`
importi bilan birga, agar boshqa joyda ishlatilmasa) **o'chiring** va import qo'shing:

```ts
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
```

`AppException` va `ERROR_CODE` importlari `main.ts` da boshqa ishlatilmasa ularni ham
o'chiring — `npm run lint` buni ko'rsatadi.

- [ ] **Step 8: Kompilyatsiya, lint va testlar**

Run: `npx tsc --noEmit && npm run lint && npm test -- src/modules/catalog`
Expected: PASS

Run: `npm run start:dev` va `http://localhost:3000/docs/student/json` ni oching
Expected: JSON ichida `/v1/catalog/groups` va `/v1/catalog/types` yo'llari bor.
Keyin serverni to'xtating.

- [ ] **Step 9: Commit**

```bash
git add src/modules/catalog/presentation src/modules/catalog/catalog.module.ts src/main.ts src/common/validation/validation-exception.factory.ts
git commit -m "feat(catalog): add POST /v1/catalog/groups and /v1/catalog/types"
```

---

### Task 7: Sonlarni keshlash

**Files:**
- Modify: `src/infrastructure/cache/redis.service.ts`
- Modify: `src/modules/catalog/infrastructure/catalog.prisma.repository.ts`
- Modify: `src/modules/catalog/catalog.module.ts`

Spec (§3): «`listingsCount` har so'rovda `COUNT(*)` qilinmaydi — 5 daqiqalik kesh; `geo` berilganda koordinata ~1 km gacha yaxlitlanib kesh kalitiga qo'shiladi.»

Kesh **repository** ichida turadi — service kesh haqida bilmaydi, testlari o'zgarmaydi.

- [ ] **Step 1: `RedisService.get()` qo'shish**

`src/infrastructure/cache/redis.service.ts` — `set` metodidan **keyin** qo'shing:

```ts
  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }
```

- [ ] **Step 2: Repository'ga keshni ulash**

`src/modules/catalog/infrastructure/catalog.prisma.repository.ts` — importlarga qo'shing:

```ts
import { RedisService } from '../../../infrastructure/cache/redis.service';
```

Konstruktorni almashtiring:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}
```

Klass ichiga, `countVisibleListingsByType` dan **oldin** qo'shing:

```ts
  /** Counts change slowly; 5 minutes keeps the home screen off the aggregate query. */
  private static readonly COUNT_CACHE_TTL_SECONDS = 300;

  /**
   * Cache key for the count aggregate. Coordinates are rounded to ~1 km (2 decimal places, one
   * degree of latitude ≈ 111 km) so nearby students share a cache entry instead of each getting
   * their own.
   */
  private static countCacheKey(geo: GeoScope | null): string {
    if (geo === null) {
      return 'catalog:counts:type:all';
    }
    const lat = geo.lat.toFixed(2);
    const lng = geo.lng.toFixed(2);
    return `catalog:counts:type:${lat}:${lng}:${geo.radiusMeters}`;
  }
```

`countVisibleListingsByType` metodini almashtiring:

```ts
  async countVisibleListingsByType(geo: GeoScope | null): Promise<Map<string, number>> {
    const key = CatalogPrismaRepository.countCacheKey(geo);
    const cached = await this.redis.get(key);
    if (cached !== null) {
      return new Map(JSON.parse(cached) as [string, number][]);
    }

    const rows = await this.prisma.$queryRaw<TypeCountRow[]>(typeCountQuery(geo));
    const counts = new Map(rows.map((row) => [row.type, row.count]));
    await this.redis.set(
      key,
      JSON.stringify([...counts]),
      CatalogPrismaRepository.COUNT_CACHE_TTL_SECONDS,
    );
    return counts;
  }
```

- [ ] **Step 3: Modulga `RedisModule` qo'shish**

`src/modules/catalog/catalog.module.ts` — importlarga qo'shing:

```ts
import { RedisModule } from '../../infrastructure/cache/redis.module';
```

va `imports` massivini o'zgartiring:

```ts
  imports: [PrismaModule, RedisModule],
```

- [ ] **Step 4: Kompilyatsiya va testlar**

Run: `npx tsc --noEmit && npm test -- src/modules/catalog`
Expected: PASS — repository unit testlari yo'q, service testlari repository'ni mock qiladi, shuning uchun kesh ularga ta'sir qilmaydi.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/cache/redis.service.ts src/modules/catalog
git commit -m "feat(catalog): cache the visible-listing count aggregate for 5 minutes"
```

---

### Task 8: E2E test

**Files:**
- Create: `test/catalog-groups.e2e-spec.ts`

- [ ] **Step 1: E2E testni yozish**

Fayl: `test/catalog-groups.e2e-spec.ts`

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import type { Env } from '../src/config/env';

/**
 * Student-feed catalog endpoints — e2e. Runs against a real seeded DB + Redis.
 * Read-only: creates nothing, so no cleanup is needed.
 *
 * The pipe is configured exactly as in `main.ts` (including `validationExceptionFactory`) so the
 * 422 assertions below exercise the shape the app really returns.
 */
describe('Catalog groups (student feed) — e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    app.setGlobalPrefix(config.get('API_PREFIX', { infer: true }));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the 8 groups covering all 27 types, in sortOrder', async () => {
    const response = await request(app.getHttpServer()).post('/v1/catalog/groups').send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, status: 200, error: null });

    const groups = response.body.result;
    expect(groups).toHaveLength(8);
    expect(groups.map((group: { key: string }) => group.key)).toEqual([
      'FOOD',
      'SPORT',
      'GAMES',
      'ENTERTAINMENT',
      'EDUCATION',
      'BEAUTY',
      'SHOPPING',
      'HOUSING',
    ]);
    const totalTypes = groups.reduce(
      (sum: number, group: { typesCount: number }) => sum + group.typesCount,
      0,
    );
    expect(totalTypes).toBe(27);
  });

  it('group listingsCount equals the sum of its types listingsCount (§12.19)', async () => {
    const groupsResponse = await request(app.getHttpServer()).post('/v1/catalog/groups').send({});
    const food = groupsResponse.body.result.find((group: { key: string }) => group.key === 'FOOD');

    const typesResponse = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: ['FOOD'] });

    expect(typesResponse.status).toBe(200);
    const sum = typesResponse.body.result.reduce(
      (total: number, type: { listingsCount: number }) => total + type.listingsCount,
      0,
    );
    expect(sum).toBe(food.listingsCount);
  });

  it('gender narrows the BEAUTY type list but not the counts (D16)', async () => {
    const all = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: ['BEAUTY'] });
    const male = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: ['BEAUTY'], gender: 'MALE' });

    expect(all.body.result.map((type: { key: string }) => type.key).sort()).toEqual([
      'BARBERSHOP',
      'BEAUTY_SALON',
    ]);
    expect(male.body.result.map((type: { key: string }) => type.key)).toEqual(['BARBERSHOP']);

    const barbershopAll = all.body.result.find((type: { key: string }) => type.key === 'BARBERSHOP');
    expect(male.body.result[0].listingsCount).toBe(barbershopAll.listingsCount);
  });

  it('accepts 3 groups but rejects 4 (D1)', async () => {
    const three = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: ['SPORT', 'FOOD', 'GAMES'] });
    expect(three.status).toBe(200);
    // SPORT alone is 10 types — the old per-type cap made this combination impossible.
    expect(three.body.result.length).toBe(17);

    const four = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: ['SPORT', 'FOOD', 'GAMES', 'BEAUTY'] });
    expect(four.status).toBe(422);
    expect(four.body).toMatchObject({
      success: false,
      status: 422,
      result: null,
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('rejects an empty groupKeys list', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: [] });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a geo scope', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/catalog/groups')
      .send({ geo: { lat: 41.3111, lng: 69.2797, radiusMeters: 5000 } });

    expect(response.status).toBe(200);
    expect(response.body.result).toHaveLength(8);
  });

  it('rejects an out-of-range radius', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/catalog/groups')
      .send({ geo: { lat: 41.3111, lng: 69.2797, radiusMeters: 99 } });

    expect(response.status).toBe(422);
  });
});
```

- [ ] **Step 2: Bazani tayyorlash**

Run: `docker compose up -d postgres redis` (agar hali ishlamayotgan bo'lsa)
Run: `npx prisma migrate deploy && npm run prisma:seed`
Expected: 27 tur va 8 guruh bazada.

- [ ] **Step 3: E2E testni ishga tushirish**

Run: `npm run test:e2e -- catalog-groups`
Expected: PASS — 7 test.

> `SPORT + FOOD + GAMES` = 10 + 3 + 4 = **17 tur**. Testdagi `toBe(17)` shu.

- [ ] **Step 4: To'liq tekshiruv**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS — butun unit suite.

- [ ] **Step 5: Commit**

```bash
git add test/catalog-groups.e2e-spec.ts
git commit -m "test(catalog): e2e coverage for the student-feed catalog endpoints"
```

---

### Task 9: Hujjatni A1 bilan yangilash

**Files:**
- Modify: `docs/api/client/STUDENT_FEED.md`

- [ ] **Step 1: §3 dagi `/catalog/types` so'rovini yangilash**

`STUDENT_FEED.md` da `### \`POST /v1/catalog/types\`` bo'limini toping va so'rov qatorini almashtiring:

```
So'rov: `{ "groupKeys": ["FOOD"], "gender": "MALE", "geo": {...} }`
```

Undan keyin qo'shing:

```markdown
> **A1 (amendment).** `gender` — **so'rov tanasida**, profil tokenidan emas. Mavjud
> `GET /business/types?gender=` aynan shu naqshda ishlaydi, katalog moduli `students`
> jadvaliga bog'lanmaydi va endpoint auth'siz qolaveradi. Klient jinsni o'z profilidan
> biladi va so'rovga qo'shadi.
```

- [ ] **Step 2: D1 chegarasini `groupKeys` uchun aniqlashtirish**

§10 dagi xatolar jadvalida `TOO_MANY_GROUPS` qatoridan keyin qo'shing:

```markdown
> Level 1 da `groupKeys` chegarasi DTO darajasida (`@ArrayMaxSize(3)`) tekshiriladi, ya'ni
> `error.code` = `VALIDATION_ERROR` va `fields["groupKeys"]` to'ldiriladi.
> `TOO_MANY_GROUPS` maxsus kodi `search` endpointi bilan birga qo'shiladi.
```

- [ ] **Step 3: Commit**

```bash
git add docs/api/client/STUDENT_FEED.md
git commit -m "docs(client): record amendment A1 — gender travels in the request body"
```

---

## Bajarilgandan keyin qo'lda tekshirish

```bash
npm run start:dev
```

```bash
curl -s -X POST http://localhost:3000/v1/catalog/groups \
  -H 'Content-Type: application/json' -d '{}' | jq '.result[] | {key, typesCount, listingsCount}'

curl -s -X POST http://localhost:3000/v1/catalog/types \
  -H 'Content-Type: application/json' -d '{"groupKeys":["FOOD"]}' | jq '.result[] | {key, nameUz, categoriesCount}'
```

Swagger: `http://localhost:3000/docs` → **Catalog (student feed)** bo'limida ikkala endpoint.

---

## Keyingi rejalar

| Reja | Mazmuni |
|---|---|
| 2-kesim | `POST /v1/catalog/filter-schema` — kategoriyalar, atributlar, `operators`, variantlar bo'yicha `count` |
| 3-kesim | `listings.is_discount` / `search_text` / `search_vector`, `catalog_synonyms`, `branch_working_hours` migratsiyalari + `POST /v1/discounts/search` (LIST/COUNT) + `POST /v1/discounts/detail` |
| 4-kesim | `mode: "MAP"` + klasterlash · `POST /v1/discounts/suggest` · `student_favorites` + `favorites/*` |
