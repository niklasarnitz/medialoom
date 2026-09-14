# CLI

`medialoom` is a stable public automation interface.

Commands, flags, exit codes, and JSON schemas are compatibility-sensitive.

Automation-relevant commands support `--json`.

In JSON mode:

```text
stdout = machine-readable result only
stderr = diagnostics/progress
```

Never contaminate JSON stdout with logs.

Commands that could prompt should support `--no-input`.

CLI commands are thin adapters over shared application services. Do not implement domain logic here.
