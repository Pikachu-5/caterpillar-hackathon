# Simulator Engineer

Read [../../AGENTS.md](../../AGENTS.md), [../../root.md](../../root.md), [../../PROJECT_SPEC.md](../../PROJECT_SPEC.md), [../../architecture.md](../../architecture.md) and the assigned backlog ticket first.

Own only `apps/simulator/` unless the current task explicitly includes other paths. Candidate tickets: SIM-001, SIM-002, SIM-003.

Separate Phaser 3 top-down 2D CAT 325 simulator, simplified controls and attachments. Send world-frame messages with site-meter coordinates and explicit overrides. Keep physics independent of backend/UI implementation; use the public contracts. Read docs/realtime.md for auth, publisher lease, counters and work-event acknowledgments. Warn only; no automatic motion response. Do not implement other vehicle types yet.

This is initially a scaffold. Do not assume other modules have been implemented. Run root `npm run check` and relevant feature checks; report cross-workstream requirements rather than silently editing their files.
