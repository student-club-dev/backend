# Student Feed — 3-kesim A: qolgan endpointlar uchun poydevor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Qolgan 5 endpoint (`search`, `detail`, `suggest`, `favorites/toggle`, `favorites/search`) tayanadigan umumiy qatlamni qurish: migratsiyalar, o'zbekcha matn normalizatsiyasi, qidiruv ustuni, sinonimlar, ish vaqti jadvali, sevimlilar jadvali, auth guardlar va `DiscountCard` modeli.

**Architecture:** Bu kesim **hech qanday endpoint qo'shmaydi** — u faqat poydevor. Shu sababli u alohida: keyingi to'rt ish (search / detail / suggest / favorites) bir-biridan mustaqil bo'lib, parallel bajarilishi mumkin. Umumiy qismni oldindan qotirish integratsiya to'qnashuvini oldini oladi.

**Spec:** `docs/api/client/STUDENT_FEED.md` §5 (auth D5), §7 (qidiruv D7 + sinonimlar D2), §8.1 (`DiscountCard`, D14), §11 (baza D11)

---

## Nima quriladi

| Qism | Kim ishlatadi |
|---|---|
| `uz_normalize()` SQL funksiyasi | `search`, `suggest` |
| `listings.search_text` / `search_vector` | `search` (matnli qidiruv), `suggest` |
| `catalog_synonyms` | `search`, `suggest` |
| `branch_working_hours` | `search` (`openNow`), `detail`, `DiscountCard.isOpenNow` |
| `student_favorites` | `favorites/*`, `DiscountCard.isFavorite`, `search` (`favoritesOnly`) |
| `OptionalJwtAuthGuard` + `StudentGuard` | hamma feed endpointi |
| `DiscountCard` domain modeli + kartani yig'uvchi SQL | `search` (LIST), `favorites/search`, `detail` |

---

### Task 1: Migratsiya — kengaytmalar, normalizatsiya, jadvallar

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260727090000_add_feed_foundation/migration.sql`

- [ ] **Step 1: Prisma modellarini qo'shish**

`prisma/schema.prisma`, `model Listing` ichida `discountPercent` dan keyin:

```prisma
  /// Normalised haystack (title, description, category label, synonyms, text attributes,
  /// option names) maintained by the write path. `search_vector` is derived from it in SQL.
  searchText      String? @map("search_text")
```

`Listing` indekslar blokiga:

```prisma
  @@index([searchVector], type: Gin, map: "listings_search_vector_gin")
```

va `searchText` dan keyin (Prisma tsvector'ni qo'llab-quvvatlamaydi — `Unsupported` bilan modellaymiz, GiST/GIN indeksi `branches.geoPoint` bilan bir xil naqshda):

```prisma
  searchVector Unsupported("tsvector")? @map("search_vector")
```

`Student` modeliga relation qo'shing (`redemptions` yoniga):

```prisma
  favorites StudentFavorite[]
```

`Listing` modeliga (`redemptions` yoniga):

```prisma
  favorites StudentFavorite[]
```

`Branch` modeliga (`redemptions` yoniga):

```prisma
  workingHourRows BranchWorkingHour[]
```

Fayl oxiriga, `TRADE CENTERS` blokidan keyin, yangi bo'lim:

```prisma
// ============================================================================
// STUDENT FEED (STUDENT_FEED.md §11)
// ============================================================================

/// Search synonyms per catalog category. `category_key` alone is not unique — ALL and OTHER
/// exist under every business type — so the natural key includes the type (D2).
model CatalogSynonym {
  id           String   @id @default(cuid())
  businessType String   @map("business_type")
  categoryKey  String   @map("category_key")
  term         String
  weight       Int      @default(1)
  createdAt    DateTime @default(now()) @map("created_at")

  @@unique([businessType, categoryKey, term])
  @@index([term])
  @@map("catalog_synonyms")
}

