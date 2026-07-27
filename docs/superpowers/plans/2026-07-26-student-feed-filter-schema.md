# Student Feed — 2-kesim: `POST /v1/catalog/filter-schema`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klient filtr ekranini **serverdan** qurishi uchun `POST /v1/catalog/filter-schema` — tanlangan guruh/turlar bo'yicha qaysi kategoriya, atribut, narx, chegirma, redemption, geo va e'lon turi filtrlari mumkinligini, **har biri yonida real e'lon soni bilan** qaytaradi.

**Architecture:** Yangi `discounts` moduli **e'lon agregatsiyasini** egallaydi (bu kesimda facetlar, keyingisida `search`). `catalog` moduli sof katalog ma'lumotida qoladi. Facetlar bitta umumiy «ko'rinadigan e'lonlar qamrovi» SQL fragmentidan foydalanadigan 7 ta arzon agregat so'rov bilan olinadi (`Promise.all`), keyin application qatlami ularni `AttributeKind` bo'yicha shakllantiradi. Atribut qiymatlari `jsonb` dan **bitta** `jsonb_each_text` LATERAL so'rovi bilan chiqariladi — har kalit uchun alohida kod yozilmaydi (Q6).

**Tech Stack:** NestJS · Prisma (`$queryRaw` + `Prisma.sql`) · PostgreSQL 16 + PostGIS · Redis · class-validator · Jest

**Spec:** `docs/api/client/STUDENT_FEED.md` §9 (`filter-schema`), §5 (atribut operatorlari), Q6, D3, D16 · `_raw/PROMPT_REGULAR_LISTINGS.md` §4 (`listingKind`)

---

## Bu kesimga ko'chirilgan ish

**`listings.is_discount` + `discount_percent`** 3-kesimda rejalashtirilgan edi, lekin `filter-schema` ning `listingKind` faceti (`ALL` / `DISCOUNT` / `REGULAR`) va `discount.percentRange` ularsiz hisoblanmaydi. Shu sababli bu yerga ko'chirildi. Qolgan 3-kesim maydonlari (`search_text`, `search_vector`, `catalog_synonyms`, `branch_working_hours`) o'z joyida qoladi.

## Ataylab qamrovdan tashqarida

- **`step`** (`attributes[].range.step`) — spec misolida bor, lekin `catalog-seed.json` da bunday maydon **yo'q** va uni ma'lumotdan chiqarish o'zboshimchalik bo'lardi. `range` faqat `min`/`max` bilan qaytadi. Klientga kerak bo'lsa katalogga `step` maydoni qo'shiladi.
- `search`, `detail`, `suggest`, `favorites`, `mode: MAP` — keyingi kesimlar.

---

## Module boundary — nega yangi `discounts` moduli

`filter-schema` ning **yo'li** katalog yuzasida (`/v1/catalog/...`), lekin **mantig'i** e'lon agregatsiyasi: `listings` + `businesses` + `branches` ustidan facet sanash. Bu 3-kesimdagi `POST /v1/discounts/search` bilan **aynan bir xil qamrov shartlarini** (Q4 ko'rinish + geo + tur) ishlatadi.

Shu sababli agregatsiya `src/modules/discounts/` ga joylashadi va qamrov SQL fragmenti (`visible-scope.sql.ts`) ikkala endpoint uchun yagona manba bo'ladi. `catalog` moduli sof katalog ma'lumotida (turlar, kategoriyalar, atribut sxemasi, guruhlar) qoladi.

Controller `@Controller('catalog')` deb e'lon qilinadi — yo'l shartnomadan, joylashuv mas'uliyatdan.

---

## File Structure

**Yangi:**

