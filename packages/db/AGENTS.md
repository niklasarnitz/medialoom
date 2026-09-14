# Persistence

Use Prisma with SQLite and migrations.

Do not use provider IDs as MediaLoom primary keys.

The database schema is the master type structure for domain entities. Expose Prisma models and inferred payload types directly to the rest of the app. Do not create artificial transformation or mapping layers (e.g. `mapPrisma...ToDomain`).

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
