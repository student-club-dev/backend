---
name: prisma-migration
description: Use when changing the Prisma schema in this project — adding or altering a model/field/relation/index/enum, or generating and applying a migration against PostgreSQL.
---

# prisma-migration

Safely evolve the Prisma schema and apply a migration. Source of truth: root `CLAUDE.md`.

## When to use
- Any edit to `prisma/schema.prisma` (new model, field, relation, index, enum).
- For heavier data modeling, delegate the design to the `database-architect` agent first.

## Rules (from CLAUDE.md)
- DB tables/columns are `snake_case` via `@map` / `@@map`; model names are `PascalCase`.
- Model only what the current phase needs (Phase 1 = catalog). No speculative tables/columns.
- Add `created_at` / `updated_at`; index foreign keys and real query/filter columns; unique constraints for invariants.
- Set explicit `onDelete` behavior on relations.

## Workflow
1. Edit `prisma/schema.prisma` (models, relations, indexes, enums).
2. Create the migration (dev):
   ```bash
   npx prisma migrate dev --name <short_description>
   ```
3. Regenerate the client if needed: `npx prisma generate`.
4. Verify the generated SQL under `prisma/migrations/<...>/migration.sql` before trusting it.
5. Update the affected repository / mapper to use the new fields.
6. Production: apply with `npx prisma migrate deploy` — never `migrate dev` in prod.

## Never
- Edit a migration that has already been applied → create a new one instead.
- Use `prisma db push` when history matters → it skips migration files.
- Drop or rename a column without checking data loss → flag it and back up first.

## Common mistakes
- Forgetting `@@map` / `@map` → tables end up `camelCase` in Postgres.
- No index on foreign keys / filter columns → slow queries.
- Renaming a field = drop + add (data loss) unless you write a manual migration.
