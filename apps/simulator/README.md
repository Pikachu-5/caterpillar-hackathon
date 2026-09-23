# Simulator Engineer workstream

**Scaffold only.** Separate Phaser 3 top-down 2D CAT 325 simulator, simplified controls and attachments. Send world-frame messages with site-meter coordinates and explicit overrides. Keep physics independent of backend/UI implementation; use the public contracts. Read docs/realtime.md for auth, publisher lease, counters and work-event acknowledgments. Warn only; no automatic motion response. Do not implement other vehicle types yet.

Read AGENTS.md and the [backlog](../../docs/backlog.md). First implementation ticket adds necessary runtime code/dependencies; no fake entrypoint or feature is included here.
