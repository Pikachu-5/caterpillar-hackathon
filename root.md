# Repository map and new-chat handoff

**Phase 0: scaffold complete; every product feature is unimplemented.**

The recognized agent instruction filename is **AGENTS.md** (uppercase). This root.md is a navigation and handoff document, not a competing instruction file.

## Authority

1. Current user request and explicit issue scope.
2. AGENTS.md and the relevant directory's AGENTS.md.
3. PROJECT_SPEC.md for accepted requirements; architecture.md for implementation decisions.
4. shared/schemas/ for JSON payloads, shared/openapi.json for REST, docs/realtime.md for WebSockets.
5. docs/backlog.md for dependency order and acceptance criteria.

If these disagree, report the exact mismatch and resolve it as an integration change. Do not “fix” it by inventing a private interface.

## Paths

| Path | Purpose |
| --- | --- |
| apps/dashboard/ | Future React operator UI, custom site map; no product code yet |
| apps/simulator/ | Future separate Phaser excavator simulator; no product code yet |
| backend/ | Future FastAPI modular backend, auth, demo feed, safety, task persistence |
| ml/ | Future data generation, anomaly and ETA training/evaluation |
| data/ | Immutable transcribed samples and dataset specification |
| knowledge/ | Verified source manifest and ingestion/training-content requirements |
| voice/ | Deferred voice scope only |
| shared/ | JSON Schema contracts, REST specification, fixtures and generated TS declarations |
| config/ | Explicitly non-OEM demo defaults |
| docs/ | API, realtime, data/database, safety, workflow, setup and issue-ready backlog |
| scripts/ | Scaffold validation and type generation, not feature implementations |
| .github/ | CI and issue/PR templates |

## Copy into a new implementation chat

“Read AGENTS.md, root.md, PROJECT_SPEC.md, architecture.md, and the AGENTS.md for my assigned workstream. Work on ticket <ID> in docs/backlog.md only. Inspect the current repository state first. Follow the shared schemas and API/realtime protocol. Do not implement later tickets or edit another workstream without an explicit coordinated change. Validate and report limitations.”

The first backend assignment is BE-001; the first dashboard assignment is UI-001. DATA-001 can begin independently. SIM-001 can begin from the shared contracts, but SIM-003 integration depends on the backend ingest interface. Each implementation agent should create a focused feature branch from the latest main.

The backlog is local documentation: it has not been created as GitHub Issues. A future user may authorize creating issues from it. Names such as BE-001 are local ticket keys, not GitHub numeric issue IDs.
