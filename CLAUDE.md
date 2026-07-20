# CLAUDE.md — Project Rules

Instructions for Claude when working in this repository. These rules **override** default behavior. Read this before writing or changing any code. Merge with the user's global `~/.claude/CLAUDE.md`.

## Project Overview

Backend for **ElonUz** — a student discounts platform for Uzbekistan (mobile: Kotlin Multiplatform, Android + iOS). Business owners publish their businesses and listings (discounted or regular offers) across many categories (clothing, cafés, barbershops, beauty salons, game clubs, education, entertainment, …). Students discover offers **by proximity** and redeem them via QR / promo code.

**The API contract is the source of truth.** The mobile client is generated from `docs/api/provider/elon-uz.json` (OpenAPI 3.0.3). Paths, DTO names, field names, enums, and the response envelope **must match the spec exactly** — changing them forces a mobile client regeneration. Full specs live in `docs/api/provider/` (`BACKEND_PROMPT.md`, `ENDPOINTS_CHECKLIST.md`, `API_RESPONSE_FORMAT.md`, `DISCOUNTS_BUSINESS_API.md`, `elon-uz.json`, `catalog-seed.json`).

Built in **levels** — do not implement a later level unless explicitly asked:

- **Level 1 (current) — auth + the 22 app endpoints:** auth (register/login, Google/Apple OAuth, SMS OTP, refresh, forgot/reset) · profile · business · branches · catalog (types/categories) · listing create+submit · media upload · geo geocode · discounts feed. See `ENDPOINTS_CHECKLIST.md`.
- **Level 2 — spec'd but not yet called:** listing edit/pause/activate/duplicate/withdraw, listing stats, redemption (QR/promo verify+confirm), business submit/moderation, attributes-schema, geo regions/districts.

## Tech Stack

- **Framework:** Node.js 20+ + NestJS
- **Language:** TypeScript, strict mode — **no `any`**
- **Database:** PostgreSQL 16 + **PostGIS** (proximity search for the discounts feed)
- **ORM:** Prisma
- **Cache / Queues:** Redis (BullMQ) — background jobs & the cron that drives listing status transitions
- **Auth:** the backend owns authentication — **JWT access + refresh** tokens, email + password (argon2), **Google & Apple OAuth**, forgot/reset password, and **SMS OTP** (phone verification + password reset). No Firebase.
- **Authorization:** ownership checks (owner user id) + `role` (RBAC where needed)
- **SMS:** provider adapter (Eskiz / Playmobile) for OTP delivery
- **Validation:** class-validator + class-transformer (request DTOs mirror the OpenAPI contract 1:1)
- **API docs:** Swagger / OpenAPI — kept in sync with `elon-uz.json`
- **Logging:** Pino (`nestjs-pino`) — structured, with a `traceId` per request
- **Testing:** Jest (unit + e2e)
- **Lint / Format:** ESLint + Prettier
- **Git hooks:** Husky + lint-staged
- **Deploy:** Docker Compose (postgres + app); migrations + catalog seed run on start

> The mobile team's prompt suggests Fastify + Zod + Vitest. We deliberately keep **NestJS + class-validator + Jest** — the HTTP contract is identical either way, and NestJS gives us the structure this repo is built around. Only the contract (below) is non-negotiable.

## API Contract & Response Envelope (non-negotiable)

Everything here is fixed by the generated mobile client — match it exactly.

- **Base URL:** single `/v1` for **all** endpoints (both provider and student). Do not split into `/provider/v1` etc.
- **Response envelope — `BaseResponse` on EVERY response** (success and error, no exception). Implement once via a global response **interceptor** + global exception **filter** — never wrap manually in controllers.
  ```jsonc
  { "success": true,  "status": 200, "code": null, "message": "OK", "result": <payload>, "error": null }
  { "success": false, "status": 404, "code": null, "message": "E'lon topilmadi",
    "error": { "code": "LISTING_NOT_FOUND", "message": "E'lon topilmadi", "fields": {} } }
  ```
  - HTTP status code **and** the `status` field must be equal.
  - On error: `result` is always null, `error` always filled. On success: `error` is null.
  - `message` is always **user-facing Uzbek** text (not a log line).
  - Validation (422): fill `error.fields` as `{ "<field>": "<uzbek message>" }`.