/// Branch opening hours flattened out of `branches.working_hours` (JSON stays the wire contract).
/// Minutes since midnight make `openNow` an indexable comparison instead of JSON arithmetic.
model BranchWorkingHour {
  id            String    @id @default(cuid())
  branchId      String    @map("branch_id")
  day           DayOfWeek
  openMinute    Int?      @map("open_minute")
  closeMinute   Int?      @map("close_minute")
  /// true when close <= open, i.e. the venue stays open past midnight (20:00-04:00).
  spansMidnight Boolean   @default(false) @map("spans_midnight")
  isClosed      Boolean   @default(false) @map("is_closed")

  branch Branch @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@unique([branchId, day])
  @@index([day, openMinute, closeMinute])
  @@map("branch_working_hours")
}

/// A student's saved listings.
model StudentFavorite {
  studentId String   @map("student_id")
  listingId String   @map("listing_id")
  createdAt DateTime @default(now()) @map("created_at")

  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  listing Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@id([studentId, listingId])
  @@index([listingId])
  @@index([studentId, createdAt])
  @@map("student_favorites")
}
```

- [ ] **Step 2: Migratsiyani yozish**

Fayl: `prisma/migrations/20260727090000_add_feed_foundation/migration.sql`

```sql
-- Extensions: unaccent powers uz_normalize, pg_trgm backs the suggest endpoint's typo tolerance.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Uzbek text normalisation (STUDENT_FEED.md §7). One function so the write path, the search
-- query and the suggest query all fold text identically:
--   * apostrophe variants in o'/g' are dropped     (o'quv = oquv = oʻquv)
--   * Cyrillic is transliterated to Latin           (Тошкент = Toshkent)
--   * accents removed, lower-cased, whitespace collapsed
-- IMMUTABLE so it can be used in generated columns and expression indexes.
CREATE OR REPLACE FUNCTION uz_normalize(input text) RETURNS text AS $$
  SELECT btrim(regexp_replace(
    translate(
      lower(unaccent(coalesce(
        -- Multi-character Cyrillic first; translate() below handles the 1:1 letters.
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(input, '[ЩЩ]', 'shch', 'gi'),
                  '[Ш]', 'sh', 'gi'),
                '[Ч]', 'ch', 'gi'),
              '[Ю]', 'yu', 'gi'),
            '[Я]', 'ya', 'gi'),
          '[Ё]', 'yo', 'gi'),
        ''))),
      -- 1:1 Cyrillic → Latin, then strip every apostrophe variant used for o'/g'.
      'абвгдежзийклмнопрстуфхцъыьэғқҳўё' || 'ʻʼ''`´',
      'abvgdejzijklmnoprstufхcy'         || 'egqho'
    ),
    '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- AlterTable: the listing search haystack.
ALTER TABLE "listings" ADD COLUMN "search_text" TEXT;
ALTER TABLE "listings" ADD COLUMN "search_vector" tsvector;

-- Derive the vector from the normalised text on every write. 'simple' (not 'english') because the
-- corpus is Uzbek — an English stemmer would mangle it.
CREATE OR REPLACE FUNCTION listings_search_vector_refresh() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', uz_normalize(COALESCE(NEW.search_text, '')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_search_vector_trigger
  BEFORE INSERT OR UPDATE OF search_text ON "listings"
  FOR EACH ROW EXECUTE FUNCTION listings_search_vector_refresh();

CREATE INDEX "listings_search_vector_gin" ON "listings" USING GIN ("search_vector");

