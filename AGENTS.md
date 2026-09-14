# MediaLoom Agent Instructions

MediaLoom is a headless-first, type-safe media library manager: roughly "beets for movies, TV shows, and audiobooks."

Stack:

* Bun
* TypeScript strict mode
* TanStack Start
* React
* Prisma + SQLite
* Zod
* `guessit-js`
* `ffprobe`
* Vitest / Playwright

## Before changing code

1. Read this file.
2. Read every `AGENTS.md` in or above the directories you modify.
3. Inspect existing tests and package scripts.
4. Keep the requested change small and reviewable.

More specific `AGENTS.md` files override general guidance for their area.

## Global invariants

* No `any`, `@ts-ignore`, or unsafe type assertions without a documented unavoidable boundary.
* Validate external data with Zod.
* Web UI, CLI, and public API call the same application services.
* SSR is the default for initial web data.
* Scanning and matching never mutate user media.
* Every MediaLoom filesystem mutation must originate from an explicit `OperationPlan`.
* Never silently overwrite or delete user files.
* Provider-specific and third-party types must not leak into the domain.
* Do not implement unrelated future stages.

## Before completion

Run the repository equivalents of:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

If filesystem behavior changed, test it against temporary directories.

If CLI behavior changed, verify `--json`.

If Prisma changed, create and test the migration.

Do not claim completion if relevant checks fail.

## Commits

* Commit after every meaningful change.
* Write concise, readable, human-like commit messages (e.g. clear imperative tone, focused on the intent, avoiding robotic filler).
