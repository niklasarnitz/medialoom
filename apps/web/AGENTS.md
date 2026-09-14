# Web

Use TanStack Start idiomatically.

SSR is the default for initial route data.

Prefer:

```text
route loader
→ server function
→ application service
→ SSR
```

Do not default to `useEffect(() => fetch(...))` for initial data.

The web UI may use TanStack Start server functions directly. It does not need to call its own REST API.

React components must not contain scanning, matching, provider, Prisma, or filesystem business logic.

Dangerous filesystem actions must be explicit and display the corresponding `OperationPlan`.