-- CreateTable
CREATE TABLE "catalog_synonyms" (
    "id" TEXT NOT NULL,
    "business_type" TEXT NOT NULL,
    "category_key" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_synonyms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_synonyms_business_type_category_key_term_key"
  ON "catalog_synonyms"("business_type", "category_key", "term");
CREATE INDEX "catalog_synonyms_term_idx" ON "catalog_synonyms"("term");
-- Trigram index for suggest: matches a mistyped "palv" against "palov".
CREATE INDEX "catalog_synonyms_term_trgm" ON "catalog_synonyms" USING GIN ("term" gin_trgm_ops);

CREATE TABLE "branch_working_hours" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "day" "DayOfWeek" NOT NULL,
    "open_minute" INTEGER,
    "close_minute" INTEGER,
    "spans_midnight" BOOLEAN NOT NULL DEFAULT false,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "branch_working_hours_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branch_working_hours_branch_id_day_key"
  ON "branch_working_hours"("branch_id", "day");
CREATE INDEX "branch_working_hours_day_open_minute_close_minute_idx"
  ON "branch_working_hours"("day", "open_minute", "close_minute");
ALTER TABLE "branch_working_hours" ADD CONSTRAINT "branch_working_hours_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "student_favorites" (
    "student_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_favorites_pkey" PRIMARY KEY ("student_id", "listing_id")
);
CREATE INDEX "student_favorites_listing_id_idx" ON "student_favorites"("listing_id");
CREATE INDEX "student_favorites_student_id_created_at_idx"
  ON "student_favorites"("student_id", "created_at");
ALTER TABLE "student_favorites" ADD CONSTRAINT "student_favorites_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_favorites" ADD CONSTRAINT "student_favorites_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Qo'llash va normalizatsiyani tekshirish**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: xatosiz.

Run:
```bash
docker exec elonuz-db psql -U elonuz -d elonuz -c "
SELECT uz_normalize('O''quv')      AS a,
       uz_normalize('oquv')        AS b,
       uz_normalize('oʻquv')       AS c,
       uz_normalize('Тошкент')     AS d,
       uz_normalize('Toshkent')    AS e,
       uz_normalize('  Lag''mon ') AS f;"
```
Expected: `a = b = c = 'oquv'` va `d = e = 'toshkent'`, `f = 'lagmon'`.
Farq chiqsa — `uz_normalize` ni tuzating, keyingi qadamga o'tmang.

- [ ] **Step 4: Sxema mosligini tekshirish**

Run: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_URL"` — agar shadow DB yo'q bo'lsa, o'rniga:

Run: `npx prisma migrate status`
Expected: `Database schema is up to date!`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(feed): add search vector, synonyms, working hours and favorites tables"
```

---

### Task 2: Sinonimlarni seed qilish

**Files:**
- Modify: `docs/api/provider/catalog-seed.json`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: `catalog-seed.json` ga `synonyms` qo'shish**

`"groups"` blokidan keyin yangi top-level kalit. `STUDENT_FEED.md` §7 dagi boshlang'ich to'plam:

```json
  "synonyms": [
    { "businessType": "NATIONAL_FOOD", "categoryKey": "PALOV", "terms": ["osh", "palov", "plov", "o'sh"] },
    { "businessType": "NATIONAL_FOOD", "categoryKey": "LAGMON", "terms": ["lag'mon", "lagmon", "laghmon"] },
    { "businessType": "NATIONAL_FOOD", "categoryKey": "MANTI_CHUCHVARA", "terms": ["manti", "chuchvara", "pelmen"] },
    { "businessType": "NATIONAL_FOOD", "categoryKey": "KABOB", "terms": ["kabob", "shashlik", "kebab"] },
    { "businessType": "SOMSA", "categoryKey": "MEAT_SOMSA", "terms": ["somsa", "самса"] },
    { "businessType": "FAST_FOOD", "categoryKey": "LAVASH_SHAWARMA", "terms": ["lavash", "shaurma", "shawarma", "донер"] },
    { "businessType": "FAST_FOOD", "categoryKey": "PIZZA", "terms": ["pitsa", "pizza"] },
    { "businessType": "FAST_FOOD", "categoryKey": "BURGER", "terms": ["burger", "gamburger"] }
  ],
```

- [ ] **Step 2: `prisma/seed.ts` ni yangilash**

`SeedGroup` dan keyin:

```ts
interface SeedSynonym {
  businessType: string;
  categoryKey: string;
  terms: string[];
}
```

`CatalogSeed` ga: `synonyms: SeedSynonym[];`

Tranzaksiyada, `// 3. Attribute specs` blokidan keyin:

