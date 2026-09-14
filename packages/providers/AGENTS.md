# Metadata Providers

Providers are adapters around external metadata services.

External responses are `unknown` until validated.

Use:

```text
external response
→ provider Zod schema
→ provider adapter
→ MediaLoom contract
→ application
```

TMDb-specific types must not leak outside the provider implementation.

Never log API tokens.

Provider failures should produce structured application errors.

Tests should normally mock external network calls.
