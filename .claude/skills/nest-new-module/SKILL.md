---
name: nest-new-module
description: Use when adding a new feature module to this NestJS backend — e.g. "create a categories module", "scaffold the advertisements module", or starting any new src/modules/<feature> from scratch.
---

# nest-new-module

Scaffold a new feature module following this project's DDD layering. Source of truth for all rules: root `CLAUDE.md`.

## When to use
- Starting a brand-new `src/modules/<feature>` (categories, favorites, chat, …).
- NOT for adding an endpoint to a module that already exists → use `nest-crud-endpoint`.

## Layout to create

```
src/modules/<feature>/
├── domain/
│   ├── entities/<feature>.entity.ts     # plain TS — no NestJS, no Prisma
│   ├── enums/                           # if needed
│   └── <feature>.repository.ts          # INTERFACE (port)
├── application/
│   └── <feature>.service.ts             # business logic; depends on the interface only
├── infrastructure/
│   ├── <feature>.prisma.repository.ts   # implements the domain interface (Prisma ONLY here)
│   └── mappers/<feature>.mapper.ts      # Prisma model ↔ domain entity
├── presentation/
│   ├── <feature>.controller.ts          # thin
│   └── dto/                             # request/response DTOs
└── <feature>.module.ts                  # wires everything; binds interface → impl
```

## Rules (from CLAUDE.md)
- Dependency direction: `presentation → application → domain ← infrastructure`.
- Prisma is imported ONLY in `infrastructure/`. Domain and application stay framework-free.
- Bind the repository interface to its Prisma implementation with a provider token:
  `{ provide: FEATURE_REPOSITORY, useClass: FeaturePrismaRepository }`, and inject via `@Inject(FEATURE_REPOSITORY)`.
- Register the new module in `AppModule` imports.
- Naming: files `kebab-case`, classes `PascalCase`; suffixes `.service.ts` / `.repository.ts` / `.controller.ts` / `.module.ts`.

## Steps
1. Copy the shape from `src/modules/_template` — keep only the layers you need now (YAGNI).
2. Define the domain entity and the repository interface first.
3. Implement the Prisma repository + mapper in `infrastructure/`.
4. Write the service against the interface (no Prisma).
5. Add the thin controller + DTOs + Swagger.
6. Wire `<feature>.module.ts` and register it in `AppModule`.
7. Confirm the app boots.

## Common mistakes
- Importing `PrismaService` into the service → move it behind the repository.
- Business logic in the controller → move it to the service.
- Injecting the Prisma repo directly instead of the interface token → breaks testability.