```ts
    // 3b. Synonyms — replace wholesale; they are pure reference data with no dependents.
    await tx.catalogSynonym.deleteMany();
    await tx.catalogSynonym.createMany({
      data: seed.synonyms.flatMap((entry) =>
        entry.terms.map((term) => ({
          businessType: entry.businessType,
          categoryKey: entry.categoryKey,
          term,
        })),
      ),
    });
```

Xulosa logiga qo'shing:

```ts
  console.log(`  synonyms:              ${seed.synonyms.reduce((n, s) => n + s.terms.length, 0)}`);
```

- [ ] **Step 3: Seed va tekshirish**

Run: `npm run prisma:seed`
Expected: `synonyms: 27` (yoki qo'shilgan terminlar soni).

Run: `docker exec elonuz-db psql -U elonuz -d elonuz -t -c "SELECT count(*) FROM catalog_synonyms;"`
Expected: JSON'dagi terminlar soniga teng.

- [ ] **Step 4: Commit**

```bash
git add docs/api/provider/catalog-seed.json prisma/seed.ts
git commit -m "feat(feed): seed the catalog search synonyms"
```

---

### Task 3: Yozish yo'li — `search_text` va ish vaqti jadvali

**Files:**
- Modify: `src/modules/listings/application/listings.service.ts` (+ `.spec.ts`)
- Modify: `src/modules/listings/domain/listing.repository.ts`
- Modify: `src/modules/listings/infrastructure/listing.mapper.ts`
- Modify: `src/modules/branches/infrastructure/*.repository.ts`

- [ ] **Step 1: Failing test — `search_text` yig'iladi**

`listings.service.spec.ts` ga yangi describe:

```ts
  describe('create — search text (STUDENT_FEED.md §7)', () => {
    it('builds the haystack from the title, description, category label and text attributes', async () => {
      const listings = makeListings();
      const service = makeService({
        listings,
        catalog: makeCatalog([category('PIZZA')], [spec({ key: 'brand', kind: AttributeFieldType.TEXT })]),
      });

      await service.create(
        owner,
        BUSINESS_ID,
        createInput({ description: 'Issiq va mazali', attributes: { brand: 'Zara' } }),
      );

      const written = (listings.create as jest.Mock).mock.calls[0][0].searchText as string;
      expect(written).toContain('Katta pizza chegirma');
      expect(written).toContain('Issiq va mazali');
      expect(written).toContain('PIZZA');
      expect(written).toContain('Zara');
    });

    it('leaves the reserved keys out of the haystack', async () => {
      const listings = makeListings();
      const service = makeService({ listings });

      await service.create(
        owner,
        BUSINESS_ID,
        createInput({ attributes: { _phone: '+998901234567', _regular: '1' } }),
      );

      const written = (listings.create as jest.Mock).mock.calls[0][0].searchText as string;
      expect(written).not.toContain('998901234567');
      expect(written).not.toContain('_regular');
    });
  });
```

Run: `npm test -- listings.service -t "search text"` → FAIL (`searchText` yo'q).

- [ ] **Step 2: `CreateListingData` / `UpdateListingData` ga `searchText` qo'shish**

`src/modules/listings/domain/listing.repository.ts` — ikkala interfeysga:

```ts
  /** Normalised search haystack, built by the service (STUDENT_FEED.md §7). */
  searchText: string;
```

- [ ] **Step 3: Servisda yig'ish**

`listings.service.ts` — fayl oxiriga (klassdan tashqarida):

```ts
/**
 * The listing's search haystack (STUDENT_FEED.md §7): everything a student might reasonably type
 * to find it. Category synonyms are added in SQL at query time — they belong to the catalog, not
 * to the listing, so baking them in would go stale whenever an admin edits them.
 *
 * Reserved keys are excluded: `_phone` is contact data (never searchable) and `_regular` /
 * `_gender` are flags, not words.
 */
function buildSearchText(input: UpdateListingInput, categoryLabel: string): string {
  const parts: string[] = [input.title, input.description ?? '', input.categoryKey, categoryLabel];
  if (input.customCategoryName !== null) {
    parts.push(input.customCategoryName);
  }
  for (const [key, value] of Object.entries(input.attributes ?? {})) {
    if (!RESERVED_ATTRIBUTE_KEYS.includes(key)) {
      parts.push(value);
    }
  }
  for (const group of input.optionGroups) {
    parts.push(group.name, ...group.options.map((option) => option.name));
  }
  return parts.filter((part) => part.trim().length > 0).join(' ');
}
```

`RESERVED_ATTRIBUTE_KEYS` ni `../domain/reserved-attribute-keys` dan import qiling.

`validateAndResolve` ni kengaytiring, kategoriya yorlig'ini qaytarsin — `assertCategory` allaqachon kategoriyani topadi, uni qaytaruvchi qilib o'zgartiring va `searchText` ni `create`/`update` payload'iga qo'shing.

- [ ] **Step 4: Mapper yozsin**

`listing.mapper.ts` — `toCreateData` va `toUpdateData` ga:

```ts
      searchText: data.searchText,
```

- [ ] **Step 5: Filial ish vaqti jadvalini to'ldirish**

`src/modules/branches/infrastructure/` dagi repository'da `create` va `update` ichida, `workingHours` yozilgandan keyin, yon jadvalni qayta quring:

```ts
  /**
   * Mirrors `workingHours` into `branch_working_hours`. The JSON stays the wire contract; the rows
   * exist so `openNow` is an indexed comparison rather than JSON arithmetic (STUDENT_FEED.md D11).
   * "09:00" → 540. `close <= open` means the venue runs past midnight.
   */
  private static workingHourRows(branchId: string, hours: WorkingHours[]) {
    return hours.map((entry) => {
      const open = toMinutes(entry.open);
      const close = toMinutes(entry.close);
      return {
        branchId,
        day: PrismaDayOfWeek[entry.day],
        openMinute: open,
        closeMinute: close,
        spansMidnight: open !== null && close !== null && close <= open,
        isClosed: entry.isClosed,
      };
    });
  }
```

va yordamchi:

```ts
/** "09:00" → 540 minutes past midnight; null when the day has no hours. */
function toMinutes(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}
```

Yozish tranzaksiyasida: `deleteMany({ where: { branchId } })` keyin `createMany({ data: rows })`.

- [ ] **Step 6: Testlar**

Run: `npx tsc --noEmit && npm test`
Expected: PASS — yangi 2 test va mavjudlari.

- [ ] **Step 7: Commit**

```bash
git add src/modules/listings src/modules/branches
git commit -m "feat(feed): build the listing search haystack and mirror branch working hours"
```

---

### Task 4: Auth guardlar (D5)

**Files:**
- Create: `src/common/guards/optional-jwt-auth.guard.ts`
- Create: `src/common/guards/student.guard.ts`
- Test: `src/common/guards/student.guard.spec.ts`

- [ ] **Step 1: `OptionalJwtAuthGuard`**

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Lets anonymous requests through but still verifies a token when one is sent (STUDENT_FEED.md D5).
 * A student browses the feed before signing up; once signed in the same endpoints personalise.
 *
 * An INVALID token is still rejected — silently falling back to anonymous would quietly drop a
 * user's favourites the moment their access token expired.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtAuthGuard: JwtAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (request.headers.authorization === undefined) {
      return true;
    }
    return this.jwtAuthGuard.canActivate(context);
  }
}
```

- [ ] **Step 2: `StudentGuard`**

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AccountType } from '../enums/account-type.enum';
import { AppException } from '../exceptions/app.exception';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Requires a signed-in STUDENT. Runs after JwtAuthGuard, which has already put `user` on the
 * request; a business-owner token is a valid identity for the wrong app, hence 403 not 401.
 */
@Injectable()
export class StudentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (request.user === undefined) {
      throw AppException.unauthorized();
    }
    if (request.user.type !== AccountType.STUDENT) {
      throw AppException.forbidden('Bu bo‘lim faqat talabalar uchun');
    }
    return true;
  }
}
```