| Fayl | Mas'uliyati |
|---|---|
| `prisma/migrations/<ts>_add_listing_discount_flags/migration.sql` | `is_discount`, `discount_percent` + backfill |
| `src/common/geo/geo-scope.ts` | `GeoScope` — 1-kesimda `catalog` ichida edi, endi umumiy |
| `src/modules/discounts/domain/facets.model.ts` | Facet natijalari va `FacetScope` (so'rov qamrovi) |
| `src/modules/discounts/domain/facet.repository.ts` | Port + `FACET_REPOSITORY` tokeni |
| `src/modules/discounts/infrastructure/visible-scope.sql.ts` | Q4 ko'rinish sharti + tur/kategoriya/geo — **yagona manba** |
| `src/modules/discounts/infrastructure/facet.sql.ts` | 7 ta agregat so'rov |
| `src/modules/discounts/infrastructure/facet.prisma.repository.ts` | Port implementatsiyasi + Redis kesh |
| `src/modules/discounts/application/filter-schema.service.ts` | Katalog sxemasi + facetlarni birlashtirish |
| `src/modules/discounts/application/filter-schema.service.spec.ts` | Unit testlar |
| `src/modules/discounts/application/attribute-facet.shaper.ts` | Xom `(key,value,count)` → `AttributeKind` bo'yicha shakl |
| `src/modules/discounts/application/attribute-facet.shaper.spec.ts` | Unit testlar (eng nozik mantiq) |
| `src/modules/discounts/presentation/filter-schema.controller.ts` | `POST /v1/catalog/filter-schema` |
| `src/modules/discounts/presentation/dto/filter-schema-request.dto.ts` | So'rov tanasi |
| `src/modules/discounts/presentation/dto/filter-schema.dto.ts` | Javob (ichki DTO'lar bilan) |
| `src/modules/discounts/discounts.module.ts` | Modul |
| `test/filter-schema.e2e-spec.ts` | Uchidan-uchiga (o'z fixturasi bilan) |
| `test/helpers/listing-fixture.ts` | E2E uchun biznes + filial + e'lon yaratish/tozalash |

**O'zgartiriladigan:**

| Fayl | O'zgarish |
|---|---|
| `prisma/schema.prisma` | `Listing.isDiscount`, `Listing.discountPercent` + indekslar |
| `src/modules/listings/application/listings.io.ts` | `ListingDiscount` ga `isDiscount` + `percent` |
| `src/modules/listings/application/listings.service.ts` | `resolveDiscount` ikkalasini to'ldiradi |
| `src/modules/listings/infrastructure/*.repository.ts` | Yangi ustunlarni yozish |
| `src/modules/catalog/domain/entities/attribute-spec.entity.ts` | `businessType` + `suffix` (filtr sxemasi ikkalasini qaytaradi) |
| `src/modules/catalog/domain/catalog.repository.ts` | `GeoScope` umumiy joydan re-eksport qilinadi |
| `src/modules/catalog/infrastructure/catalog.mapper.ts` | `toAttributeSpec` yangi ikki maydonni beradi |
| `src/app.module.ts` | `DiscountsModule` |
| `src/main.ts` | `'Catalog (student feed)'` tegi allaqachon bor — o'zgarish shart emas |

---

### Task 1: `is_discount` va `discount_percent` ustunlari

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_listing_discount_flags/migration.sql`

- [ ] **Step 1: Sxemaga ikki ustun qo'shish**

`prisma/schema.prisma`, `model Listing` ichida, `appliesToOptions` qatoridan **keyin**:

```prisma
  // Denormalised from `attributes._regular` (STUDENT_FEED.md D8): a regular listing carries no
  // discount. Kept as a column so listingKind faceting and NULLS-LAST discount sorting are
  // indexable instead of probing jsonb on every row.
  isDiscount      Boolean @default(true) @map("is_discount")
  // Normalised discount percent for sorting/faceting; NULL for regular listings.
  // FIXED_AMOUNT / SPECIAL_PRICE are converted to the equivalent percent, FREE_ITEM counts as 50.
  discountPercent Int?    @map("discount_percent")
```

`@@map("listings")` dan **oldin**, mavjud indekslar yoniga:

```prisma
  @@index([isDiscount])
  @@index([businessId, isDiscount, status])
```

- [ ] **Step 2: Migratsiyani qo'lda yozish**

Fayl: `prisma/migrations/<timestamp>_add_listing_discount_flags/migration.sql`
(`<timestamp>` — `20260723123508` va `20260725103000` dan katta, masalan `20260726090000`)

```sql
-- AlterTable
ALTER TABLE "listings" ADD COLUMN "is_discount" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "listings" ADD COLUMN "discount_percent" INTEGER;

-- Backfill: a listing is "regular" when attributes._regular = '1' (STUDENT_FEED.md Q0).
UPDATE "listings" SET "is_discount" = false
  WHERE "attributes" ->> '_regular' = '1';

-- Normalised percent for the discount listings. FREE_ITEM (1+1) has finalPrice == originalPrice,
-- so it gets a flat 50 per the sort rule; the rest derive from the actual price drop.
UPDATE "listings" SET "discount_percent" = CASE
    WHEN "discount_type" = 'FREE_ITEM' THEN 50
    WHEN "original_price" > 0
      THEN GREATEST(0, ROUND(("original_price" - "final_price") * 100.0 / "original_price"))::int
    ELSE 0
  END
  WHERE "is_discount" = true;

-- CreateIndex
CREATE INDEX "listings_is_discount_idx" ON "listings"("is_discount");
CREATE INDEX "listings_business_id_is_discount_status_idx" ON "listings"("business_id", "is_discount", "status");
```

- [ ] **Step 3: Migratsiyani qo'llash**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: `Applying migration ..._add_listing_discount_flags`, xatosiz.

- [ ] **Step 4: Sxema bilan mosligini tekshirish**

Run:
```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  | grep -E 'is_discount|discount_percent'
```
Expected: `"is_discount" BOOLEAN NOT NULL DEFAULT true`, `"discount_percent" INTEGER` va ikkala indeks nomi (`listings_is_discount_idx`, `listings_business_id_is_discount_status_idx`) chiqadi — qo'lda yozilgan SQL bilan bir xil.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(listings): denormalise is_discount and discount_percent onto listings"
```

---

### Task 2: Yozish yo'li ikkala ustunni to'ldiradi

**Files:**
- Modify: `src/modules/listings/application/listings.io.ts`
- Modify: `src/modules/listings/application/listings.service.ts`
- Test: `src/modules/listings/application/listings.service.spec.ts`

- [ ] **Step 1: Failing testni yozish**

`src/modules/listings/application/listings.service.spec.ts` — `describe('create'...)` blokining oxiriga qo'shing:

```ts
    it('marks a discount listing with isDiscount and the normalised percent', async () => {
      const { service, listings } = makeService();

      await service.create(OWNER_ID, BUSINESS_ID, listingInput());

      expect(listings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: expect.objectContaining({ isDiscount: true, percent: 20 }),
        }),
      );
    });

    it('marks a regular listing with isDiscount false and a null percent', async () => {
      const { service, listings } = makeService();

      await service.create(
        OWNER_ID,
        BUSINESS_ID,
        listingInput({ attributes: { _regular: '1' } }),
      );

      expect(listings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: expect.objectContaining({ isDiscount: false, percent: null }),
        }),
      );
    });

    it('gives FREE_ITEM a flat 50 percent (it has no price drop)', async () => {
      const { service, listings } = makeService();

      await service.create(
        OWNER_ID,
        BUSINESS_ID,
        listingInput({ discount: { type: DiscountType.FREE_ITEM, value: 1, conditions: null, appliesToOptions: false } }),
      );

      expect(listings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: expect.objectContaining({ isDiscount: true, percent: 50 }),
        }),
      );
    });
```

> `makeService()`, `listingInput()`, `OWNER_ID`, `BUSINESS_ID` — shu fayldagi mavjud yordamchilar. `listingInput()` ning standart chegirmasi `PERCENT 20`; agar boshqacha bo'lsa, birinchi testdagi `percent` ni o'shanga moslang.

- [ ] **Step 2: Testni ishga tushirish (uzilishi kerak)**

Run: `npm test -- listings.service -t "isDiscount"`
Expected: FAIL — `discount` obyektida `isDiscount` maydoni yo'q.

- [ ] **Step 3: `ListingDiscount` ni kengaytirish**

`src/modules/listings/application/listings.io.ts` — `ListingDiscount` interfeysiga qo'shing:

```ts
  /** false when the listing is a plain single-price offer (`attributes._regular === "1"`). */
  isDiscount: boolean;
  /** Normalised percent for sorting/faceting; null for regular listings. */
  percent: number | null;
```

- [ ] **Step 4: `resolveDiscount` ni to'ldirish**

`src/modules/listings/application/listings.service.ts` — `resolveDiscount` metodini almashtiring:

```ts
  private resolveDiscount(input: UpdateListingInput, isRegular: boolean): ListingDiscount {
    if (isRegular) {
      return {
        type: DiscountType.PERCENT,
        value: 0,
        finalPrice: input.originalPrice,
        conditions: null,
        appliesToOptions: false,
        isDiscount: false,
        percent: null,
      };
    }

    const { discount, originalPrice } = input;
    if (discount.type === DiscountType.PERCENT && discount.value > MAX_PERCENT) {
      throw new AppException(
        ERROR_CODE.DISCOUNT_TOO_HIGH,
        422,
        'Chegirma 90% dan oshmasligi kerak',
        {
          value: 'Chegirma 90% dan oshmasligi kerak',
        },
      );
    }

    const finalPrice = Number(
      computeFinalPrice(discount.type, BigInt(discount.value), BigInt(originalPrice)),
    );
    if (discount.type !== DiscountType.FREE_ITEM && finalPrice >= originalPrice) {
      throw new AppException(
        ERROR_CODE.FINAL_PRICE_INVALID,
        422,
        'Yakuniy narx asl narxdan kichik bo‘lishi kerak',
        { value: 'Chegirma yakuniy narxni kamaytirmaydi' },
      );
    }

    return {
      type: discount.type,
      value: discount.value,
      finalPrice,
      conditions: discount.conditions,
      appliesToOptions: discount.appliesToOptions,
      isDiscount: true,
      percent: normalisedPercent(discount.type, originalPrice, finalPrice),
    };
  }
```

Fayl oxiriga, klassdan **tashqarida**, yordamchini qo'shing:

```ts
/**
 * Discount percent used for sorting and faceting (STUDENT_FEED.md §6). FIXED_AMOUNT and
 * SPECIAL_PRICE are expressed as the equivalent percent; FREE_ITEM (1+1) has no price drop at all,
 * so it takes the flat 50 the sort rule assigns it.
 */
function normalisedPercent(type: DiscountType, originalPrice: number, finalPrice: number): number {
  if (type === DiscountType.FREE_ITEM) {
    return 50;
  }
  if (originalPrice <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(((originalPrice - finalPrice) * 100) / originalPrice));
}
```

- [ ] **Step 5: Repository yangi ustunlarni yozsin**

Run: `grep -rn "finalPrice" src/modules/listings/infrastructure/*.repository.ts | head`

Topilgan `create` va `update` payload'larida `finalPrice: ...` yoniga qo'shing:

```ts
        isDiscount: data.discount.isDiscount,
        discountPercent: data.discount.percent,
```

- [ ] **Step 6: Testlar**

Run: `npm test -- listings.service`
Expected: PASS — yangi 3 test va mavjudlari.

Run: `npx tsc --noEmit`
Expected: xato yo'q.

- [ ] **Step 7: Commit**

```bash
git add src/modules/listings
git commit -m "feat(listings): persist isDiscount and the normalised discount percent"
```

---

### Task 3: Domain — facet modeli va porti

**Files:**
- Create: `src/modules/discounts/domain/facets.model.ts`
- Create: `src/modules/discounts/domain/facet.repository.ts`

- [ ] **Step 1: `GeoScope` ni umumiy joyga ko'chirish**

1-kesimda `GeoScope` `catalog/domain/catalog.repository.ts` da ta'riflangan. `discounts` ga
ikkinchi nusxa yozish o'rniga — TypeScript strukturaviy tiplashtirish tufayli u jimgina
kompilyatsiya qilinardi va keyin bir-biridan uzoqlashib ketardi — uni umumiy joyga chiqaramiz.
`src/common/geo/` allaqachon `uzbekistan-bounds.ts` bilan shu maqsadga xizmat qiladi.

Fayl yarating: `src/common/geo/geo-scope.ts`

```ts
/**
 * A point plus a radius, used to scope reads to what is near the student. Shared by the catalog
 * counts and the feed facets so the two never drift apart.
 */
export interface GeoScope {
  lat: number;
  lng: number;
  radiusMeters: number;
}
```

`src/modules/catalog/domain/catalog.repository.ts` — lokal `GeoScope` ta'rifini **o'chiring** va
uni re-eksport qiling (mavjud importlar buzilmasin):

```ts
export type { GeoScope } from '../../../common/geo/geo-scope';
```

Run: `npx tsc --noEmit`
Expected: xato yo'q — `catalog-count.sql.ts`, `catalog-groups.service.ts`, `geo-scope.dto.ts`
o'sha nom orqali import qilishda davom etadi.

- [ ] **Step 2: Modelni yozish**

Fayl: `src/modules/discounts/domain/facets.model.ts`

```ts
import type { GeoScope } from '../../../common/geo/geo-scope';

export type { GeoScope };

/**
 * The slice of listings a facet run is computed over: the expanded business types, optionally
 * narrowed by category and location. Everything else (Q4 visibility) is implicit and enforced in
 * `visible-scope.sql.ts`.
 */
export interface FacetScope {
  types: string[];
  categoryKeys: string[];
  geo: GeoScope | null;
}

/** A facet bucket: one selectable value and how many visible listings carry it. */
export interface FacetCount {
  key: string;
  count: number;
}

/** One `(attribute key, raw stored value)` pair with its count, straight out of the jsonb. */
export interface RawAttributeCount {
  key: string;
  value: string;
  count: number;
}

/** Everything one facet run produces. Shaped into the wire DTO by the application layer. */
export interface ListingFacets {
  total: number;
  categories: FacetCount[];
  attributes: RawAttributeCount[];
  priceUnits: FacetCount[];
  priceRange: { min: number; max: number } | null;
  discountTypes: FacetCount[];
  discountPercentRange: { min: number; max: number } | null;
  redemptionMethods: FacetCount[];
  listingKind: { discount: number; regular: number };
  regions: FacetCount[];
  districts: FacetCount[];
  tradeCenters: FacetCount[];
}
```

- [ ] **Step 3: Portni yozish**

Fayl: `src/modules/discounts/domain/facet.repository.ts`

```ts
import { FacetScope, ListingFacets } from './facets.model';

/** Injection token for the facet repository port (bound to the Prisma impl in the module). */
export const FACET_REPOSITORY = Symbol('FACET_REPOSITORY');

/**
 * Read-only aggregation over visible listings. The application layer depends on this interface
 * only; every SQL detail lives in the infrastructure layer.
 */
export interface FacetRepository {
  /**
   * Every facet for `scope`, computed over listings that are visible per STUDENT_FEED.md Q4
   * (listing ACTIVE, business APPROVED, validFrom <= now <= validTo). An empty `scope.types`
   * yields zeroed facets without touching the database.
   */
  findFacets(scope: FacetScope): Promise<ListingFacets>;
}
```

- [ ] **Step 4: `AttributeSpec` ga `businessType` va `suffix` qo'shish**

Filtr sxemasi har atributda `appliesToTypes` (qaysi turlarga tegishli) va `suffix` («gramm»,
«daqiqa») ni qaytaradi. Ikkalasi ham `attribute_specs` jadvalida bor, lekin domain entity'ga
ko'chirilmagan — mapper ularni tashlab yuboradi.

`src/modules/catalog/domain/entities/attribute-spec.entity.ts` — interfeysni almashtiring:

```ts
export interface AttributeSpec {
  /** Owning business type — the filter schema reports it as `appliesToTypes`. */
  businessType: string;
  key: string;
  label: string;
  kind: AttributeFieldType;
  required: boolean;
  /** Unit shown next to a NUMBER input ("gramm", "daqiqa"). */
  suffix: string | null;
  options: string[] | null;
}
```

`src/modules/catalog/infrastructure/catalog.mapper.ts` — `toAttributeSpec` ni almashtiring:

```ts
  static toAttributeSpec(spec: AttributeSpecRow): AttributeSpec {
    return {
      businessType: spec.businessType,
      key: spec.key,
      label: spec.label,
      kind: AttributeFieldType[spec.kind],
      required: spec.required,
      suffix: spec.suffix,
      options: toAttributeSpecOptions(spec.options),
    };
  }
```

- [ ] **Step 5: Mavjud testlarni moslashtirish**

Run: `npx tsc --noEmit`
Expected: FAIL — `listings.service.spec.ts` va `catalog.service.spec.ts` dagi `AttributeSpec`
fixturalari endi to'liq emas.

Har bir xato ko'rsatgan fixturaga ikki maydon qo'shing (turni fixtura kontekstiga mos qo'ying,
masalan `'CAFE_RESTAURANT'` o'rniga `'NATIONAL_FOOD'` kabi mavjud tur emas — bu **domain**
obyekti, DB'ga tegmaydi, shuning uchun istalgan satr bo'lishi mumkin):

```ts
    businessType: 'NATIONAL_FOOD',
    suffix: null,
```

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/common/geo src/modules/discounts/domain src/modules/catalog
git commit -m "feat(discounts): add the listing facet domain model and repository port"
```

---

### Task 4: Infrastructure — qamrov fragmenti va agregat so'rovlar

**Files:**
- Create: `src/modules/discounts/infrastructure/visible-scope.sql.ts`
- Create: `src/modules/discounts/infrastructure/facet.sql.ts`

- [ ] **Step 1: Qamrov fragmentini yozish**

Fayl: `src/modules/discounts/infrastructure/visible-scope.sql.ts`

```ts
import { Prisma } from '@prisma/client';
import type { FacetScope } from '../domain/facets.model';

/**
 * The single source of truth for "which listings may a student see" (STUDENT_FEED.md Q4):
 * listing ACTIVE + business APPROVED + validFrom <= now() <= validTo. Every facet query and,
 * from the next slice, the search query build on this — so a visibility rule is fixed in one
 * place rather than in each aggregate.
 *
 * Callers alias `listings` as `l` and `businesses` as `b`.
 */
export const VISIBLE_LISTING: Prisma.Sql = Prisma.sql`
  l.status = 'ACTIVE'
  AND b.status = 'APPROVED'
  AND l.valid_from <= now()
  AND l.valid_to >= now()
`;

/** `FROM listings l JOIN businesses b` plus the type/category narrowing common to every facet. */
export function scopedFrom(scope: FacetScope): Prisma.Sql {
  const category =
    scope.categoryKeys.length === 0
      ? Prisma.empty
      : Prisma.sql`AND l.category_key IN (${Prisma.join(scope.categoryKeys)})`;

  const geo =
    scope.geo === null
      ? Prisma.empty
      : Prisma.sql`
          AND EXISTS (
            SELECT 1 FROM listing_branches lb
            JOIN branches br ON br.id = lb.branch_id
            WHERE lb.listing_id = l.id
              AND br.is_active = true
              AND br.geo_point IS NOT NULL
              AND ST_DWithin(
                    br.geo_point,
                    ST_SetSRID(ST_MakePoint(${scope.geo.lng}, ${scope.geo.lat}), 4326)::geography,
                    ${scope.geo.radiusMeters}
                  )
          )`;

  return Prisma.sql`
    FROM listings l
    JOIN businesses b ON b.id = l.business_id
    WHERE ${VISIBLE_LISTING}
      AND b.type IN (${Prisma.join(scope.types)})
      ${category}
      ${geo}
  `;
}
```

> `geo` `EXISTS` bilan yozilgan, `JOIN` bilan emas — bu ko'p filialli e'lonni takrorlamaydi, shuning uchun `COUNT(*)` hamma joyda to'g'ri qoladi va `COUNT(DISTINCT)` kerak bo'lmaydi.

- [ ] **Step 2: Agregat so'rovlarni yozish**

Fayl: `src/modules/discounts/infrastructure/facet.sql.ts`

```ts
import { Prisma } from '@prisma/client';
import type { FacetScope } from '../domain/facets.model';
import { scopedFrom } from './visible-scope.sql';

export interface KeyCountRow {
  key: string;
  count: number;
}

export interface AttributeCountRow {
  key: string;
  value: string;
  count: number;
}

export interface RangeRow {
  min: number | null;
  max: number | null;
}

export interface KindRow {
  discount: number;
  regular: number;
}

/** Visible listings per category key. */
export function categoryFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT l.category_key AS key, COUNT(*)::int AS count ${scopedFrom(scope)} GROUP BY l.category_key`;
}

/**
 * Every `(attribute key, stored value)` pair with its count, in one pass. `jsonb_each_text`
 * expands the map so no per-key SQL is needed (Q6) — the application layer decides what each key
 * means from the catalog's AttributeKind. TAGS values arrive comma-joined and are split there.
 */
export function attributeFacet(scope: FacetScope): Prisma.Sql {
  // `scopedFrom` already ends in a WHERE clause, so a LATERAL join cannot follow it — the scope
  // goes into a subquery and the expansion happens outside.
  return Prisma.sql`
    SELECT attr.key AS key, attr.value AS value, COUNT(*)::int AS count
    FROM (SELECT l.attributes ${scopedFrom(scope)}) AS visible
    CROSS JOIN LATERAL jsonb_each_text(visible.attributes) AS attr(key, value)
    WHERE visible.attributes IS NOT NULL
    GROUP BY attr.key, attr.value
  `;
}

/** Visible listings per price unit. */
export function priceUnitFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT l.price_unit::text AS key, COUNT(*)::int AS count ${scopedFrom(scope)} GROUP BY l.price_unit`;
}

/** Final-price bounds — the basis the feed sorts and filters on by default. */
export function priceRangeFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT MIN(l.final_price)::int AS min, MAX(l.final_price)::int AS max ${scopedFrom(scope)}`;
}

/** Discount types, excluding regular listings (their stored type is a placeholder). */
export function discountTypeFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT l.discount_type::text AS key, COUNT(*)::int AS count ${scopedFrom(scope)} AND l.is_discount = true GROUP BY l.discount_type`;
}

/** Normalised discount-percent bounds across the discount listings. */
export function discountPercentRangeFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT MIN(l.discount_percent)::int AS min, MAX(l.discount_percent)::int AS max ${scopedFrom(scope)} AND l.is_discount = true`;
}

/** Visible listings per redemption method. */
export function redemptionFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT l.redemption_method::text AS key, COUNT(*)::int AS count ${scopedFrom(scope)} GROUP BY l.redemption_method`;
}

