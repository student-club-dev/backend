---
name: nest-crud-endpoint
description: Use when adding a create/read/update/delete endpoint to an existing NestJS module — e.g. "add a create-advertisement endpoint", "give categories a paginated list", wiring controller→service→repository→DTO+Swagger.
---

# nest-crud-endpoint

Add one endpoint (or a full CRUD set) to an existing module, respecting the layer split. Source of truth: root `CLAUDE.md`.

## When to use
- The module already exists and you're adding an operation.
- NOT for a brand-new module → use `nest-new-module`.

## The full slice (one operation touches each layer)

| Layer | What to add |
|-------|-------------|
| `presentation/dto/` | `CreateXDto` / `UpdateXDto` (class-validator) + a typed response DTO (`@ApiProperty`) |
| `presentation/*.controller.ts` | route + guard + Swagger + call the service (stays thin) |
| `application/*.service.ts` | the use-case / business rule |
| `domain/*.repository.ts` | new method on the interface (if data access is needed) |
| `infrastructure/*.prisma.repository.ts` | implement that method (Prisma only) |

## Checklist per endpoint
- [ ] Request DTO with class-validator decorators; `Update` via `PartialType`.
- [ ] Typed response — never `any`.
- [ ] Correct HTTP method + status code.
- [ ] Auth: `@UseGuards` + role check if protected.
- [ ] Swagger: `@ApiOperation`, `@ApiResponse`.
- [ ] Controller only calls the service — no logic, no Prisma.
- [ ] Service enforces rules and calls the repository via the interface.
- [ ] Repository returns a domain entity / plain object, not a raw Prisma model.
- [ ] Not-found / conflict → `HttpException` (never `throw new Error()`).
- [ ] Unit test for the service (mock the repository).

## List endpoints
- Use the project's shared pagination/filter convention (page/limit), consistent across modules.
- Push filtering into the repository (`where`), not into the service in memory.

## Common mistakes
- Missing validation → enable the global `ValidationPipe` and add DTO decorators.
- Returning the Prisma model directly → map to a response DTO.
- Skipping the ownership check on update/delete → verify the resource belongs to the caller (avoid IDOR).
