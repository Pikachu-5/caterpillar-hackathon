# Issue-ready implementation backlog

All tickets below are **unstarted**. These are local ticket keys, not created GitHub Issues. A ticket authorizes only its listed scope when explicitly assigned. Root dependency/lock updates must be called out in the assignment and coordinated by the integration maintainer.

## ARCH-001 — Coordinated contract change (as needed)

Owner: Contract/Integration Maintainer. Depends: a documented interface need.
Scope: shared/, docs/, root config/tooling. Acceptance: describe old/new behavior and affected workstreams; update schemas/API/protocol/fixtures; bump version; regenerate types; all checks pass; producer/consumer rollout identified. Out: implementing affected features on behalf of their owners.

## BE-001 — Backend foundation, persistence and operator accounts

Owner: Backend Engineer. Depends: scaffold.
Scope: backend/ plus explicitly coordinated Python lock/config changes.
Acceptance: runnable FastAPI on 8000; /api/v1/health; Alembic initial tables; register/login/me/logout; Argon2 passwords and revocable sessions/CSRF; operator scoping and assignment; fixture machine/site seed without production credentials; test two users cannot read/mutate each other's data. Create uv.lock. Out: telemetry, safety, models and UI.

## BE-002 — Operating sessions, snapshots and demo-first realtime

Owner: Backend Engineer. Depends: BE-001.
Scope: backend/.
Acceptance: session start/pause/resume/end; demo scenarios produce canonical world frames with moving workers/vehicles and attachment pose; site/environment snapshots; dashboard WebSocket; shared ingestion for internal demo and simulator publisher; single-publisher ownership; validation/error/ack protocol; timestamps/counters, stale/disconnect/reconnect; 1 Hz persistence plus durable events. Dashboard can work with no simulator. Out: full excavator physics and frontend.

## BE-003 — Daily task CRUD, ordering and work progress

Owner: Backend Engineer. Depends: BE-001; BE-002 for live progress.
Scope: backend/.
Acceptance: create/edit/list/reorder/action endpoints; optimistic revisions and atomic reorder; task ownership/state constraints; seeded A→B task; accept deposit once with destination/geometry checks; pause-aware durations; history after logout/relogin; manual completion for non-simulated task categories. Out: scheduling optimization and fitted ETA.

## BE-004 — Safety episodes and incident persistence

Owner: Backend Engineer. Depends: BE-002.
Scope: backend/.
Acceptance: docs/safety.md rules with versioned demo thresholds; body/arm/swing proximity; restricted polygons; stationary-digging seatbelt; acknowledgment distinct from resolution; hysteresis; one incident per episode; data-quality states; durable evidence/history. Tests prove no alert changes motion. Out: LLM safety decisions and real machine controls.

## BE-005 — Switchable environment and live weather

Owner: Backend Engineer. Depends: BE-002.
Scope: backend/.
Acceptance: demo/live switch; explicit location and units; server fetch/cache/timeouts; provenance/freshness; unsupported weather handling; soil input provenance; immutable environment IDs and simulator broadcast; unavailable provider does not silently become demo. Out: GPS basemap and inferred soil sensors.

## UI-001 — Operator dashboard shell and account flows

Owner: Dashboard Engineer. Depends: scaffold; BE-001 for real login acceptance.
Scope: apps/dashboard/ plus coordinated npm dependencies/root lock.
Acceptance: React/TS/Vite app on 5173; login/register/logout; current operator; daily task/map/telemetry/safety/insight/training layout; explicit loading/empty/stale/error/provider-disabled states; responsive laptop layout; shared contract types. Develop against fixtures, then prove backend login. Out: fake completed backend integrations, supervisor view and voice.

## UI-002 — Live site map, telemetry and warning experience

Owner: Dashboard Engineer. Depends: UI-001, BE-002, BE-004.
Scope: apps/dashboard/.
Acceptance: snapshots/live updates; Leaflet meter coordinates; selected machine/heading/attachment, worker/vehicle/obstacle, terrain, restricted zones, destinations, hazards and bounded trail; health/telemetry/override badges; stale and paused states; audio enable/mute; acknowledgment/history; reconnect without duplicate listeners. Demo works before simulator. Out: driving from map and machine actuation.

## UI-003 — Daily work, insights, training, assistant and weather views

Owner: Dashboard Engineer. Depends: UI-001 plus each relevant backend ticket.
Scope: apps/dashboard/.
Acceptance: task forms/edit/reorder/start/pause/resume/completion with conflict feedback; predicted vs actual times; anomaly evidence; source-cited text Q&A and unavailable/abstain states; training lessons/quizzes/history; demo/live weather switch and attribution; operator history persists. Ship incrementally as endpoints become ready. Out: building backend logic or computing authoritative risk/ETA in React.

## DATA-001 — Reproducible synthetic dataset