/** DISCOUNT vs REGULAR split (PROMPT_REGULAR_LISTINGS §4). The two always sum to `total`. */
export function listingKindFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE l.is_discount)::int AS discount,
      COUNT(*) FILTER (WHERE NOT l.is_discount)::int AS regular
    ${scopedFrom(scope)}
  `;
}

/** Total visible listings — must equal the sum of any single facet dimension. */
export function totalFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT COUNT(*)::int AS count ${scopedFrom(scope)}`;
}

/**
 * Region / district / trade-centre counts. A listing is counted once per distinct location id
 * even when several of its branches share it — hence `COUNT(DISTINCT l.id)`.
 */
export function locationFacet(
  scope: FacetScope,
  column: 'region_id' | 'district_id' | 'trade_center_id',
): Prisma.Sql {
  // Same shape as attributeFacet: scope first as a subquery, branches joined outside it.
  // COUNT(DISTINCT) because one listing can have several branches sharing a district.
  return Prisma.sql`
    SELECT br.${Prisma.raw(column)}::text AS key, COUNT(DISTINCT visible.id)::int AS count
    FROM (SELECT l.id ${scopedFrom(scope)}) AS visible
    JOIN listing_branches lb ON lb.listing_id = visible.id
    JOIN branches br ON br.id = lb.branch_id AND br.is_active = true
    WHERE br.${Prisma.raw(column)} IS NOT NULL
    GROUP BY br.${Prisma.raw(column)}
  `;
}
```

> `Prisma.raw` bu yerda xavfsiz: `column` — funksiya imzosidagi uchta literal'dan biri, foydalanuvchi kiritmasi emas.

- [ ] **Step 3: SQL'ni haqiqiy bazada tekshirish**

Har bir agregat sintaktik to'g'ri ekanini kod yozishdan oldin tasdiqlang. `psql` da:

```bash
docker exec elonuz-db psql -U elonuz -d elonuz -c "
SELECT attr.key, attr.value, COUNT(*)::int
FROM (SELECT l.attributes FROM listings l JOIN businesses b ON b.id = l.business_id
      WHERE l.status='ACTIVE' AND b.status='APPROVED'
        AND l.valid_from <= now() AND l.valid_to >= now()) AS visible
CROSS JOIN LATERAL jsonb_each_text(visible.attributes) AS attr(key, value)
WHERE visible.attributes IS NOT NULL
GROUP BY attr.key, attr.value;"

docker exec elonuz-db psql -U elonuz -d elonuz -c "
SELECT br.district_id::text AS key, COUNT(DISTINCT visible.id)::int AS count
FROM (SELECT l.id FROM listings l JOIN businesses b ON b.id = l.business_id
      WHERE l.status='ACTIVE' AND b.status='APPROVED') AS visible
