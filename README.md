# MediaLoom

MediaLoom is a headless-first, type-safe media library manager: roughly "beets for movies, TV shows, and audiobooks."

## Implementation Stage

**Stage 1: Repository and Full-Stack Foundation**

Stage 1 establishes the clean, buildable, fully type-safe Bun monorepo foundation. Scanning, technical media inspection (`ffprobe`), filename parsing (`guessit-js`), TMDb metadata integration, matching algorithms, and filesystem organization are deferred to later stages.

## Monorepo Architecture

```text
medialoom/
├── apps/
│   ├── cli/            # medialoom automation CLI (--help, version, doctor, doctor --json)
│   └── web/            # TanStack Start SSR web application
├── packages/
│   ├── config/         # Centralized Zod-validated configuration layer
│   ├── contracts/      # Public communication DTOs, versioned envelopes, Zod schemas
│   ├── core/           # Core application domain and services (SystemService, etc.)
│   ├── db/             # Prisma SQLite persistence layer and migrations
│   ├── media/          # Media inspection skeleton (reserved for Stage 2+)
│   ├── profiles/       # Server output profiles skeleton (reserved for later stages)
│   └── providers/      # Metadata providers skeleton (reserved for later stages)
├── AGENTS.md           # Root architectural invariants and AI guidelines
├── biome.json          # Biome formatting and linting configuration
├── package.json        # Bun workspaces configuration and repository scripts
├── tsconfig.json       # TypeScript strict configuration
└── .env.example        # Environment variable definitions and defaults
```

### Key Architectural Invariants

* **Type Safety:** TypeScript strict mode with no `any` or `@ts-ignore` boundaries.
* **Schema Validation:** External boundaries, configuration, and API envelopes are strictly validated with Zod.
* **Unified Services:** Web UI, CLI, and public interfaces call the same core application services.
* **Idiomatic Web SSR:** TanStack Start utilizes route loaders and server functions for server-rendered initial data with no `useEffect` fetching.
* **Pure CLI Machine Interface:** In `--json` mode, stdout emits only valid, machine-readable JSON envelopes; diagnostics and progress are directed to stderr.

## Environment Setup

1. **Prerequisites:**
   * [Bun](https://bun.sh) (v1.2+)
   * Node.js (v20+)

2. **Clone and Configure:**
   ```bash
   cp .env.example .env
   ```

   Supported variables:
   * `DATABASE_URL`: Path to SQLite database (default: `file:./medialoom.db`).
   * `TMDB_API_TOKEN`: TMDb API access token for metadata lookups.
   * `FFPROBE_PATH`: Path to `ffprobe` executable (optional, defaults to `ffprobe`).
   * `LOG_LEVEL`: Logging verbosity (`debug` | `info` | `warn` | `error`, defaults to `info`).

3. **Install Dependencies and Run Migrations:**
   ```bash
   bun install
   ```

## Development Commands

| Command | Description |
| :--- | :--- |
| `bun run lint` | Run Biome linting across the monorepo |
| `bun run lint:fix` | Automatically fix formatting and safe lint issues |
| `bun run typecheck` | Run strict TypeScript validation (`tsc --noEmit`) |
| `bun run test` | Run all unit and integration tests with `bun test` |
| `bun run build` | Build all workspace packages and applications |
| `bun run dev` | Start the TanStack Start development server |
| `bun run cli -- <cmd>` | Execute the `medialoom` CLI directly |

### CLI Usage

```bash
# Display help
bun run cli -- --help

# Display version
bun run cli -- version

# Run system and environment diagnostics (human-friendly)
bun run cli -- doctor

# Run diagnostics with stable versioned JSON envelope
bun run cli -- doctor --json
```
