# Dataset specification and generation boundaries

## Immutable evidence

The user's photos contain four operating-history rows and five completed-task rows. Their transcription is in data/reference/operations.csv and data/reference/tasks.csv. Preserve every supplied timestamp, ID, numeric value, unit and category. These are **provided examples**, not verified real-world measurements. Do not relabel them synthetic or CAT-certified. Corrections to transcription require checking the source photos.

The source tables do not specify: timestamp timezone; fuel/load-cycle/idle aggregation windows; task start/end timestamps; task-to-operator/machine foreign keys; exact machine model; soil conditions; environmental sensor measurements. Do not infer those as facts. In particular the five machine ages/skill levels in the task table must not be forcibly joined to one operator/machine from the operating table. They are independent examples.

## Original normalized columns

Operation JSON schema preserves timestamp (original local-looking string), machine_id, operator_id, engine_hours, fuel_used_l, load_cycles, idling_time_min, seatbelt_status and safety_alert_triggered. Mapping is a mechanical snake_case/unit mapping from CSV, never a change in measurement meaning.

Task JSON schema preserves task_id, task_type, weather, operator_skill, machine_age_years, estimated_minutes and actual_minutes. Allowed original task types are Earth Excavation, Trenching, Material Loading, Grading and Demolition. Original weather categories are Sunny, Rainy, Cloudy and Windy. Skill categories are Beginner, Intermediate and Expert. No new original categories are added to historical training data.

## Permitted added fields

| Field | Meaning / provenance |
| --- | --- |
| provenance | provided_sample or synthetic, mandatory on normalized records |
| machine_model | CAT 325 for generated v1 operating records; model was not in source photos |
| air_temperature_c | Synthetic ambient temperature, never engine temperature |
| soil_type | Sand, Loam, Clay, Gravel, Unknown; newly introduced category, not source evidence |
| soil_moisture_percent_vwc | 0–100 volumetric water content percentage; not humidity |
| interval_minutes | Defined operating aggregation window for generated records only |
| timezone | Explicit timezone for generated operation timestamps; original timezone unknown |
| generator_version / generation_seed | Reproduction metadata |
| machine_id / operator_id / started_at on task history | Optional generated-only linkage; no fabricated joins to supplied task examples |

Additional live telemetry (RPM, attachment pose, site coordinates, pressures, etc.) is a separate stream. Do not pretend the original aggregate tables contain these sensors. A future extension requires schema/docs updates.

## Generator requirements (DATA-001; not implemented)

Use deterministic seeded Python generation with a parameter manifest, not freeform LLM rows. Keep source samples unchanged; generate into data/generated/ with separate provenance. Default generated operating profile may retain EXC001/OP1001 and CAT 325; do not repeat timestamps for distinct observations. If multiple operator histories are later necessary, create explicit synthetic IDs/profiles instead of altering source IDs. New IDs/timestamps are allowed for new records, while original records remain exact.

Choose and document a consistent interval (proposed 60 simulated minutes). Fuel used, cycles and idle time are interval aggregates; engine_hours is a cumulative meter and increments by runtime within the interval. idle_minutes <= runtime_minutes <= interval_minutes; cycles are nonnegative integers and zero when inactive; fuel cannot be negative. Do not derive a real fuel curve from the four sample rows. Any relationships between load, temperature, moisture, skill and time are hypotheses for a demo and must be labeled accordingly. Include variance and counterexamples, not a perfectly deterministic seatbelt→alert label copy.

The only source-backed task/skill/weather combinations are examples, not universal causal rules. Generated category combinations can vary within the allowed categories; document this assumption. Keep impossible conditions out, and do not encode task actual_minutes as an input to its own prediction. Prior estimated_minutes may be retained for baseline comparison but excluded from the first model to avoid circular target construction. Environmental features are measured/known at prediction time; no future weather or completion-derived features.

Data manifest must contain generation version/seed, row counts, units, intervals/timezone, profile assumptions, parameter ranges, original-data SHA256s and train/validation/test allocation. Output is a future deliverable, not present in this scaffold. No arbitrary minimum row count is claimed by the problem statement; choose counts based on scenario coverage and validation in DATA-001.

## Evaluation and limits

Split by chronological session or synthetic generation group before feature fitting. Never scatter rows from one simulated run across training and test. Fit transformations only on train. Keep a separate stress/scenario test set. Compare ETA regression to a median/task-type baseline with MAE and per-category errors. Avoid invented confidence percentages; use null intervals until calibrated on held-out synthetic data. Analyze idling/usage using windowed features and a statistical baseline before optional Isolation Forest. Distinguish immediate deterministic safety violations from unusual historical behavior.

Synthetic evaluation demonstrates pipeline behavior, not real-world predictive accuracy. Store model version/dataset hash and report that limitation in UI/demo. The original rows alone are insufficient to validate physical relationships or train a defensible model.