JOIN listing_branches lb ON lb.listing_id = visible.id
JOIN branches br ON br.id = lb.branch_id AND br.is_active = true
WHERE br.district_id IS NOT NULL
GROUP BY br.district_id;"
```

Expected: ikkalasi ham `(0 rows)` qaytaradi — baza bo'sh, lekin **sintaksis xatosi yo'q**.
Xato chiqsa, kod yozishdan oldin shu yerda tuzating.

- [ ] **Step 4: Kompilyatsiya**

Run: `npx tsc --noEmit`
Expected: xato yo'q.

- [ ] **Step 5: Commit**

```bash
git add src/modules/discounts/infrastructure
git commit -m "feat(discounts): add the visible-listing scope fragment and facet aggregates"
```

---

### Task 5: Atribut shaper — eng nozik mantiq

**Files:**
- Create: `src/modules/discounts/application/attribute-facet.shaper.ts`
- Test: `src/modules/discounts/application/attribute-facet.shaper.spec.ts`

- [ ] **Step 1: Failing testni yozish**

Fayl: `src/modules/discounts/application/attribute-facet.shaper.spec.ts`

```ts
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import { AttributeSpec } from '../../catalog/domain/entities/attribute-spec.entity';
import { RawAttributeCount } from '../domain/facets.model';
import { shapeAttributeFacets } from './attribute-facet.shaper';

function spec(key: string, kind: AttributeFieldType, businessType = 'PLAYSTATION'): AttributeSpec {
  return { businessType, key, label: key, kind, required: false, suffix: null, options: null };
}

describe('shapeAttributeFacets', () => {
  it('drops keys the catalog does not declare, including the reserved ones', () => {
    const raw: RawAttributeCount[] = [
      { key: 'hallType', value: 'VIP', count: 3 },
      { key: '_regular', value: '1', count: 9 },
      { key: '_phone', value: '+998901234567', count: 4 },
      { key: 'ghost', value: 'x', count: 7 },
    ];

    const shaped = shapeAttributeFacets(raw, [spec('hallType', AttributeFieldType.SELECT)]);

    expect(shaped.map((a) => a.key)).toEqual(['hallType']);
  });

  it('splits comma-joined TAGS values and sums their counts', () => {
    const raw: RawAttributeCount[] = [
      { key: 'games', value: 'CS2,Dota 2', count: 2 },
      { key: 'games', value: 'CS2', count: 5 },
    ];

    const [games] = shapeAttributeFacets(raw, [spec('games', AttributeFieldType.TAGS)]);

    expect(games.values).toEqual([
      { value: 'CS2', count: 7 },
      { value: 'Dota 2', count: 2 },
    ]);
  });

  it('reports NUMBER attributes as a range, not a value list', () => {
    const raw: RawAttributeCount[] = [
      { key: 'portionGrams', value: '450', count: 2 },
      { key: 'portionGrams', value: '150', count: 1 },
      { key: 'portionGrams', value: '800', count: 3 },
    ];

    const [portion] = shapeAttributeFacets(raw, [spec('portionGrams', AttributeFieldType.NUMBER)]);

    expect(portion.range).toEqual({ min: 150, max: 800 });
    expect(portion.values).toBeUndefined();
  });

  it('ignores non-numeric values when computing a NUMBER range', () => {
    const raw: RawAttributeCount[] = [
      { key: 'portionGrams', value: '450', count: 2 },
      { key: 'portionGrams', value: 'katta', count: 1 },
    ];

    const [portion] = shapeAttributeFacets(raw, [spec('portionGrams', AttributeFieldType.NUMBER)]);

    expect(portion.range).toEqual({ min: 450, max: 450 });
  });

  it('exposes no values for TEXT — it is only searchable with CONTAINS', () => {
    const raw: RawAttributeCount[] = [{ key: 'brand', value: 'Zara', count: 4 }];

    const [brand] = shapeAttributeFacets(raw, [spec('brand', AttributeFieldType.TEXT)]);

    expect(brand.values).toBeUndefined();
    expect(brand.range).toBeUndefined();
    expect(brand.operators).toEqual(['EQ', 'NEQ', 'CONTAINS', 'EXISTS']);
  });

  it('lists the operators the server allows for each kind (Q6)', () => {
    const raw: RawAttributeCount[] = [{ key: 'isHalal', value: 'true', count: 1 }];

    const [halal] = shapeAttributeFacets(raw, [spec('isHalal', AttributeFieldType.BOOLEAN)]);

    expect(halal.operators).toEqual(['EQ', 'EXISTS']);
  });

  it('only reports values that actually occur, sorted by count', () => {
    const raw: RawAttributeCount[] = [
      { key: 'spicyLevel', value: 'Yengil', count: 4 },
      { key: 'spicyLevel', value: "Yo'q", count: 9 },
    ];

    const [spicy] = shapeAttributeFacets(raw, [spec('spicyLevel', AttributeFieldType.SELECT)]);

    // The catalog declares four levels; only the two in the data come back (§9).
    expect(spicy.values).toEqual([
      { value: "Yo'q", count: 9 },
      { value: 'Yengil', count: 4 },
    ]);
  });

  it('merges the same key across several business types into one entry', () => {
    const raw: RawAttributeCount[] = [{ key: 'isHalal', value: 'true', count: 6 }];
    const specs = [
      spec('isHalal', AttributeFieldType.BOOLEAN, 'NATIONAL_FOOD'),
      spec('isHalal', AttributeFieldType.BOOLEAN, 'FAST_FOOD'),
    ];

    const shaped = shapeAttributeFacets(raw, specs);

    expect(shaped).toHaveLength(1);
    expect(shaped[0].appliesToTypes).toEqual(['NATIONAL_FOOD', 'FAST_FOOD']);
  });
});
```

- [ ] **Step 2: Testni ishga tushirish (uzilishi kerak)**

Run: `npm test -- attribute-facet.shaper`
Expected: FAIL — `Cannot find module './attribute-facet.shaper'`

- [ ] **Step 3: Shaper'ni yozish**

Fayl: `src/modules/discounts/application/attribute-facet.shaper.ts`

```ts
import { AttributeSpec } from '../../catalog/domain/entities/attribute-spec.entity';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import { RawAttributeCount } from '../domain/facets.model';

/** Operators the server permits per attribute kind (STUDENT_FEED.md §5). */
const OPERATORS: Record<AttributeFieldType, string[]> = {
  [AttributeFieldType.TEXT]: ['EQ', 'NEQ', 'CONTAINS', 'EXISTS'],
  [AttributeFieldType.NUMBER]: ['EQ', 'NEQ', 'BETWEEN', 'GTE', 'LTE', 'EXISTS'],
  [AttributeFieldType.BOOLEAN]: ['EQ', 'EXISTS'],
  [AttributeFieldType.SELECT]: ['EQ', 'NEQ', 'IN', 'NOT_IN', 'EXISTS'],
  [AttributeFieldType.MULTI_SELECT]: ['ANY', 'ALL', 'EXISTS'],
  [AttributeFieldType.TAGS]: ['ANY', 'ALL', 'EXISTS'],
};

/** Kinds whose stored value is a comma-joined list rather than a single value. */
const MULTI_VALUE = new Set([AttributeFieldType.MULTI_SELECT, AttributeFieldType.TAGS]);

/** Kinds the client filters by picking from a list. TEXT and NUMBER are not among them. */
const VALUE_LISTED = new Set([
  AttributeFieldType.SELECT,
  AttributeFieldType.BOOLEAN,
  AttributeFieldType.MULTI_SELECT,
  AttributeFieldType.TAGS,
]);

export interface ShapedAttributeFacet {
  key: string;
  label: string;
  kind: AttributeFieldType;
  suffix: string | null;
  appliesToTypes: string[];
  operators: string[];
  values?: { value: string; count: number }[];
  range?: { min: number; max: number };
}

/**
 * Turns the raw `(key, value, count)` rows into the per-attribute schema the filter screen is
 * built from (Q6). The catalog decides what each key means; anything not declared for the selected
 * types is dropped, which also removes the reserved keys (`_regular`, `_phone`, `_gender`) since
 * they never appear as attribute specs.
 *
 * Only values that actually occur in the data come back — the client must not be able to pick a
 * filter that yields zero results (§9).
 */