- **Pagination:** `result: { items, page, size, total, hasNext }` — exactly these keys (**not** `pageSize`/`hasMore`).
- **Money:** integer **so'm**, no decimals. `BigInt` in Prisma → serialize to `Number` in JSON. `currency: "UZS"`.
- **Dates:** **ISO-8601** (`"2026-07-16T10:30:00Z"`) — never epoch-ms.
- **`finalPrice` is computed server-side** from `discountType` + `discountValue`; ignore any client-sent value.
- **Error codes** (`error.code`): `UNAUTHORIZED` `TOKEN_EXPIRED` (401) · `FORBIDDEN` (403) · `*_NOT_FOUND` (404) · `VALIDATION_ERROR` (422, with `fields`) · `INVALID_STATUS_TRANSITION` `REDEMPTION_LIMIT_REACHED` (409) · `CATEGORY_NOT_IN_CATALOG` `BUSINESS_TYPE_IMMUTABLE` (422) · `RATE_LIMITED` (429) · `INTERNAL_ERROR` (500).

> ⚠️ `API_RESPONSE_FORMAT.md` is **stale** on two points (it says epoch-ms and `pageSize`/`hasMore`). The OpenAPI (`elon-uz.json`) and `BACKEND_PROMPT.md` win: **ISO-8601** dates and **`size`/`hasNext`** pagination.

## Auth & Ownership

The backend owns auth (no Firebase). This is the one area that **deviates from the OpenAPI spec** (which assumed Firebase) — a deliberate product decision; the mobile clients adapt their auth layer. Everything else in the contract is unchanged.

