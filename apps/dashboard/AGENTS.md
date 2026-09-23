# Dashboard Engineer

Read [../../AGENTS.md](../../AGENTS.md), [../../root.md](../../root.md), [../../PROJECT_SPEC.md](../../PROJECT_SPEC.md), [../../architecture.md](../../architecture.md) and the assigned backlog ticket first.

Own only `apps/dashboard/` unless the current task explicitly includes other paths. Candidate tickets: UI-001, UI-002, UI-003.

React operator interface; login/history, task CRUD/reorder, site map, safety, training, ETA/anomaly views and document Q&A. The map mirrors backend state and never imports Phaser. Start against shared fixtures/demo backend before simulator integration. Keep secrets out of frontend configuration. Implement audio after user interaction. No supervisor/fleet UI.

This is initially a scaffold. Do not assume other modules have been implemented. Run root `npm run check` and relevant feature checks; report cross-workstream requirements rather than silently editing their files.