export function shapeAttributeFacets(
  raw: RawAttributeCount[],
  specs: AttributeSpec[],
): ShapedAttributeFacet[] {
  const byKey = new Map<string, ShapedAttributeFacet>();

  for (const spec of specs) {
    const existing = byKey.get(spec.key);
    if (existing === undefined) {
      byKey.set(spec.key, {
        key: spec.key,
        label: spec.label,
        kind: spec.kind,
        suffix: spec.suffix ?? null,
        appliesToTypes: [spec.businessType],
        operators: OPERATORS[spec.kind],
      });
      continue;
    }
    // Same key declared by several selected types — merge rather than duplicate.
    if (!existing.appliesToTypes.includes(spec.businessType)) {
      existing.appliesToTypes.push(spec.businessType);
    }
  }

  const counts = new Map<string, Map<string, number>>();
  const numbers = new Map<string, number[]>();

  for (const row of raw) {
    const facet = byKey.get(row.key);
    if (facet === undefined) {
      continue;
    }

    if (facet.kind === AttributeFieldType.NUMBER) {
      const parsed = Number(row.value);
      if (Number.isFinite(parsed)) {
        const list = numbers.get(row.key) ?? [];
        list.push(parsed);
        numbers.set(row.key, list);
      }
      continue;
    }

    if (!VALUE_LISTED.has(facet.kind)) {
      continue;
    }

    const values = MULTI_VALUE.has(facet.kind)
      ? row.value
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
      : [row.value];

    const bucket = counts.get(row.key) ?? new Map<string, number>();
    for (const value of values) {
      bucket.set(value, (bucket.get(value) ?? 0) + row.count);
    }
    counts.set(row.key, bucket);
  }

  for (const [key, facet] of byKey) {
    const numeric = numbers.get(key);
    if (numeric !== undefined && numeric.length > 0) {
      facet.range = { min: Math.min(...numeric), max: Math.max(...numeric) };
      continue;
    }
    const bucket = counts.get(key);
    if (bucket !== undefined && bucket.size > 0) {
      facet.values = [...bucket]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
  }

  return [...byKey.values()];
}
```

- [ ] **Step 4: Testni ishga tushirish**

Run: `npm test -- attribute-facet.shaper`
Expected: PASS — 8 test.

- [ ] **Step 5: Commit**

```bash
git add src/modules/discounts/application/attribute-facet.shaper.ts src/modules/discounts/application/attribute-facet.shaper.spec.ts
git commit -m "feat(discounts): shape raw jsonb attribute counts into the filter schema"
```

---

### Task 6: Repository implementatsiyasi va kesh

**Files:**
- Create: `src/modules/discounts/infrastructure/facet.prisma.repository.ts`

- [ ] **Step 1: Repository'ni yozish**

Fayl: `src/modules/discounts/infrastructure/facet.prisma.repository.ts`

```ts
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { FacetRepository } from '../domain/facet.repository';
import { FacetScope, ListingFacets } from '../domain/facets.model';
import {
  AttributeCountRow,
  KeyCountRow,
  KindRow,
  RangeRow,
  attributeFacet,
  categoryFacet,
  discountPercentRangeFacet,
  discountTypeFacet,
  listingKindFacet,
  locationFacet,
  priceRangeFacet,
  priceUnitFacet,
  redemptionFacet,
  totalFacet,
} from './facet.sql';

/** Facets change as slowly as the listings behind them; 5 minutes matches the catalog counts. */
const CACHE_TTL_SECONDS = 300;

const EMPTY: ListingFacets = {
  total: 0,
  categories: [],
  attributes: [],
  priceUnits: [],
  priceRange: null,
  discountTypes: [],
  discountPercentRange: null,
  redemptionMethods: [],
  listingKind: { discount: 0, regular: 0 },
  regions: [],
  districts: [],
  tradeCenters: [],
};

/** Prisma implementation of the facet port. SQL lives in `facet.sql.ts`; Prisma is used ONLY here. */
@Injectable()
export class FacetPrismaRepository implements FacetRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findFacets(scope: FacetScope): Promise<ListingFacets> {
    if (scope.types.length === 0) {
      return EMPTY;
    }

    const key = cacheKey(scope);
    const cached = await this.redis.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as ListingFacets;
    }

    const [
      total,
      categories,
      attributes,
      priceUnits,
      priceRange,
      discountTypes,
      discountPercentRange,
      redemptionMethods,
      kind,
      regions,
      districts,
      tradeCenters,
    ] = await Promise.all([
      this.prisma.$queryRaw<KeyCountRow[]>(totalFacet(scope)),
      this.prisma.$queryRaw<KeyCountRow[]>(categoryFacet(scope)),
      this.prisma.$queryRaw<AttributeCountRow[]>(attributeFacet(scope)),
      this.prisma.$queryRaw<KeyCountRow[]>(priceUnitFacet(scope)),
      this.prisma.$queryRaw<RangeRow[]>(priceRangeFacet(scope)),
      this.prisma.$queryRaw<KeyCountRow[]>(discountTypeFacet(scope)),
      this.prisma.$queryRaw<RangeRow[]>(discountPercentRangeFacet(scope)),
      this.prisma.$queryRaw<KeyCountRow[]>(redemptionFacet(scope)),
      this.prisma.$queryRaw<KindRow[]>(listingKindFacet(scope)),
      this.prisma.$queryRaw<KeyCountRow[]>(locationFacet(scope, 'region_id')),
      this.prisma.$queryRaw<KeyCountRow[]>(locationFacet(scope, 'district_id')),
      this.prisma.$queryRaw<KeyCountRow[]>(locationFacet(scope, 'trade_center_id')),
    ]);

    const facets: ListingFacets = {
      total: total[0]?.count ?? 0,
      categories,
      attributes,
      priceUnits,
      priceRange: toRange(priceRange[0]),
      discountTypes,
      discountPercentRange: toRange(discountPercentRange[0]),
      redemptionMethods,
      listingKind: { discount: kind[0]?.discount ?? 0, regular: kind[0]?.regular ?? 0 },
      regions,
      districts,
      tradeCenters,
    };

    await this.redis.set(key, JSON.stringify(facets), CACHE_TTL_SECONDS);
    return facets;
  }
}

/** `MIN`/`MAX` over an empty set return NULL — that is "no range", not zero. */
function toRange(row: RangeRow | undefined): { min: number; max: number } | null {
  if (row === undefined || row.min === null || row.max === null) {
    return null;
  }
  return { min: row.min, max: row.max };
}

/**
 * Cache key. Types and categories are sorted so two requests that differ only in order share an
 * entry; coordinates are rounded to ~1 km for the same reason as the catalog counts.
 */
function cacheKey(scope: FacetScope): string {
  const types = [...scope.types].sort().join(',');
  const categories = [...scope.categoryKeys].sort().join(',');
  const geo =
    scope.geo === null
      ? 'nogeo'
      : `${scope.geo.lat.toFixed(2)}:${scope.geo.lng.toFixed(2)}:${scope.geo.radiusMeters}`;
  return `discounts:facets:${types}|${categories}|${geo}`;
}
```

- [ ] **Step 2: Kompilyatsiya**

Run: `npx tsc --noEmit`
Expected: xato yo'q.

- [ ] **Step 3: Commit**

```bash
git add src/modules/discounts/infrastructure/facet.prisma.repository.ts
git commit -m "feat(discounts): implement the facet repository with a 5-minute cache"
```

---

### Task 7: Application — `FilterSchemaService`

**Files:**
- Create: `src/modules/discounts/application/filter-schema.service.ts`
- Test: `src/modules/discounts/application/filter-schema.service.spec.ts`

- [ ] **Step 1: Failing testni yozish**

Fayl: `src/modules/discounts/application/filter-schema.service.spec.ts`

```ts
import { CatalogRepository } from '../../catalog/domain/catalog.repository';
import { AppException } from '../../../common/exceptions/app.exception';
import { FacetRepository } from '../domain/facet.repository';
import { ListingFacets } from '../domain/facets.model';
import { FilterSchemaService } from './filter-schema.service';

const EMPTY_FACETS: ListingFacets = {
  total: 0,
  categories: [],
  attributes: [],
  priceUnits: [],
  priceRange: null,
  discountTypes: [],
  discountPercentRange: null,
  redemptionMethods: [],
  listingKind: { discount: 0, regular: 0 },
  regions: [],
  districts: [],
  tradeCenters: [],
};

