# Core

This package owns MediaLoom application and domain behavior.

Keep it independent from:

* React
* TanStack route components
* CLI presentation
* Prisma-generated types
* TMDb response types
* `guessit-js` result types

Adapters call core. Core must not depend on adapters.

Important domain distinctions:

```text
Movie / Work
MediaItem
Asset
Metadata
OperationPlan
```

Never model a canonical movie as merely a filesystem path.

Matching must be deterministic and explainable. Do not use an LLM for media identification.

Filesystem mutations may only happen through the plan executor.