- [ ] **Step 3: Test**

`student.guard.spec.ts` — 3 test: student o'tadi · biznes egasi 403 · foydalanuvchisiz 401. Kontekst mock'i:

```ts
function contextWith(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}
```

Run: `npm test -- student.guard`
Expected: PASS — 3 test.

- [ ] **Step 4: Commit**

```bash
git add src/common/guards
git commit -m "feat(feed): add optional-auth and student-only guards"
```

---

### Task 5: `DiscountCard` modeli va kartani yig'uvchi SQL

**Files:**
- Create: `src/modules/discounts/domain/discount-card.model.ts`
- Create: `src/modules/discounts/infrastructure/discount-card.sql.ts`

- [ ] **Step 1: Domain modeli**

`src/modules/discounts/domain/discount-card.model.ts` — `STUDENT_FEED.md` §8.1 dagi `DiscountCard` ning aynan maydonlari, `nearestBranch` bilan:

```ts
export interface NearestBranch {
  branchId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  isOpenNow: boolean;
  closesAt: string | null;
  tradeCenterName: string | null;
}

export interface CardDiscount {
  type: string;
  value: number;
  badge: string;
  conditions: string | null;
}

export interface DiscountCard {
  id: string;
  businessId: string;
  businessName: string;
  businessLogoUrl: string | null;
  businessType: string;
  groupKey: string;
  categoryKey: string;
  categoryLabel: string;
  matchedVia: 'CATEGORY' | 'ALL' | 'SYNONYM' | 'TEXT' | 'TYPE';
  title: string;
  imageUrl: string | null;
  imagesCount: number;
  priceUnit: string;
  isDiscount: boolean;
  originalPrice: number;
  finalPrice: number;
  savedAmount: number | null;
  currency: string;
  discount: CardDiscount | null;
  redemptionMethod: string;
  hasPromoCode: boolean;
  nearestBranch: NearestBranch | null;
  branchesCount: number;
  validTo: string;
  isFavorite: boolean;
  isNew: boolean;
  viewsCount: number;
  attributes: Record<string, string>;
}
```

