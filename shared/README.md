# Shared contracts

**Baseline 1.0.0.** JSON Schema Draft 2020-12 files under schemas/ are the sole wire-payload authority. openapi.json describes planned REST methods and references these schemas. docs/realtime.md describes the stateful WebSocket protocol; message.schema.json defines its messages.

IDs under https://schemas.cat-operator-hub.example/v1/ are identifiers, not hosted endpoints. Validation registers all local schemas offline. No network schema loading is needed.

Run `npm run check` at the repository root. Regenerate TS declarations with `npm run contracts:generate`; CI compares output via `npm run contracts:check`. Consume @cat-hub/contracts as **types only**. TypeScript declarations cannot enforce numeric ranges, date formats or conditional requirements; runtime schema validation remains mandatory. The root Contracts interface is an index of payload types, not a runtime message. Python ingestion validates JSON against these same schemas (including date/time formats); Pydantic API models must not replace canonical schema validation with looser rules.

## Change policy

Producers send exactly 1.0.0. Objects are closed to catch misspelled fields. Unknown ordinary fields are rejected; defined extensions objects may contain agreed metadata. A “minor” optional field can still break strict consumers, so coordinate **all** schema changes, regenerate types, update examples/protocol docs and both producer/consumer issues, and bump the version. Never claim automatic compatibility for an added field. Required-field changes, units/meaning changes or enum removals require a new major contract. Maintain compatibility tests when more than one version is actually supported.

## Fixtures

Fixtures are small contract examples, not training records, safety guidance, fitted predictions or implementations. Different standalone fixtures are independent; a seatbelt alert fixture need not correspond to the normal telemetry fixture. The snapshot fixture is internally consistent. Historical fixtures preserve one original record each and explicitly identify provided_sample provenance. Original full samples are data/reference/ CSVs.

The shared demo site is revision 2: its `DEST_B` deposit point moved from (25 m, 25 m) to (38 m, 20 m). The world-frame and snapshot fixtures use the matching site revision, place the bucket tip at the deposit point, and retain the existing `DEST_B` work event. Producers and consumers must keep the site and frame revisions paired; a snapshot supplies both. This revises demo-site content only, so `schema_version` remains 1.0.0 and generated declarations do not change.

## Semantic validation beyond schema

JSON Schema checks shape/ranges only. Implementers must additionally validate authenticated ownership, matching site/revision/environment, unique actor/event/destination IDs, zone geometry and bounds, monotonic sequence/time, counter monotonicity, task state/revisions, progress consistency and relational references. Exact checks are listed in docs/realtime.md and docs/integration.md.

Numeric schema bounds are broad plausibility guards for this demo, **not CAT operating limits**. Simulator-specific physical limits must be documented separately; never quote a schema bound as an OEM specification.
