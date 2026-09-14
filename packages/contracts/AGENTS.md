# Contracts

This package defines shared DTOs, schemas, and public communication contracts.

Rules:

* All boundary data is defined with Zod schemas and inferred TypeScript types.
* API envelopes must be explicitly versioned (e.g. `schemaVersion: 1`).
* Contracts must remain pure data definitions: no business logic, no filesystem access, no external SDK clients.
* The database schema is the master type structure for domain entities. Contracts define boundary inputs, external mutation schemas, and API envelopes: do not create redundant duplicate entity models or output mappers to isolate DB types.
* Third-party provider payload structures (e.g. TMDb, ffprobe, guessit) must not leak into public contracts or domain models.
