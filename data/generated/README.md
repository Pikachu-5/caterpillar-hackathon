# Generated dataset output

This directory receives the output of the DATA-001 synthetic data generator.
Files here are **gitignored** — run the generator locally to reproduce them.

## Generating the dataset

```bash
cd ml/
uv run python generate_dataset.py --seed 42 --output ../data/generated/
```

## Output files

| File | Description |
| --- | --- |
| `operations.csv` | ~1000 synthetic operation interval records |
| `tasks.csv` | ~500 synthetic task completion records |
| `operations.jsonl` | Same operations as newline-delimited JSON |
| `tasks.jsonl` | Same tasks as newline-delimited JSON |
| `manifest.json` | Generation provenance: seed, version, parameters, SHA256 hashes, units, split info, limitations |
| `splits.json` | Train/validation/test row ranges for each table |

## Validating the output

```bash
cd ml/
uv run python validate_dataset.py ../data/generated/
```

This validates against `shared/schemas/`, checks semantic constraints, and verifies
reference data integrity.

## Determinism

Running the generator with the same `--seed` always produces byte-identical output.
The manifest records the exact seed and generator version for full reproducibility.
