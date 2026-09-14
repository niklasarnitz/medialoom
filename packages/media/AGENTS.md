# Media Inspection

This package owns filesystem discovery, filename parsing, and technical inspection.

## guessit-js

Use `guessit-js` in-process:

```ts
import { guessit } from 'guessit-js'
```

Do not use its CLI, REST service, or Python GuessIt.

Keep it behind a MediaLoom adapter.

`GuessItResult` must not leak outside this package.

Filename-derived metadata describes what the filename claims. It is not authoritative technical metadata.

## ffprobe

Use one centralized ffprobe adapter.

Treat ffprobe JSON as untrusted and validate it before normalization.

ffprobe is authoritative for actual file/container/stream properties.

A single corrupt file should not normally abort an entire scan.

## Scanner

Scanning is read-only with respect to user media.

Do not rename, move, rewrite, or delete media.

Scanning must be idempotent.

Do not hash complete multi-gigabyte files during normal scans.
