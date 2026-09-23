# Backend Engineer

Read [../AGENTS.md](../AGENTS.md), [../root.md](../root.md), [../PROJECT_SPEC.md](../PROJECT_SPEC.md), [../architecture.md](../architecture.md) and the assigned backlog ticket first.

Own only `backend/` unless the current task explicitly includes other paths. Candidate tickets: BE-001 through BE-005.

One modular FastAPI server. Own auth, operator-scoped persistence, validated ingestion, internal demo publisher, tasks, safety, history, weather, and adapters to models/knowledge. Demo-first dashboard operation is mandatory. Never accept client IDs as authorization. Consume canonical JSON Schema with format checks; no competing telemetry DTO. No feature handler exists in the scaffold.

This is initially a scaffold. Do not assume other modules have been implemented. Run root `npm run check` and relevant feature checks; report cross-workstream requirements rather than silently editing their files.
