# Contracts

This package defines shared DTOs, schemas, and public communication contracts.

Rules:

* All boundary data is defined with Zod schemas and inferred TypeScript types.
* API envelopes must be explicitly versioned (e.g. `schemaVersion: 1`).
* Contracts must remain pure data definitions: no business logic, no filesystem access, no external SDK clients.
* Domain representations here must not leak database-specific Prisma models or third-party provider payload structures.
