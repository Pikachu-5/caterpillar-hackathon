# Persistence design — no migrations yet

Use PostgreSQL 17, SQLAlchemy 2 and Alembic. UUID or similarly opaque IDs may be generated while fitting the shared ID grammar. EXC001/OP1001 are illustrative reference IDs, not credentials. Do not hard-code a global operator into production handlers.

| Table | Intended contents and constraints |
| --- | --- |
| operators | operator_id PK, unique normalized username, password_hash, display name, skill level, creation timestamp |
| auth_sessions | token_hash unique, operator FK, csrf-token hash, expires_at, revoked_at; no raw cookie storage |
| machines | machine_id PK, model/profile/manual metadata; tracked CAT 325 |
| operator_machines | assignment unique (operator_id,machine_id) |
| sites | site_id, revision, validated geometry JSON; unique pair |
| operating_sessions | operator/machine/site FKs, source, status, timing basis, clock/counters, latest accepted sequence; partial uniqueness for open machine/operator |
| environments | immutable environment_id, session FK, requested mode, provenance, readings/freshness |
| telemetry_samples | session_id, sequence, observed_at, simulation_time_s, validated frame JSON; unique (session_id,sequence), indexed by session/time |
| tasks | operator/machine/site FKs, category, schedule/order, revision, status, target/deposited amount, timings/prediction |
| task_events | session_id,event_id unique, task FK, payload, simulation time; immutable |
| alerts | alert_id, session/operator, rule version, subject, lifecycle, acknowledged/resolved timestamps |
| incidents | incident_id, alert FK, lifecycle/evidence, resolution reason; one episode per alert |
| insights | operator/session FK, evidence, method/model version, synthetic basis |
| training_modules | approved content/version, quiz keys (server only), source document IDs |
| training_attempts | operator/module/version FK, answers, score, completion timestamp |
| recommendations | operator/module/reason/evidence references and current status |
| model_runs | version, dataset manifest/hash, split/seed, metrics and limitations |
| assistant_answers | operator/session/question/answer/citations/provider usage; no secrets |

Typed columns cover identity, ownership, indexes and query-critical fields; JSONB holds validated rich payloads. Do not use unvalidated arbitrary JSON as an excuse to skip contract checks. Backend validates ownership for reads and mutations; test cross-operator access explicitly.

Commit task event insertion, progress increment, revision and related session counters in one transaction before acknowledgment. Incident lifecycle and minimum-distance updates are transactional. Persist every event even though telemetry is sampled at 1 Hz. Unique constraints handle retry races.

Migrations must be forward-reviewed and include rollback/data preservation considerations. App startup must not silently drop/create the database. Retention is explicit, not a background deletion job in this hackathon. Local demo reset clears only the selected operator's demo sessions after an explicit action; preserve original provided sample files.
