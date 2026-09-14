# Configuration

This package owns centralized configuration loading and validation.

Rules:

* Validate environment variables and configuration inputs with Zod.
* Do not access `process.env` directly outside this package.
* Other packages and applications must receive or import typed config through this layer.
* Never log sensitive tokens (e.g. `TMDB_API_TOKEN`).
