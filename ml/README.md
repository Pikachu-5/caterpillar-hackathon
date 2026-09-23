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

## Limitations

- All relationships are synthetic demo hypotheses, NOT measured CAT 325 behavior.
- Evaluation demonstrates pipeline behavior, not real-world predictive accuracy.
- The 4+5 reference rows in `data/reference/` are preserved exactly and never modified.
