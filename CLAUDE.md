# CLAUDE.md — Project Rules

Instructions for Claude when working in this repository. These rules **override** default behavior. Read this before writing or changing any code. Merge with the user's global `~/.claude/CLAUDE.md`.

## Project Overview

Backend for a **local services & goods marketplace** (classifieds-style) for the Uzbek market. Providers (businesses, specialists) publish listings across many categories — clothing, barbershops, beauty salons, printing services, and so on. Users search, browse, save favorites, and contact providers via chat.

Built in **phases** — do not implement a later phase unless explicitly asked:

- **Phase 1 (current) — Catalog:** `auth · users · profiles · categories · advertisements · uploads · search · favorites · chat · reports · notifications · admin`
- **Phase 2 — Booking:** provider schedules, time slots, appointments.
- **Phase 3 — Orders & Payments:** online payments (Click/Payme), commissions, promoted listings.

## Tech Stack

- **Framework:** Node.js + NestJS
- **Language:** TypeScript, strict mode — **no `any`**
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Cache / Queues:** Redis (BullMQ for background jobs)
- **Auth:** JWT access token + refresh token; OTP via SMS
- **Authorization:** RBAC (Role-Based Access Control)
- **Validation:** class-validator + class-transformer
- **API docs:** Swagger / OpenAPI
- **Real-time:** WebSocket (chat, notifications)
- **Logging:** Pino (`nestjs-pino`)
- **Testing:** Jest (unit + e2e)
- **Lint / Format:** ESLint + Prettier
- **Git hooks:** Husky + lint-staged

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

Specialized agents live in `.claude/agents/`. Delegate focused work to them:

| Agent | Use for |
|-------|---------|
| `backend-architect` | Module boundaries, architecture decisions, folder/layer design. Designs — does not write feature code. |
| `backend-developer` | Implementing NestJS features (controllers/services/repositories) per these rules. |
| `database-architect` | Prisma schema, relations, indexes, migrations. |
| `security-engineer` | Auth/JWT/RBAC review, input validation, OWASP checks. |
| `api-designer` | REST endpoint & DTO/contract design, Swagger. |
| `reviewer` | Clean-code review against this CLAUDE.md. |
| `testing-engineer` | Jest unit & e2e tests. |

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

Live under `.claude/skills/` (draft — refine on first real use once the NestJS project exists):

| Skill | Use for |
|-------|---------|
| `nest-new-module` | Scaffolding a new `src/modules/<feature>` with the 4 DDD layers. |
| `nest-crud-endpoint` | Adding a CRUD operation (controller→service→repository→DTO+Swagger) to an existing module. |
| `prisma-migration` | Changing `schema.prisma` and generating/applying a migration. |