function makeCatalog(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    findBusinessTypes: jest.fn().mockResolvedValue([]),
    findGroups: jest.fn().mockResolvedValue([]),
    findBusinessTypesByGroups: jest.fn().mockResolvedValue([]),
    groupExists: jest.fn().mockResolvedValue(true),
    countVisibleListingsByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    countCategoriesByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    findCategoriesByType: jest.fn().mockResolvedValue([]),
    findAttributeSpecs: jest.fn().mockResolvedValue([]),
    typeExists: jest.fn().mockResolvedValue(true),
    createType: jest.fn(),
    updateType: jest.fn(),
    deleteType: jest.fn(),
    countBusinessesOfType: jest.fn().mockResolvedValue(0),
    countCategoriesOfType: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function makeFacets(facets: Partial<ListingFacets> = {}): FacetRepository {
  return { findFacets: jest.fn().mockResolvedValue({ ...EMPTY_FACETS, ...facets }) };
}

describe('FilterSchemaService', () => {
  it('expands groupKeys into their types before querying facets', async () => {
    const catalog = makeCatalog({
      findGroups: jest.fn().mockResolvedValue([
        {
          key: 'FOOD',
          nameUz: 'Ovqatlanish',
          nameRu: null,
          emoji: null,
          icon: null,
          accentColor: null,
          sortOrder: 1,
          typeKeys: ['NATIONAL_FOOD', 'FAST_FOOD'],
        },
      ]),
    });
    const facets = makeFacets();
    const service = new FilterSchemaService(catalog, facets);

    await service.getSchema({ groupKeys: ['FOOD'], types: [], categoryKeys: [], geo: null });

    expect(facets.findFacets).toHaveBeenCalledWith(
      expect.objectContaining({ types: ['NATIONAL_FOOD', 'FAST_FOOD'] }),
    );
  });

  it('narrows the expansion when explicit types are given', async () => {
    const catalog = makeCatalog({
      findGroups: jest.fn().mockResolvedValue([
        {
          key: 'FOOD',
          nameUz: 'Ovqatlanish',
          nameRu: null,
          emoji: null,
          icon: null,
          accentColor: null,
          sortOrder: 1,
          typeKeys: ['NATIONAL_FOOD', 'FAST_FOOD'],
        },
      ]),
    });
    const facets = makeFacets();
    const service = new FilterSchemaService(catalog, facets);

    await service.getSchema({
      groupKeys: ['FOOD'],
      types: ['NATIONAL_FOOD'],
      categoryKeys: [],
      geo: null,
    });

    expect(facets.findFacets).toHaveBeenCalledWith(
      expect.objectContaining({ types: ['NATIONAL_FOOD'] }),
    );
  });

  it('rejects a type that is not in the selected groups (TYPE_GROUP_MISMATCH)', async () => {
    const catalog = makeCatalog({
      findGroups: jest.fn().mockResolvedValue([
        {
          key: 'FOOD',
          nameUz: 'Ovqatlanish',
          nameRu: null,
          emoji: null,
          icon: null,
          accentColor: null,
          sortOrder: 1,
          typeKeys: ['NATIONAL_FOOD'],
        },
      ]),
    });
    const service = new FilterSchemaService(catalog, makeFacets());

    await expect(
      service.getSchema({ groupKeys: ['FOOD'], types: ['TENNIS'], categoryKeys: [], geo: null }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an unknown group key (UNKNOWN_GROUP)', async () => {
    const service = new FilterSchemaService(
      makeCatalog({ findGroups: jest.fn().mockResolvedValue([]) }),
      makeFacets(),
    );

    await expect(
      service.getSchema({ groupKeys: ['NOPE'], types: [], categoryKeys: [], geo: null }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('reports listingKind buckets that sum to the total', async () => {
    const catalog = makeCatalog({
      findGroups: jest.fn().mockResolvedValue([
        {
          key: 'FOOD',
          nameUz: 'Ovqatlanish',
          nameRu: null,
          emoji: null,
          icon: null,
          accentColor: null,
          sortOrder: 1,
          typeKeys: ['NATIONAL_FOOD'],
        },
      ]),
    });
    const service = new FilterSchemaService(
      catalog,
      makeFacets({ total: 12, listingKind: { discount: 8, regular: 4 } }),
    );

    const schema = await service.getSchema({
      groupKeys: ['FOOD'],
      types: [],
      categoryKeys: [],
      geo: null,
    });

    expect(schema.total).toBe(12);
    expect(schema.listingKind).toEqual([
      { key: 'ALL', count: 12 },
      { key: 'DISCOUNT', count: 8 },
      { key: 'REGULAR', count: 4 },
    ]);
  });
});
```

- [ ] **Step 2: Testni ishga tushirish (uzilishi kerak)**

Run: `npm test -- filter-schema.service`
Expected: FAIL — `Cannot find module './filter-schema.service'`

- [ ] **Step 3: Service'ni yozish**

Fayl: `src/modules/discounts/application/filter-schema.service.ts`

```ts
import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../catalog/domain/catalog.repository';
import { AttributeSpec } from '../../catalog/domain/entities/attribute-spec.entity';
import { FACET_REPOSITORY, FacetRepository } from '../domain/facet.repository';
import { FacetCount, GeoScope } from '../domain/facets.model';
import { ShapedAttributeFacet, shapeAttributeFacets } from './attribute-facet.shaper';

/** What the client asked to build a filter screen for. */
export interface FilterSchemaQuery {
  groupKeys: string[];
  types: string[];
  categoryKeys: string[];
  geo: GeoScope | null;
}

/** Sorts the feed offers, and whether each needs coordinates (STUDENT_FEED.md §6). */
const SORTS = [
  { key: 'DISTANCE', label: 'Yaqinlik', requiresGeo: true },
  { key: 'PRICE_FINAL', label: 'Arzon', requiresGeo: false },
  { key: 'DISCOUNT_PERCENT', label: 'Chegirma %', requiresGeo: false },
  { key: 'NEWEST', label: 'Yangi', requiresGeo: false },
  { key: 'ENDING_SOON', label: 'Tugayapti', requiresGeo: false },
  { key: 'POPULAR', label: 'Ommabop', requiresGeo: false },
];

export interface FilterSchema {
  types: { key: string; nameUz: string; emoji: string | null; listingsCount: number }[];
  categories: { key: string; label: string; typeKey: string; count: number }[];
  attributes: ShapedAttributeFacet[];
  listingKind: FacetCount[];
  priceUnits: FacetCount[];
  priceRange: { min: number; max: number } | null;
  discountTypes: FacetCount[];
  discountPercentRange: { min: number; max: number } | null;
  redemptionMethods: FacetCount[];
  regions: FacetCount[];
  districts: FacetCount[];
  tradeCenters: FacetCount[];
  sorts: typeof SORTS;
  total: number;
}

/**
 * Builds the filter screen's schema (STUDENT_FEED.md §9, Q6): the catalog says what *could* be
 * filtered, the facets say what *actually occurs*, and only their intersection is returned — so a
 * user can never pick a filter that yields nothing.
 */
@Injectable()
export class FilterSchemaService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(FACET_REPOSITORY) private readonly facets: FacetRepository,
  ) {}

  async getSchema(query: FilterSchemaQuery): Promise<FilterSchema> {
    const types = await this.resolveTypes(query);
    const scope = { types, categoryKeys: query.categoryKeys, geo: query.geo };

    const [facets, typeInfos, specs, categoryLabels] = await Promise.all([
      this.facets.findFacets(scope),
      this.catalog.findBusinessTypesByGroups(query.groupKeys),
      this.collectSpecs(types),
      this.collectCategoryLabels(types),
    ]);

    const typeCounts = new Map<string, number>();
    for (const category of facets.categories) {
      const label = categoryLabels.get(category.key);
      if (label !== undefined) {
        typeCounts.set(label.typeKey, (typeCounts.get(label.typeKey) ?? 0) + category.count);
      }
    }

    return {
      types: typeInfos
        .filter((info) => types.includes(info.type))
        .map((info) => ({
          key: info.type,
          nameUz: info.nameUz,
          emoji: info.emoji,
          listingsCount: typeCounts.get(info.type) ?? 0,
        })),
      categories: facets.categories
        .filter((category) => categoryLabels.has(category.key))
        .map((category) => {
          const label = categoryLabels.get(category.key)!;
          return {
            key: category.key,
            label: label.nameUz,
            typeKey: label.typeKey,
            count: category.count,
          };
        }),
      attributes: shapeAttributeFacets(facets.attributes, specs),
      listingKind: [
        { key: 'ALL', count: facets.total },
        { key: 'DISCOUNT', count: facets.listingKind.discount },
        { key: 'REGULAR', count: facets.listingKind.regular },
      ],
      priceUnits: facets.priceUnits,
      priceRange: facets.priceRange,
      discountTypes: facets.discountTypes,
      discountPercentRange: facets.discountPercentRange,
      redemptionMethods: facets.redemptionMethods,
      regions: facets.regions,
      districts: facets.districts,
      tradeCenters: facets.tradeCenters,
      sorts: SORTS,
      total: facets.total,
    };
  }

  /**
   * `groupKeys` expand to their member types; explicit `types` narrow that expansion. A type that
   * is not in the chosen groups is a client bug, not an empty result — hence 422.
   */
  private async resolveTypes(query: FilterSchemaQuery): Promise<string[]> {
    const groups = await this.catalog.findGroups();
    const known = new Map(groups.map((group) => [group.key, group.typeKeys]));

    const unknown = query.groupKeys.filter((key) => !known.has(key));
    if (unknown.length > 0) {
      throw AppException.validation(
        { groupKeys: `Katalogda bunday guruh yo‘q: ${unknown.join(', ')}` },
        'Noma’lum katalog guruhi',
      );
    }

    const expanded = query.groupKeys.flatMap((key) => known.get(key) ?? []);
    if (query.types.length === 0) {
      return expanded;
    }

    const outside = query.types.filter((type) => !expanded.includes(type));
    if (outside.length > 0) {
      throw AppException.validation(
        { types: `Tanlangan guruhlarga kirmaydigan tur: ${outside.join(', ')}` },
        'Tur va guruh mos kelmadi',
      );
    }
    return query.types;
  }

  /** Attribute specs of every selected type, type-level only (category-level ones need a category). */
  private async collectSpecs(types: string[]): Promise<AttributeSpec[]> {
    const perType = await Promise.all(
      types.map((type) => this.catalog.findAttributeSpecs(type, ALL_CATEGORY_KEY)),
    );
    return perType.flat();
  }

  /** Category key → its label and owning type, for every selected type. */
  private async collectCategoryLabels(
    types: string[],
  ): Promise<Map<string, { nameUz: string; typeKey: string }>> {
    const perType = await Promise.all(types.map((type) => this.catalog.findCategoriesByType(type)));
    const labels = new Map<string, { nameUz: string; typeKey: string }>();
    perType.forEach((categories, index) => {
      for (const category of categories ?? []) {
        if (category.gender === null && !labels.has(category.key)) {
          labels.set(category.key, { nameUz: category.nameUz, typeKey: types[index] });
        }
      }
    });
    return labels;
  }
}

/** The type-wide category every business type declares; used to pull the type-level specs. */
const ALL_CATEGORY_KEY = 'ALL';
```

> `ERROR_CODE` importi ishlatilmasa `npm run lint` uni ko'rsatadi — o'shanda importdan olib tashlang.

- [ ] **Step 4: Testni ishga tushirish**

Run: `npm test -- filter-schema.service`
Expected: PASS — 5 test.

- [ ] **Step 5: Commit**

```bash
git add src/modules/discounts/application/filter-schema.service.ts src/modules/discounts/application/filter-schema.service.spec.ts
git commit -m "feat(discounts): add FilterSchemaService joining the catalog with live facets"
```

---

### Task 8: Presentation va modul

**Files:**
- Create: `src/modules/discounts/presentation/dto/filter-schema-request.dto.ts`
- Create: `src/modules/discounts/presentation/dto/filter-schema.dto.ts`
- Create: `src/modules/discounts/presentation/filter-schema.controller.ts`
- Create: `src/modules/discounts/discounts.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: So'rov DTO'sini yozish**

Fayl: `src/modules/discounts/presentation/dto/filter-schema-request.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { GeoScopeDto } from '../../../catalog/presentation/dto/geo-scope.dto';

/** `POST /v1/catalog/filter-schema` body (STUDENT_FEED.md §9). */
export class FilterSchemaRequestDto {
  @ApiProperty({ type: [String], example: ['FOOD'], minItems: 1, maxItems: 3 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  groupKeys!: string[];

  @ApiProperty({
    required: false,
    type: [String],
    maxItems: 10,
    description: 'Narrows the group expansion. Every entry must belong to one of `groupKeys`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  types?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: 30 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  categoryKeys?: string[];

  @ApiProperty({ required: false, type: GeoScopeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoScopeDto)
  geo?: GeoScopeDto;
}
```

- [ ] **Step 2: Javob DTO'sini yozish**

Fayl: `src/modules/discounts/presentation/dto/filter-schema.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { AttributeFieldType } from '../../../catalog/domain/enums/attribute-field-type.enum';
import { FilterSchema } from '../../application/filter-schema.service';

class FacetCountDto {
  @ApiProperty({ example: 'PERCENT' })
  key!: string;

  @ApiProperty({ example: 188 })
  count!: number;
}

class RangeDto {
  @ApiProperty({ example: 8000 })
  min!: number;

  @ApiProperty({ example: 240000 })
  max!: number;
}

class SchemaTypeDto {
  @ApiProperty({ example: 'NATIONAL_FOOD' })
  key!: string;

  @ApiProperty({ example: 'Milliy taomlar' })
  nameUz!: string;

  @ApiProperty({ required: false, nullable: true, example: '🍛' })
  emoji!: string | null;

  @ApiProperty({ example: 187 })
  listingsCount!: number;
}

class SchemaCategoryDto {
  @ApiProperty({ example: 'PALOV' })
  key!: string;

  @ApiProperty({ example: 'Osh' })
  label!: string;

  @ApiProperty({ example: 'NATIONAL_FOOD' })
  typeKey!: string;

  @ApiProperty({ example: 54 })
  count!: number;
}

class AttributeValueDto {
  @ApiProperty({ example: 'VIP' })
  value!: string;

  @ApiProperty({ example: 22 })
  count!: number;
}

class SchemaAttributeDto {
  @ApiProperty({ example: 'spicyLevel' })
  key!: string;

  @ApiProperty({ example: "O'tkirlik" })
  label!: string;

  @ApiProperty({ enum: AttributeFieldType, enumName: 'AttributeFieldTypeDto' })
  kind!: AttributeFieldType;

  @ApiProperty({ required: false, nullable: true, example: 'gramm' })
  suffix!: string | null;

  @ApiProperty({ type: [String], example: ['NATIONAL_FOOD', 'FAST_FOOD'] })
  appliesToTypes!: string[];

  @ApiProperty({ type: [String], example: ['EQ', 'NEQ', 'IN', 'NOT_IN', 'EXISTS'] })
  operators!: string[];

  @ApiProperty({
    required: false,
    type: [AttributeValueDto],
    description: 'Present for SELECT / BOOLEAN / MULTI_SELECT / TAGS — only values that occur.',
  })
  values?: AttributeValueDto[];

  @ApiProperty({ required: false, type: RangeDto, description: 'Present for NUMBER only.' })
  range?: RangeDto;
}

class SortOptionDto {
  @ApiProperty({ example: 'DISTANCE' })
  key!: string;

  @ApiProperty({ example: 'Yaqinlik' })
  label!: string;

  @ApiProperty({ example: true })
  requiresGeo!: boolean;
}

/** FilterSchemaDto — everything the filter screen is built from (STUDENT_FEED.md §9). */
export class FilterSchemaDto {
  @ApiProperty({ type: [SchemaTypeDto] })
  types!: SchemaTypeDto[];

  @ApiProperty({ type: [SchemaCategoryDto] })
  categories!: SchemaCategoryDto[];

  @ApiProperty({ type: [SchemaAttributeDto] })
  attributes!: SchemaAttributeDto[];

  @ApiProperty({ type: [FacetCountDto], description: 'ALL / DISCOUNT / REGULAR' })
  listingKind!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto] })
  priceUnits!: FacetCountDto[];

  @ApiProperty({ required: false, nullable: true, type: RangeDto })
  priceRange!: RangeDto | null;

  @ApiProperty({ type: [FacetCountDto] })
  discountTypes!: FacetCountDto[];

  @ApiProperty({ required: false, nullable: true, type: RangeDto })
  discountPercentRange!: RangeDto | null;

  @ApiProperty({ type: [FacetCountDto] })
  redemptionMethods!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto] })
  regions!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto] })
  districts!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto] })
  tradeCenters!: FacetCountDto[];

  @ApiProperty({ type: [SortOptionDto] })
  sorts!: SortOptionDto[];

  @ApiProperty({ example: 312 })
  total!: number;

  static fromDomain(schema: FilterSchema): FilterSchemaDto {
    const dto = new FilterSchemaDto();
    dto.types = schema.types;
    dto.categories = schema.categories;
    dto.attributes = schema.attributes.map((attribute) => ({
      key: attribute.key,
      label: attribute.label,
      kind: attribute.kind,
      suffix: attribute.suffix,
      appliesToTypes: attribute.appliesToTypes,
      operators: attribute.operators,
      values: attribute.values,
      range: attribute.range,
    }));
    dto.listingKind = schema.listingKind;
    dto.priceUnits = schema.priceUnits;
    dto.priceRange = schema.priceRange;
    dto.discountTypes = schema.discountTypes;
    dto.discountPercentRange = schema.discountPercentRange;
    dto.redemptionMethods = schema.redemptionMethods;
    dto.regions = schema.regions;
    dto.districts = schema.districts;
    dto.tradeCenters = schema.tradeCenters;
    dto.sorts = schema.sorts.map((sort) => ({ ...sort }));
    dto.total = schema.total;
    return dto;
  }
}
```

- [ ] **Step 3: Controller'ni yozish**

Fayl: `src/modules/discounts/presentation/filter-schema.controller.ts`

```ts
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiOkEnvelope } from '../../../common/swagger/api-envelope.decorator';
import { FilterSchemaService } from '../application/filter-schema.service';
import { FilterSchemaRequestDto } from './dto/filter-schema-request.dto';
import { FilterSchemaDto } from './dto/filter-schema.dto';

/**
 * The filter screen's schema endpoint. Its path sits on the catalog surface, but the logic is
 * listing aggregation — hence the discounts module (see the module docblock).
 */
@ApiTags('Catalog (student feed)')
@Controller('catalog')
export class FilterSchemaController {
  constructor(private readonly filterSchemaService: FilterSchemaService) {}

  @Post('filter-schema')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Which filters are available for the selected groups/types',
    description:
      'The client renders the filter screen straight from this response and never hard-codes a key (Q6). Only values that actually occur in visible listings are returned, each with its count, so no selectable filter can produce zero results.',
  })
  @ApiOkEnvelope(FilterSchemaDto)
  async getFilterSchema(@Body() body: FilterSchemaRequestDto): Promise<FilterSchemaDto> {
    const schema = await this.filterSchemaService.getSchema({
      groupKeys: body.groupKeys,
      types: body.types ?? [],
      categoryKeys: body.categoryKeys ?? [],
      geo: body.geo?.toDomain() ?? null,
    });
    return FilterSchemaDto.fromDomain(schema);
  }
}
```

- [ ] **Step 4: Modulni yozish**

Fayl: `src/modules/discounts/discounts.module.ts`

```ts
import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/cache/redis.module';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FilterSchemaService } from './application/filter-schema.service';
import { FACET_REPOSITORY } from './domain/facet.repository';
import { FacetPrismaRepository } from './infrastructure/facet.prisma.repository';
import { FilterSchemaController } from './presentation/filter-schema.controller';

/**
 * Student feed aggregation. Owns every read that counts or searches listings — the filter schema
 * now, `POST /discounts/search` next — so the Q4 visibility rules live in one place
 * (`visible-scope.sql.ts`) instead of being restated per endpoint.
 *
 * `CatalogModule` is imported for CATALOG_REPOSITORY: the catalog says what *can* be filtered,
 * this module measures what actually *is*.
 */
@Module({
  imports: [PrismaModule, RedisModule, CatalogModule],
  controllers: [FilterSchemaController],
  providers: [FilterSchemaService, { provide: FACET_REPOSITORY, useClass: FacetPrismaRepository }],
})
export class DiscountsModule {}
```

- [ ] **Step 5: `app.module.ts` ga ulash**

`src/app.module.ts` — importlarga qo'shing (alifbo tartibida, `CatalogModule` dan keyin):

```ts
import { DiscountsModule } from './modules/discounts/discounts.module';
```

va `imports` massivida `CatalogModule` dan keyin:

```ts
    DiscountsModule,
```

- [ ] **Step 6: Kompilyatsiya, lint, testlar**

Run: `npx tsc --noEmit`
Expected: xato yo'q.

Run: `npx eslint "src/modules/discounts/**/*.ts" "src/modules/listings/**/*.ts"`
Expected: ogohlantirish yo'q.

Run: `npm test`
Expected: PASS — barcha unit testlar.

- [ ] **Step 7: Swagger'da ko'rinishini tekshirish**

Run: `npm run start:dev` (fonda), keyin:

```bash
curl -s http://localhost:3000/docs/student/json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s);console.log(Object.keys(d.paths).filter(p=>p.includes('catalog')))})"
```
Expected: `[ '/v1/catalog/groups', '/v1/catalog/types', '/v1/catalog/filter-schema' ]`

Serverni to'xtating.

- [ ] **Step 8: Commit**

```bash
git add src/modules/discounts src/app.module.ts
git commit -m "feat(discounts): add POST /v1/catalog/filter-schema"
```

---

### Task 9: E2E — fixturalar bilan

**Files:**
- Create: `test/helpers/listing-fixture.ts`
- Create: `test/filter-schema.e2e-spec.ts`

Baza bo'sh (0 biznes, 0 e'lon), shuning uchun facet testi o'z ma'lumotini yaratadi.

- [ ] **Step 1: Fixture yordamchisini yozish**

Fayl: `test/helpers/listing-fixture.ts`

```ts
import {
  BusinessStatus,
  DiscountType,
  ListingStatus,
  PriceUnit,
  RedemptionMethod,
} from '@prisma/client';
import type { PrismaService } from '../../src/infrastructure/database/prisma.service';

const OWNER_EMAIL = 'e2e-facet-owner@example.com';

export interface SeededListing {
  categoryKey: string;
  attributes: Record<string, string>;
  originalPrice: number;
  finalPrice: number;
  isDiscount: boolean;
  discountPercent: number | null;
}

/**
 * Creates one APPROVED business of `businessType` with an active branch and the given listings,
 * all ACTIVE and in date so they are visible per STUDENT_FEED.md Q4.
 * Returns the business id; pass it to {@link removeFixture}.
 */
export async function seedFixture(
  prisma: PrismaService,
  businessType: string,
  listings: SeededListing[],
): Promise<string> {
  await removeFixture(prisma);

  const owner = await prisma.businessOwner.create({
    data: { email: OWNER_EMAIL, phoneNumber: '+998900000099', phoneVerified: true },
  });

  const region = await prisma.region.findFirstOrThrow();
  const district = await prisma.district.findFirstOrThrow({ where: { regionId: region.id } });

  const business = await prisma.business.create({
    data: {
      ownerId: owner.id,
      type: businessType,
      name: 'E2E Facet Biznes',
      phone: '+998900000099',
      status: BusinessStatus.APPROVED,
    },
  });

  const branch = await prisma.branch.create({
    data: {
      businessId: business.id,
      name: 'Markaziy',
      regionId: region.id,
      districtId: district.id,
      address: 'Test manzil',
      lat: 41.3111,
      lng: 69.2797,
      isActive: true,
      workingHours: [],
    },
  });

  const now = new Date();
  const validFrom = new Date(now.getTime() - 86_400_000);
  const validTo = new Date(now.getTime() + 86_400_000);

  for (const listing of listings) {
    const row = await prisma.listing.create({
      data: {
        businessId: business.id,
        categoryKey: listing.categoryKey,
        title: `E2E ${listing.categoryKey}`,
        priceUnit: PriceUnit.PER_ITEM,
        originalPrice: BigInt(listing.originalPrice),
        discountType: DiscountType.PERCENT,
        discountValue: BigInt(0),
        finalPrice: BigInt(listing.finalPrice),
        redemptionMethod: RedemptionMethod.STUDENT_ID,
        attributes: listing.attributes,
        validFrom,
        validTo,
        status: ListingStatus.ACTIVE,
        isDiscount: listing.isDiscount,
        discountPercent: listing.discountPercent,
      },
    });
    await prisma.listingBranch.create({
      data: { listingId: row.id, branchId: branch.id },
    });
  }

  return business.id;
}

/** Removes everything {@link seedFixture} created. Safe to call when nothing exists. */
export async function removeFixture(prisma: PrismaService): Promise<void> {
  const owner = await prisma.businessOwner.findUnique({ where: { email: OWNER_EMAIL } });
  if (owner === null) {
    return;
  }
  // Listings, branches and businesses cascade from the owner.
  await prisma.businessOwner.delete({ where: { id: owner.id } });
}
```

- [ ] **Step 2: E2E testini yozish**

Fayl: `test/filter-schema.e2e-spec.ts`

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
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { removeFixture, seedFixture } from './helpers/listing-fixture';

interface Facet {
  key: string;
  count: number;
}

interface AttributeFacet {
  key: string;
  kind: string;
  operators: string[];
  values?: { value: string; count: number }[];
  range?: { min: number; max: number };
}

describe('Filter schema (student feed) — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const body = (extra: Record<string, unknown> = {}) => ({ groupKeys: ['FOOD'], ...extra });

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

    prisma = app.get(PrismaService);
    await seedFixture(prisma, 'NATIONAL_FOOD', [
      {
        categoryKey: 'PALOV',
        attributes: { isHalal: 'true', spicyLevel: 'Yengil', portionGrams: '450' },
        originalPrice: 30000,
        finalPrice: 21000,
        isDiscount: true,
        discountPercent: 30,
      },
      {
        categoryKey: 'PALOV',
        attributes: { isHalal: 'true', spicyLevel: "Yo'q", portionGrams: '150' },
        originalPrice: 25000,
        finalPrice: 25000,
        isDiscount: false,
        discountPercent: null,
      },
      {
        categoryKey: 'KABOB',
        attributes: { isHalal: 'false', portionGrams: '800' },
        originalPrice: 40000,
        finalPrice: 20000,
        isDiscount: true,
        discountPercent: 50,
      },
    ]);
  });

  afterAll(async () => {
    await removeFixture(prisma);
    await app.close();
  });

  it('counts categories over the visible listings', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const categories = res.body.result.categories as (Facet & { label: string })[];
    const palov = categories.find((c) => c.key === 'PALOV');
    const kabob = categories.find((c) => c.key === 'KABOB');

    expect(palov).toMatchObject({ count: 2, label: 'Osh', typeKey: 'NATIONAL_FOOD' });
    expect(kabob).toMatchObject({ count: 1 });
    expect(res.body.result.total).toBe(3);
  });

  it('splits listingKind so DISCOUNT + REGULAR equals ALL', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const kinds = res.body.result.listingKind as Facet[];
    const byKey = Object.fromEntries(kinds.map((k) => [k.key, k.count]));

    expect(byKey.DISCOUNT).toBe(2);
    expect(byKey.REGULAR).toBe(1);
    expect(byKey.DISCOUNT + byKey.REGULAR).toBe(byKey.ALL);
  });

  it('reports only attribute values that occur, with counts', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const attributes = res.body.result.attributes as AttributeFacet[];
    const halal = attributes.find((a) => a.key === 'isHalal');
    const spicy = attributes.find((a) => a.key === 'spicyLevel');

    expect(halal?.values).toEqual(
      expect.arrayContaining([
        { value: 'true', count: 2 },
        { value: 'false', count: 1 },
      ]),
    );
    // The catalog declares four spice levels; only the two used come back.
    expect(spicy?.values?.map((v) => v.value).sort()).toEqual(['Yengil', "Yo'q"]);
  });

  it('reports NUMBER attributes as a range', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const portion = (res.body.result.attributes as AttributeFacet[]).find(
      (a) => a.key === 'portionGrams',
    );

    expect(portion?.range).toEqual({ min: 150, max: 800 });
    expect(portion?.values).toBeUndefined();
  });

  it('never exposes the reserved keys as filters', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const keys = (res.body.result.attributes as AttributeFacet[]).map((a) => a.key);
    expect(keys).not.toContain('_regular');
    expect(keys).not.toContain('_phone');
    expect(keys).not.toContain('_gender');
  });

  it('reports the price and discount ranges', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    expect(res.body.result.priceRange).toEqual({ min: 20000, max: 25000 });
    expect(res.body.result.discountPercentRange).toEqual({ min: 30, max: 50 });
  });

  it('narrows every count when categoryKeys is given', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body({ categoryKeys: ['KABOB'] }))
      .expect(200);

    expect(res.body.result.total).toBe(1);
    const kinds = Object.fromEntries(
      (res.body.result.listingKind as Facet[]).map((k) => [k.key, k.count]),
    );
    expect(kinds.REGULAR).toBe(0);
  });

  it('rejects a type outside the selected groups', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body({ types: ['TENNIS'] }))
      .expect(422);

    expect(res.body.error.fields).toHaveProperty(['types']);
  });

  it('rejects an unknown group key', async () => {
    await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send({ groupKeys: ['NOPE'] })
      .expect(422);
  });

  it('returns the sorts the feed offers', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const sorts = res.body.result.sorts as { key: string; requiresGeo: boolean }[];
    expect(sorts.find((s) => s.key === 'DISTANCE')?.requiresGeo).toBe(true);
    expect(sorts.map((s) => s.key)).toContain('DISCOUNT_PERCENT');
  });
});
```

- [ ] **Step 3: E2E'ni ishga tushirish**

Run: `docker compose up -d db redis` (agar ishlamayotgan bo'lsa)
Run: `npm run test:e2e -- filter-schema --forceExit`
Expected: PASS — 10 test.

> Kesh 5 daqiqa ishlaydi, lekin har test bir xil qamrovni so'raydi va fixture `beforeAll` da bir marta yoziladi — shuning uchun kesh natijani buzmaydi. Agar testni fixture o'zgartirib qayta ishga tushirsangiz, avval Redis kalitini tozalang: `docker exec elonuz-redis redis-cli --scan --pattern 'discounts:facets:*' | xargs -r docker exec -i elonuz-redis redis-cli DEL`

- [ ] **Step 4: To'liq tekshiruv**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS

Run: `npm run test:e2e -- "catalog-groups|filter-schema" --forceExit`
Expected: PASS — 8 + 10 test.

- [ ] **Step 5: Commit**

```bash
git add test/helpers/listing-fixture.ts test/filter-schema.e2e-spec.ts
git commit -m "test(discounts): e2e coverage for the filter schema with seeded listings"
```

---

## Bajarilgandan keyin qo'lda tekshirish

```bash
curl -s -X POST http://localhost:3000/v1/catalog/filter-schema \
  -H 'Content-Type: application/json' \
  -d '{"groupKeys":["FOOD"]}' | jq '{total, types: [.result.types[].key], attributes: [.result.attributes[].key]}'
```

---

## Keyingi rejalar

| Reja | Mazmuni |
|---|---|
| 3-kesim | `search_text` / `search_vector` / `catalog_synonyms` / `branch_working_hours` migratsiyalari + `POST /v1/discounts/search` (LIST/COUNT) + `POST /v1/discounts/detail` |
| 4-kesim | `mode: "MAP"` + klasterlash · `POST /v1/discounts/suggest` · `student_favorites` + `favorites/*` |