Owner: Data/ML Engineer. Depends: scaffold.
Scope: ml/, data/.
Acceptance: preserve exact reference CSVs; seeded generator and parameter/provenance manifest; retain original field meanings/categories; environmental extensions; realistic consistency constraints without claiming measured physics; no invented links between original tables; separate train/validation/test groups; schema/semantic validation; generation report including limits and hashes. Out: RAG source generation, unmarked fake observations or fitted product models.

## ML-001 — ETA and unusual-usage models

Owner: Data/ML Engineer. Depends: DATA-001.
Scope: ml/.
Acceptance: median/task baseline and regression ETA; held-out MAE/per-category evaluation; no target leakage; statistical idling/usage baseline and optional Isolation Forest; serialize metadata/version/hash; confidence intervals only if evaluated; callable adapters returning prediction/insight contracts. Out: autonomous safety decisions and claims of real-world accuracy.

## BE-006 — Model adapters and recommendation plumbing

Owner: Backend Engineer. Depends: BE-003, BE-004, ML-001.
Scope: backend/.
Acceptance: load versioned models through explicit adapters; /prediction and operator-scoped /insights; missing-model baseline/unavailable behavior; recent incident/insight evidence supports deterministic training recommendations; do not recompute predictions on every 5 Hz frame unnecessarily. Out: modifying fitted-model internals without ML coordination.

## AI-001 — Page-grounded CAT 325 Q&A

Owner: Backend Engineer with Knowledge/Training Content Engineer explicitly assigned.
Scope: backend/, knowledge/; coordinated dependencies.
Acceptance: retrieve/hash verified manual; page-aware extraction with table/diagram review; local retrieval; server-only Gemini settings and usage caps; exact model/edition scope; supported answers with valid printed-page citations; unsupported questions abstain; provider outage graceful; document prompt-injection tests; no state-mutating tools. Out: voice, unrelated manuals and invented procedures.

## TRAIN-001 — Lessons, quizzes and adaptive recommendations

Owner: Backend + Knowledge roles explicitly assigned; UI under UI-003.
Scope: backend/, knowledge/.
Depends: BE-001, BE-004; AI-001 source ingestion (not remote generation) for grounded content.
Acceptance: source-cited short lessons; server-side quiz grading; versioned attempts/completion; recommendations from repeated incident/inefficiency evidence; training works without simulator or Gemini; account history retained. Out: instructor booking and full learning-management system.

## SIM-001 — Separate 2D CAT 325 site and controls

Owner: Simulator Engineer. Depends: scaffold.
Scope: apps/simulator/ plus coordinated npm dependencies/root lock.
Acceptance: Phaser 3 world on 5174; load site fixture; meter-coordinate adapter; travel/turn, upper-body swing, boom/stick/bucket controls; engine/seatbelt/brake UI; simplified pickup/deposit; prescribed worker/vehicle paths; clear key legend and reset. Out: backend/dashboard editing, ML and other controllable machine types.

## SIM-002 — Coherent telemetry, override panel and task work events

Owner: Simulator Engineer. Depends: SIM-001.
Scope: apps/simulator/.
Acceptance: consistent counters/units/clock; 5 Hz schema-valid atomic frames; body/arm positions; reset starts a new session; demo sliders with explicit override list; no tire telemetry for tracked excavator; A→B deposit events instead of client progress percentage; controls to stage hazards; physics remains independent of network adapter. Out: authoritative safety decisions and task persistence.

## SIM-003 — Authenticated integration and source handoff

Owner: Simulator Engineer; coordinate backend owner for defects outside scope.
Depends: SIM-002, BE-002, BE-003, BE-005.
Scope: apps/simulator/.
Acceptance: own login UI / shared auth API; publisher hello/CSRF; initial snapshot; canonical frames/acks; pending-work dedupe; pause/reconnect; environment updates; end demo/start simulator session; dashboard mirrors movements without importing simulator code. Out: silently modifying shared contracts or implementing missing backend work.

## INT-001 — Integrated demo and cross-platform verification

Owner: Contract/Integration Maintainer; fixes go to owned tickets.
Depends: required core UI/backend/data/ML/AI/training tickets; simulator checks run when SIM-003 is ready.
Scope: docs/ and integration checks; coordinate feature fixes.
Acceptance: execute docs/integration.md; document actual results on available macOS/Intel OS environments; show demo-feed path even if simulator absent; verify no secrets, consistent source indicators, original dataset preservation and clear synthetic limitations. Out: claiming untested platforms or deploying production.

## LATER-001 — Optional voice and additional vehicles

Deferred; requires a new explicit scope. No implementation or dependencies now. Voice wraps the existing read-only assistant. Additional machine types need verified manuals, profiles/telemetry applicability and coordinated contracts; no fleet/supervisor UI is implied.