- **Endpoints** (`/v1/auth/*`): `register`, `login`, `refresh`, `logout`, `forgot-password`, `reset-password`, `oauth/google`, `oauth/apple`, `otp/request`, `otp/verify`.
- **Tokens:** short-lived **JWT access** + longer **refresh** token; rotate refresh tokens and store them hashed (revocable on logout). Access token carries `sub` (user id) + `role`.
- **Passwords:** hash with **argon2**; never store or log plaintext.
- **OAuth:** verify the Google ID token / Apple identity token server-side, then find-or-create the user (link by verified email). OAuth-only accounts have no password.
- **OTP (SMS):** phone verification on register and password reset. Codes are short-lived and single-use; **rate-limit** requests and cap verify attempts. Deliver via the SMS adapter in `src/infrastructure/sms`.
- Access token expired → **401** `code: "TOKEN_EXPIRED"` (client refreshes and retries). Missing/invalid → **401** `code: "UNAUTHORIZED"`.
- **Two account types (separate tables):** `students` and `business_owners` — each with its own auth; the two mobile apps authenticate against their own table. See `docs/architecture/auth.md` (decision D6).
- **Ownership:** any write to a business/branch/listing requires `business.ownerId === req.user.id`, else **403** `code: "FORBIDDEN"` (return 403, not 404, for someone else's resource).
- All secrets (JWT keys, OAuth client secrets, SMS + DB credentials) come from env (`config/env.ts`, validated) — never committed.

## Architecture

Feature-based modules under `src/modules/<feature>/`, each split into four DDD layers:

```
src/modules/<feature>/
├── domain/          # Entities, value objects, enums, repository INTERFACES, domain errors. Pure TS — no NestJS, no Prisma.
├── application/     # Services / use-cases. Business logic and orchestration. Depends on domain interfaces only.
├── infrastructure/  # Prisma repository IMPLEMENTATIONS, external adapters (SMS, storage), mappers.
└── presentation/    # Controllers, DTOs (request/response), Swagger decorators, module-specific guards.
```

Shared code:

```
src/common/          # Cross-cutting: guards, interceptors, decorators, exceptions, utils, enums, constants, types, validation, middleware.
src/infrastructure/  # Shared infra clients: database (Prisma), cache, queues, logger, sms, email, storage, search, websocket.
src/config/          # Typed configuration (env schema + config service).
src/cron/            # Scheduled jobs.
```

### Modules (this product)

The generic scaffold under `src/modules/` was speculative. For ElonUz the **active** modules are:

`auth` (register/login, Google/Apple OAuth, SMS OTP, refresh, forgot/reset — two account types: `students` + `business_owners`, see `docs/architecture/auth.md`) · `profiles` (profile/me) · `business` · `branches` · `catalog` (business types, categories, attributes — seeded from `catalog-seed.json`) · `listings` · `discounts` (student proximity feed) · `redemptions` (Level 2) · `geo` · `media` · `admin` (moderation, Level 2).

- `listings` is this product's core "advertisement"; `catalog` replaces the generic `categories`; `media` replaces `uploads`. Account ids are our own cuids (no Firebase uid).
- **Not used by this product** (leave the scaffold folders empty): `chat`, `favorites`, `payments`, `reports`, `notifications`, `analytics`, `settings`, `search` (the `discounts` feed is the search).

### Dependency direction (never violate)

```
presentation → application → domain ← infrastructure
```

- **Domain** depends on nothing.
- **Application** depends only on domain (uses repository *interfaces*, never Prisma).
- **Infrastructure** implements domain interfaces.
- **Presentation** calls application services.

**Prisma is imported only inside `infrastructure/` repositories.** Never in `application/` or `domain/`.

## Layer Responsibilities

**Controllers (presentation) — THIN.**
- Only: route definition, DTO binding, auth guards, Swagger docs, calling a service, returning a typed response.
- No business logic. No direct DB access. No manual try/catch for business rules — use exception filters.

**Services (application) — business logic ONLY.**
- Orchestrate use-cases, enforce business rules, call repositories through interfaces.
- No HTTP concerns (no `@Res`, no manual status codes — throw domain/HTTP exceptions instead).

**Repositories (infrastructure) — database ONLY.**
- Data access via Prisma only. One repository per aggregate, implementing a domain interface.
- No business logic. Do not leak raw Prisma models across the app — map to domain entities/plain objects.

## Naming Conventions

- Files: `kebab-case` — `create-advertisement.dto.ts`, `advertisements.service.ts`.
- Classes / interfaces / types: `PascalCase` — `AdvertisementsService`.
- Variables / functions: `camelCase`.
- Constants & enum values: `UPPER_SNAKE_CASE`.
- DB tables & columns: `snake_case` (via Prisma `@map` / `@@map`).
- Role suffixes: `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.dto.ts`, `*.entity.ts`, `*.module.ts`, `*.guard.ts`.

## DTOs & Validation

- **Every endpoint** has an explicit request DTO and a typed response.
- Validate all input with class-validator. Global `ValidationPipe`: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- Never accept raw `any` or untyped `body`.
- Separate `CreateXDto` and `UpdateXDto`; use `PartialType` for updates where it fits.

## Error Handling

- **Never** `throw new Error()`. Throw NestJS `HttpException` subclasses (`NotFoundException`, `BadRequestException`, …) or defined domain exceptions.
- Global exception filter for a consistent error response shape.
- Domain layer throws domain exceptions; a filter/mapper converts them to HTTP responses.
- No swallowed errors — no empty `catch {}`.

## Logging

- Use the injected Pino logger (`nestjs-pino`). Never `console.log`.
- Log at boundaries (incoming request, external calls, errors). Never log secrets (passwords, tokens, OTP, PII).

## Testing

- Every application-layer service has unit tests; mock repository interfaces (no real DB in unit tests).
- Critical flows (auth, advertisements CRUD) have e2e tests.
- Fixing a bug: write a failing test that reproduces it first, then make it pass.
- Follow the structure under `tests/`.

## Swagger

- Every endpoint documented: `@ApiTags`, `@ApiOperation`, `@ApiResponse`, DTO schemas via `@ApiProperty`.
- DTOs are the single source of truth — keep Swagger in sync with them.

## Git

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Small, focused commits — one logical change each.
- Do not commit or push unless asked. Never commit `.env`.

## Code Change Discipline

When modifying existing code:

1. **Inspect first** — read surrounding code, understand current patterns.
2. **Explain** — state what you will change and why before editing.
3. **Implement surgically** — touch only what the task requires.
4. **Never** rewrite or "improve" unrelated code, comments, or formatting.
5. Match existing style even if you'd do it differently.

## Never / Always

**Never:**
- use `any` or untyped values
- put business logic in controllers
- access Prisma outside repositories
- `throw new Error()` — use HttpException / domain exceptions
- `console.log` — use the logger
- duplicate logic — extract and reuse
- add features, config, or abstractions that weren't requested

**Always:**
- validate input with DTOs
- document endpoints with Swagger
- return typed responses
- keep controllers thin, services focused, repositories DB-only
- write tests for services

## Subagents

Specialized agents live in `.claude/agents/` — their names and descriptions load automatically (see the agent list). Delegate focused work to them.

## Skills

Invoke the matching skill before starting the task:

| Situation | Skill |
|-----------|-------|
| Designing a new feature / gathering requirements | `brainstorming` → `writing-plans` |
| Any bug / test failure / unexpected behavior | `systematic-debugging` |
| Building a feature test-first | `tdd` |
| Security review / auth / vulnerability check | `security-review`, `owasp-security` |
| Reviewing a diff before merge | `requesting-code-review` / `code-review` |
| Before claiming work done / committing | `verification-before-completion` |

### Custom project skills

Live under `.claude/skills/` — their descriptions load automatically (see the skill list): `nest-new-module`, `nest-crud-endpoint`, `prisma-migration`.
