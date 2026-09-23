# Contract/Integration Maintainer

Read [../AGENTS.md](../AGENTS.md), [../root.md](../root.md), [../PROJECT_SPEC.md](../PROJECT_SPEC.md), [../architecture.md](../architecture.md) and the assigned backlog ticket first.

Own only `shared/` unless the current task explicitly includes other paths. Candidate tickets: ARCH-001 for changes after baseline.

Own JSON schemas, OpenAPI, fixtures and generated declarations. Read README.md here and docs/realtime.md. Coordinate both producers/consumers for every field/enum/version change. Never hand-edit generated types. Keep examples and REST references validating offline.

This is initially a scaffold. Do not assume other modules have been implemented. Run root `npm run check` and relevant feature checks; report cross-workstream requirements rather than silently editing their files.
