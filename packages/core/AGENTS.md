# Core

This package owns MediaLoom application and domain behavior.

Keep it independent from:

* React
* TanStack route components
* CLI presentation
* TMDb response types
* `guessit-js` result types

The database schema is the master type structure for domain entities; core builds directly upon it.

Adapters call core. Core must not depend on adapters.

Important domain distinctions:

```text
Movie
Edition
MediaVersion
Asset
MediaTechnicalMetadata
OperationPlan
```

Never model a canonical movie as merely a filesystem path.

Matching must be deterministic and explainable. Do not use an LLM for media identification.

Filesystem mutations may only happen through the plan executor.
