# REST API contract

shared/openapi.json is the machine-readable OpenAPI 3.1 specification. Base path `/api/v1`; no endpoint is implemented in Phase 0. All domain schemas are under shared/schemas/.

## Authentication

POST /auth/register creates an operator and logs in; POST /auth/login logs in; both return AuthState (operator + CSRF token) and set cat_session. GET /auth/me returns the current operator and CSRF token. POST /auth/logout revokes the session and clears its cookie (204). Username/password credentials, Argon2 hashes and raw session cookies are never returned in Operator JSON. Use a cryptographically random session token and store only its hash; default TTL 12 hours.

Except /health, /auth/register and /auth/login, all routes require a valid session cookie. Mutations require X-CSRF-Token and an allowed Origin; registration/login also enforce Origin/JSON content-type and rate limits to prevent cross-site login abuse. Server generates operator_id and binds every row to it. A supplied machine_id must be assigned to that operator; route IDs do not bypass ownership. Return 404 for another operator's private object. Seed demo accounts only through explicit development setup, never production passwords in git.

## Tasks

List supports scheduled_date, cursor and limit. Create accepts TaskWrite; server sets identity, status, ordering and timestamps. PUT /tasks/{task_id} edits user-controlled fields with expected_revision. POST /tasks/reorder accepts the exact complete ordered list for that operator/day plus each expected_revision; atomically renumber order_index and increment revisions. Reject missing/duplicate/foreign tasks, stale revisions or concurrent changes with 409. Register literal /tasks/reorder before parameterized paths in routing.

POST /tasks/{task_id}/actions transitions: scheduled→active (start), active→paused, paused→active (resume), scheduled/active/paused→cancelled, active→completed. One active task per operator/machine. A material_volume task can complete only after accepted work reaches its target; manual progress mode is for non-simulated tasks in the daily schedule, with explicit operator completion. Do not fabricate digging support for every task category. Partial deposits cap displayed progress at 100%; retain actual accepted volume for audit. Destination/quantity/progress-mode changes are forbidden once work begins. Dates/titles/order may change with revisions. No hard-delete endpoint: cancel preserves history.

Simulation task actual_minutes counts unpaused simulated work time. Manual task actual_minutes counts unpaused wall time. Store timing basis; do not mix these in model evaluation. /prediction returns unavailable error if neither baseline nor model can produce an honest estimate; never a fabricated confidence score.

## Sessions and history

POST /sessions starts an owned machine/site session with source demo, replay or simulator. Only one open session per operator/machine in v1. /sessions/{id}/actions pauses, resumes or ends. Reset/source switching ends the old session and creates a new one (even when requested through demo-controls); response is the new Session and clients resubscribe. Session snapshots include current site/environment/frame/alerts/tasks/insights. /frames is paginated downsampled history, not an exact 5 Hz recording. Incident and task histories retain all transitions. Login auth sessions and operating sessions are distinct tables/concepts.

## Weather and demo controls

Environment GET/PUT is session-scoped. Live mode requires geographic location; demo controls do not infer GPS from site coordinates. Backend assigns a new environment_id to every settings update and broadcasts it. Store requested mode, source and freshness separately. Failures keep last-known readings marked stale or null/unavailable; no hidden switch to demo. Soil remains operator/demo input in both modes.

/scenarios lists preloaded jobs/scenarios. /demo-controls is available only for demo/replay sessions when DEMO_ENABLED=true; simulator source uses its own local sliders/control panel. Non-null overrides must pass telemetry ranges; null clears that override. Override values are visibly marked and safety processes the effective readings. A reset creates a new session rather than decreasing existing counters. No arbitrary code execution or arbitrary event names are accepted.

## Safety, training and assistant

/alerts/{id}/acknowledge records acknowledgment; only the rule engine resolves a condition. /incidents returns persisted history. /training returns operator-specific recommendations/progress; GET /training/{id} includes lesson/quiz without correct-answer keys. /attempts grades server-side and persists results. Retry history is retained.

/assistant/questions answers read-only, model-scoped questions with citations. It may read a supplied owned session, but cannot execute machine controls, create tasks or modify safety state. Provider failure uses status unavailable with a useful message; unsupported documentation uses insufficient_evidence. Provider keys remain server-side. No voice endpoint is committed in v1.

## Errors and pagination

Error shape: code, message, request_id. Status mapping: 400 malformed request, 401 unauthenticated, 403 CSRF/Origin, 404 missing/foreign resource, 409 stale revision/state/source conflict, 422 schema/semantic validation, 429 rate limit, 503 provider unavailable, 500 unexpected failure. Clients must not parse human messages as codes. Use opaque cursors with stable ID tie-break sorting, default limit 25, max 100. An empty page has items=[] and next_cursor=null. Returned lists and WebSocket subscriptions are always operator-scoped.
