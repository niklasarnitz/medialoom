# Persistence

Use Prisma with SQLite and migrations.

Do not use provider IDs as MediaLoom primary keys.

Do not expose Prisma models as public/domain contracts.

Prefer:

```text
application service
→ repository/persistence adapter
→ Prisma
```

Important normalized/queryable data belongs in typed columns/models.

JSON fields are appropriate for raw external payloads and diagnostics.

If the Prisma schema changes:

1. create a migration,
2. regenerate Prisma artifacts,
3. test a fresh database migration,
4. run typecheck and tests.

Do not rewrite committed migration history for convenience.
