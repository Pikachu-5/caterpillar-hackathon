# Data/ML Engineer workstream

Synthetic data generation and ML model training for the CAT operator hub.

Read [AGENTS.md](AGENTS.md) and the [backlog](../docs/backlog.md). First implementation ticket: DATA-001.

## Quick start

```bash
# Install dependencies
uv sync --dev

# Generate the synthetic dataset (deterministic, seed=42)
uv run python generate_dataset.py --seed 42 --output ../data/generated/

# Validate generated output against shared schemas
uv run python validate_dataset.py ../data/generated/

# Run tests
uv run pytest -v

# Lint
uv run ruff check .
uv run ruff format --check .
```

## Files

| File | Purpose |
| --- | --- |
| `generation_config.py` | Parameter manifest — every assumption that influences generation |
| `generate_dataset.py` | Seeded deterministic generator (operations + tasks) |
| `validate_dataset.py` | Schema + semantic validation against `shared/schemas/` |
| `tests/test_generate.py` | 35 tests: determinism, schema, constraints, coverage, splits |
| `pyproject.toml` | Python project config and dependencies |
| `uv.lock` | Locked dependency versions |

## What DATA-001 generates

- **~1000 operation records**: 60-min interval aggregates for 2 machines × 2 operators across ~42 work days. Monotonic engine hours, anticorrelated idle/load cycles, probabilistic seatbelt/alert with counterexamples, environmental extensions.
- **~500 task records**: Full coverage of 5 task types × 3 skills × 4 weather × soil/temperature variation. Skill/weather/soil multipliers on actual time with noise and counterexamples.
- **Train/val/test splits** by chronological block (70/15/15), no session leakage.
- **Manifest** with full provenance, parameter documentation, and reference SHA256 hashes.

All generated data is marked `provenance: "synthetic"` and conforms to `shared/schemas/historical-operation.schema.json` and `historical-task.schema.json`.

## ML-001 — ETA and unusual usage

Train and evaluate the ETA regressor and usage baseline from the checked-in generated dataset:

```bash
cd ml/
uv run python train_models.py --data ../data/generated --artifacts artifacts
```

The command uses the manifest's chronological train, validation, and test row blocks. ETA uses a task-type median baseline and a Random Forest regressor. It excludes `actual_minutes`, `estimated_minutes`, IDs, and start timestamps from the regression features. Validation absolute residuals calibrate a 90% interval; the independent test block reports actual interval coverage. Metrics are emitted for the overall test set and each task category.

`models.py` exposes `ETAUsageModels.load(...)`, `predict_eta(...)`, and `detect_unusual_usage(...)`. Returned dictionaries follow the shared Prediction and Insight schemas. The usage adapter compares interval idle fraction with the training 95th percentile and estimated active-hour rates with robust median/MAD statistics from the training block. It only produces inefficiency insights; deterministic safety evaluation remains in the backend.

The command writes `eta_model.joblib` and `metadata.json` to the selected artifact directory. Metadata records model version, model and dataset SHA256 hashes, features, split counts, per-category metrics, calibration details, and synthetic-data limitations. Model artifacts are local and gitignored. Load verifies the serialized model hash and model version before use.

## Limitations

- All relationships are synthetic demo hypotheses, NOT measured CAT 325 behavior.
- Evaluation demonstrates pipeline behavior, not real-world predictive accuracy.
- The 4+5 reference rows in `data/reference/` are preserved exactly and never modified.
- Prediction intervals and anomaly thresholds are calibrated from synthetic training/validation data and must not be presented as CAT thresholds or real-world guarantees.