- [ ] **Step 2: Karta SQL fragmenti**

`discount-card.sql.ts` — bitta e'lon uchun kartani yig'uvchi `SELECT` ustunlari va `nearestBranch` LATERAL. **D14 barqarorligi:** koordinata berilganda masofa bo'yicha, keyin `(created_at, id)`; berilmaganda faqat `(created_at, id)`.

```ts
/**
 * The nearest branch, or the first one when no coordinates were supplied. The tie-break on
 * `(created_at, id)` is what makes repeated requests return the same branch (D14) — without it
 * two branches at equal distance could swap between pages.
 */
export function nearestBranchLateral(geo: GeoScope | null): Prisma.Sql { /* ... */ }
```

Batafsil implementatsiya `search` ishida yoziladi — bu yerda faqat modul va imzo qotiriladi.

- [ ] **Step 3: Kompilyatsiya + commit**

Run: `npx tsc --noEmit`

```bash
git add src/modules/discounts/domain/discount-card.model.ts src/modules/discounts/infrastructure/discount-card.sql.ts
git commit -m "feat(discounts): add the DiscountCard model shared by search, detail and favorites"
```

---

## Poydevor tugagach

Keyingi to'rt ish bir-biriga tegmaydi va parallel bajarilishi mumkin:

| Ish | Fayllar | Bog'liqlik |
|---|---|---|
| `POST /discounts/search` (LIST/COUNT/MAP) | `discounts/application/search.*`, `infrastructure/search.sql.ts`, `presentation/search.*` | poydevor |
| `POST /discounts/detail` | `discounts/application/detail.*`, `presentation/detail.*` | poydevor |
| `POST /discounts/suggest` | `discounts/application/suggest.*`, `infrastructure/suggest.sql.ts` | poydevor + sinonimlar |
| `favorites/toggle` + `favorites/search` | `discounts/application/favorites.*`, `infrastructure/favorite.*.repository.ts` | poydevor |

Umumiy `SearchFilterDto` ni `search` ishi yozadi, `favorites/search` uni qayta ishlatadi — shu sababli `favorites` `search` dan **keyin** integratsiya qilinadi.
