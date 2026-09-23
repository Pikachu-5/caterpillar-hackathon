"""
Reproducible synthetic dataset generator for DATA-001.

Generates deterministic synthetic operations and task records using a seeded RNG.
All output conforms to shared/schemas/ JSON schemas and documents provenance.

Usage:
    uv run python generate_dataset.py [--seed 42] [--output ../data/generated/]

The generator:
- Preserves reference CSVs exactly (never modifies data/reference/)
- Produces operations.csv, tasks.csv, and manifest.json in the output directory
- Uses a single numpy RandomState seeded from the config for full determinism
- Marks all generated records with provenance="synthetic"
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from generation_config import GenerationConfig

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sha256_file(path: Path) -> str:
    """Compute SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _sha256_bytes(data: bytes) -> str:
    """Compute SHA-256 hex digest of bytes."""
    return hashlib.sha256(data).hexdigest()


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


# ---------------------------------------------------------------------------
# Operations generator
# ---------------------------------------------------------------------------


def _generate_work_schedule(cfg: GenerationConfig) -> list[datetime]:
    """
    Build a list of 60-minute interval start timestamps covering the work schedule.

    Returns timestamps as naive datetime objects (timezone is documented in config,
    matching the original reference data's unspecified-timezone format).
    """
    start = datetime.strptime(cfg.ops_start_date, "%Y-%m-%d")  # noqa: DTZ007 — intentionally naive
    timestamps: list[datetime] = []
    current_date = start
    days_covered = 0

    while days_covered < cfg.ops_num_days:
        # Skip weekends if configured
        if cfg.weekdays_only and current_date.weekday() >= 5:
            current_date += timedelta(days=1)
            continue

        # Generate intervals for this work day
        for hour in range(cfg.work_start_hour, cfg.work_end_hour):
            ts = current_date.replace(hour=hour, minute=0, second=0, microsecond=0)
            timestamps.append(ts)

        days_covered += 1
        current_date += timedelta(days=1)

    return timestamps


def _choose_weather(rng: np.random.RandomState, cfg: GenerationConfig) -> str:
    """Pick a weather category for a given interval."""
    return rng.choice(list(cfg.weather_categories))


def _choose_soil(rng: np.random.RandomState, cfg: GenerationConfig) -> tuple[str, float]:
    """Pick soil type and moisture for a given interval."""
    soil_type = rng.choice(list(cfg.soil_types), p=list(cfg.soil_type_weights))
    moisture = rng.uniform(cfg.soil_moisture_min, cfg.soil_moisture_max)
    return soil_type, round(moisture, 1)


def _generate_temperature(rng: np.random.RandomState, cfg: GenerationConfig, month: int) -> float:
    """Generate ambient temperature based on month (seasonal variation)."""
    if month in (6, 7, 8):  # summer
        temp = rng.normal(cfg.temperature_summer_mean, cfg.temperature_summer_std)
    else:  # spring/fall
        temp = rng.normal(cfg.temperature_spring_mean, cfg.temperature_spring_std)
    return round(_clamp(temp, cfg.temperature_min_clamp, cfg.temperature_max_clamp), 1)


def generate_operations(cfg: GenerationConfig, rng: np.random.RandomState) -> list[dict[str, Any]]:
    """
    Generate synthetic operation records.

    Each record represents one 60-minute aggregation interval for a machine/operator
    pair. Engine hours are cumulative and monotonically increasing per machine.
    """
    timestamps = _generate_work_schedule(cfg)
    records: list[dict[str, Any]] = []

    for machine in cfg.machines:
        engine_hours = machine.initial_engine_hours

        # Track seatbelt streak for realistic behavior
        unfastened_streak = 0

        for ts in timestamps:
            # Assign operator (cycle through operators for this machine)
            operator = cfg.operators[len(records) % len(cfg.operators)]

            weather = _choose_weather(rng, cfg)
            soil_type, soil_moisture = _choose_soil(rng, cfg)
            temperature = _generate_temperature(rng, cfg, ts.month)

            # Adjust soil moisture for rain
            if weather == "Rainy":
                soil_moisture = round(min(soil_moisture + cfg.soil_moisture_rain_bonus, 100.0), 1)

            # Determine if this is an idle interval
            is_idle = rng.random() < cfg.load_cycles_idle_probability

            if is_idle:
                load_cycles = 0
                idling_time = round(rng.uniform(45.0, cfg.idle_base_max), 1)
                fuel_used = round(cfg.fuel_idle_penalty + rng.uniform(0, 0.5), 1)
            else:
                load_cycles = int(
                    rng.randint(cfg.load_cycles_active_min, cfg.load_cycles_active_max + 1)
                )
                # Idling is anticorrelated with load cycles
                idle_fraction = max(0.0, 1.0 - (load_cycles / cfg.load_cycles_active_max))
                idling_time = round(
                    cfg.idle_base_min
                    + idle_fraction * (cfg.idle_base_max - cfg.idle_base_min)
                    + rng.normal(0, 3),
                    1,
                )
                idling_time = round(_clamp(idling_time, 0.0, cfg.interval_minutes), 1)

                # Fuel correlates with load cycles
                fuel_used = round(
                    rng.uniform(cfg.fuel_base_min, cfg.fuel_base_max)
                    + load_cycles * cfg.fuel_load_bonus_per_cycle
                    + rng.normal(0, 0.3),
                    1,
                )
                fuel_used = round(max(0.1, fuel_used), 1)

            # Engine hours: cumulative, increment by runtime fraction
            runtime_fraction = 1.0 - (idling_time / cfg.interval_minutes) * 0.3
            engine_increment = (
                rng.uniform(cfg.engine_hours_min_increment, cfg.engine_hours_max_increment)
                * runtime_fraction
            )
            engine_hours = round(engine_hours + engine_increment, 1)

            # Seatbelt status with streak logic
            if unfastened_streak >= cfg.seatbelt_unfastened_streak_max:
                seatbelt = "Fastened"
                unfastened_streak = 0
            elif rng.random() < cfg.seatbelt_unfastened_probability:
                seatbelt = "Unfastened"
                unfastened_streak += 1
            else:
                seatbelt = "Fastened"
                unfastened_streak = 0

            # Safety alert: correlated with seatbelt but NOT deterministic
            if seatbelt == "Unfastened":
                alert = "Yes" if rng.random() < cfg.alert_given_unfastened_probability else "No"
            else:
                alert = "Yes" if rng.random() < cfg.alert_given_fastened_probability else "No"

            record = {
                "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
                "machine_id": machine.machine_id,
                "operator_id": operator.operator_id,
                "engine_hours": engine_hours,
                "fuel_used_l": fuel_used,
                "load_cycles": load_cycles,
                "idling_time_min": idling_time,
                "seatbelt_status": seatbelt,
                "safety_alert_triggered": alert,
                "provenance": "synthetic",
                "machine_model": machine.machine_model,
                "air_temperature_c": temperature,
                "soil_type": soil_type,
                "soil_moisture_percent_vwc": soil_moisture,
                "interval_minutes": cfg.interval_minutes,
                "timezone": cfg.timezone,
                "generator_version": cfg.generator_version,
                "generation_seed": cfg.seed,
            }
            records.append(record)

    return records


# ---------------------------------------------------------------------------
# Tasks generator
# ---------------------------------------------------------------------------


def generate_tasks(cfg: GenerationConfig, rng: np.random.RandomState) -> list[dict[str, Any]]:
    """
    Generate synthetic task records.

    Covers all task_type × skill × weather combinations with environmental variation.
    Actual time is influenced by skill, weather, soil, machine age with noise and
    counterexamples.
    """
    records: list[dict[str, Any]] = []
    task_counter = 100  # Start at T100 to avoid collision with reference T001-T005

    # Generate full coverage of all combinations plus extras for volume
    combos = [
        (tt, sk, wt)
        for tt in cfg.task_types
        for sk in cfg.skill_levels
        for wt in cfg.weather_categories
    ]

    # Each combo gets at least 1 record, then distribute remaining
    tasks_per_combo = max(1, cfg.num_tasks // len(combos))
    extra_tasks = cfg.num_tasks - tasks_per_combo * len(combos)

    for combo_idx, (task_type, skill, weather) in enumerate(combos):
        n = tasks_per_combo + (1 if combo_idx < extra_tasks else 0)
        for _ in range(n):
            task_counter += 1
            task_id = f"T{task_counter:04d}"

            # Environmental conditions
            soil_type, soil_moisture = _choose_soil(rng, cfg)
            if weather == "Rainy":
                soil_moisture = round(min(soil_moisture + cfg.soil_moisture_rain_bonus, 100.0), 1)

            # Pick a machine and derive age
            machine = cfg.machines[rng.randint(0, len(cfg.machines))]
            machine_age = round(machine.age_years + rng.uniform(-0.5, 2.0), 1)
            machine_age = max(cfg.machine_age_min, min(cfg.machine_age_max, machine_age))

            # Temperature
            month = rng.randint(4, 10)  # April-September range
            temperature = _generate_temperature(rng, cfg, month)

            # Operator
            operator = rng.choice(cfg.operators)

            # Base estimated time with noise
            base_minutes = cfg.task_base_minutes[task_type]
            estimated_noise = rng.normal(0, base_minutes * cfg.estimated_time_noise_std_fraction)
            estimated_minutes = round(max(5.0, base_minutes + estimated_noise), 0)

            # Actual time: apply multipliers
            actual_base = base_minutes
            actual_base *= cfg.skill_multipliers[skill]
            actual_base *= cfg.weather_multipliers[weather]
            actual_base *= cfg.soil_multipliers.get(soil_type, 1.0)
            actual_base *= 1.0 + cfg.machine_age_multiplier_per_year * machine_age

            # Add realistic noise
            actual_noise = rng.normal(0, actual_base * cfg.task_time_noise_std_fraction)
            actual_minutes = round(max(5.0, actual_base + actual_noise), 0)

            # Counterexamples: sometimes things go better/worse than expected
            if rng.random() < cfg.counterexample_rate:
                # Flip the relationship — beginner finishes fast or expert finishes slow
                if skill == "Beginner":
                    actual_minutes = round(max(5.0, estimated_minutes * rng.uniform(0.7, 0.95)), 0)
                elif skill == "Expert":
                    actual_minutes = round(estimated_minutes * rng.uniform(1.1, 1.4), 0)

            # Generate a synthetic start time
            start_day_offset = rng.randint(0, cfg.ops_num_days)
            start_hour = rng.randint(cfg.work_start_hour, cfg.work_end_hour)
            start_date = datetime.strptime(  # noqa: DTZ007 — naive is intentional
                cfg.ops_start_date, "%Y-%m-%d"
            ) + timedelta(days=int(start_day_offset))
            started_at = start_date.replace(
                hour=int(start_hour), minute=rng.randint(0, 60), second=0
            )
            # RFC3339 UTC format as required by common.schema.json#/$defs/timestamp
            started_at_str = started_at.strftime("%Y-%m-%dT%H:%M:%SZ")

            record = {
                "task_id": task_id,
                "task_type": task_type,
                "weather": weather,
                "operator_skill": skill,
                "machine_age_years": machine_age,
                "estimated_minutes": estimated_minutes,
                "actual_minutes": actual_minutes,
                "provenance": "synthetic",
                "air_temperature_c": temperature,
                "soil_type": soil_type,
                "soil_moisture_percent_vwc": soil_moisture,
                "machine_id": machine.machine_id,
                "operator_id": operator.operator_id,
                "started_at": started_at_str,
                "generator_version": cfg.generator_version,
                "generation_seed": cfg.seed,
            }
            records.append(record)

    return records


# ---------------------------------------------------------------------------
# Split allocation
# ---------------------------------------------------------------------------


def assign_splits(
    records: list[dict[str, Any]], cfg: GenerationConfig, table_name: str
) -> dict[str, list[dict[str, Any]]]:
    """
    Assign records to train/validation/test splits by chronological groups.

    For operations: split by timestamp blocks (first 70% of timestamps → train, etc.)
    For tasks: split by generation order (which is deterministic given the seed)

    Never scatters individual rows randomly — entire chronological blocks stay together.
    """
    n = len(records)
    train_end = int(n * cfg.train_fraction)
    val_end = train_end + int(n * cfg.validation_fraction)

    return {
        "train": records[:train_end],
        "validation": records[train_end:val_end],
        "test": records[val_end:],
    }


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------

OPERATIONS_CSV_COLUMNS = [
    "timestamp",
    "machine_id",
    "operator_id",
    "engine_hours",
    "fuel_used_l",
    "load_cycles",
    "idling_time_min",
    "seatbelt_status",
    "safety_alert_triggered",
    "provenance",
    "machine_model",
    "air_temperature_c",
    "soil_type",
    "soil_moisture_percent_vwc",
    "interval_minutes",
    "timezone",
    "generator_version",
    "generation_seed",
]

TASKS_CSV_COLUMNS = [
    "task_id",
    "task_type",
    "weather",
    "operator_skill",
    "machine_age_years",
    "estimated_minutes",
    "actual_minutes",
    "provenance",
    "air_temperature_c",
    "soil_type",
    "soil_moisture_percent_vwc",
    "machine_id",
    "operator_id",
    "started_at",
    "generator_version",
    "generation_seed",
]


def _write_csv(records: list[dict[str, Any]], path: Path, columns: list[str]) -> None:
    """Write records to CSV with explicit column ordering."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)


def _write_jsonl(records: list[dict[str, Any]], path: Path) -> None:
    """Write records as newline-delimited JSON (one JSON object per line)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        f.writelines(
            json.dumps(record, separators=(",", ":"), sort_keys=True) + "\n" for record in records
        )


def _write_manifest(
    output_dir: Path,
    cfg: GenerationConfig,
    ops_splits: dict[str, list],
    task_splits: dict[str, list],
    reference_dir: Path,
) -> None:
    """Write the generation manifest with full provenance."""
    # Compute output hashes
    ops_csv = output_dir / "operations.csv"
    tasks_csv = output_dir / "tasks.csv"

    # Reference hashes
    ref_ops = reference_dir / "operations.csv"
    ref_tasks = reference_dir / "tasks.csv"

    manifest = {
        "generator_version": cfg.generator_version,
        "generation_seed": cfg.seed,
        "generated_at": datetime.now(tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "limits_disclaimer": (
            "This is synthetic data generated for demo purposes. "
            "All relationships between variables are hypothetical assumptions, "
            "not measured CAT 325 behavior. Synthetic evaluation demonstrates "
            "pipeline behavior, not real-world predictive accuracy."
        ),
        "parameters": {
            "interval_minutes": cfg.interval_minutes,
            "timezone": cfg.timezone,
            "work_schedule": f"{cfg.work_start_hour:02d}:00-{cfg.work_end_hour:02d}:00 weekdays",
            "ops_start_date": cfg.ops_start_date,
            "ops_num_days": cfg.ops_num_days,
            "num_tasks": cfg.num_tasks,
            "operators": [{"id": op.operator_id, "skill": op.skill} for op in cfg.operators],
            "machines": [
                {
                    "id": m.machine_id,
                    "model": m.machine_model,
                    "age_years": m.age_years,
                    "initial_engine_hours": m.initial_engine_hours,
                }
                for m in cfg.machines
            ],
            "temperature_range_c": [cfg.temperature_min_clamp, cfg.temperature_max_clamp],
            "soil_types": list(cfg.soil_types),
            "soil_moisture_range_vwc": [cfg.soil_moisture_min, cfg.soil_moisture_max],
            "task_types": list(cfg.task_types),
            "weather_categories": list(cfg.weather_categories),
            "skill_levels": list(cfg.skill_levels),
            "split_method": "chronological_block",
            "split_fractions": {
                "train": cfg.train_fraction,
                "validation": cfg.validation_fraction,
                "test": cfg.test_fraction,
            },
        },
        "output": {
            "operations": {
                "total_rows": sum(len(v) for v in ops_splits.values()),
                "train_rows": len(ops_splits["train"]),
                "validation_rows": len(ops_splits["validation"]),
                "test_rows": len(ops_splits["test"]),
                "sha256": _sha256_file(ops_csv) if ops_csv.exists() else None,
            },
            "tasks": {
                "total_rows": sum(len(v) for v in task_splits.values()),
                "train_rows": len(task_splits["train"]),
                "validation_rows": len(task_splits["validation"]),
                "test_rows": len(task_splits["test"]),
                "sha256": _sha256_file(tasks_csv) if tasks_csv.exists() else None,
            },
        },
        "reference_data": {
            "operations_sha256": _sha256_file(ref_ops) if ref_ops.exists() else "NOT_FOUND",
            "tasks_sha256": _sha256_file(ref_tasks) if ref_tasks.exists() else "NOT_FOUND",
            "note": "Reference CSVs are preserved exactly; synthetic data is separate.",
        },
        "units": {
            "fuel_used_l": "liters per interval",
            "idling_time_min": "minutes within interval",
            "engine_hours": "cumulative operating hours",
            "air_temperature_c": "degrees Celsius (ambient, not engine)",
            "soil_moisture_percent_vwc": "volumetric water content percentage",
            "estimated_minutes": "minutes",
            "actual_minutes": "minutes",
            "machine_age_years": "years",
            "interval_minutes": "minutes",
        },
    }

    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


# ---------------------------------------------------------------------------
# Split metadata file
# ---------------------------------------------------------------------------


def _write_splits_index(
    output_dir: Path,
    ops_splits: dict[str, list[dict[str, Any]]],
    task_splits: dict[str, list[dict[str, Any]]],
) -> None:
    """Write a JSON index mapping split names to row ranges for downstream consumers."""
    index = {
        "operations": {},
        "tasks": {},
    }
    offset = 0
    for split_name in ("train", "validation", "test"):
        n = len(ops_splits[split_name])
        index["operations"][split_name] = {"start_row": offset, "end_row": offset + n}
        offset += n

    offset = 0
    for split_name in ("train", "validation", "test"):
        n = len(task_splits[split_name])
        index["tasks"][split_name] = {"start_row": offset, "end_row": offset + n}
        offset += n

    path = output_dir / "splits.json"
    with open(path, "w") as f:
        json.dump(index, f, indent=2)
        f.write("\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Generate reproducible synthetic dataset for DATA-001"
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for deterministic generation (default: 42)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="../data/generated/",
        help="Output directory for generated data (default: ../data/generated/)",
    )
    parser.add_argument(
        "--reference",
        type=str,
        default="../data/reference/",
        help="Reference data directory (default: ../data/reference/)",
    )
    parser.add_argument(
        "--num-tasks",
        type=int,
        default=None,
        help="Override number of task records to generate",
    )
    parser.add_argument(
        "--num-days",
        type=int,
        default=None,
        help="Override number of simulated work days for operations",
    )

    args = parser.parse_args(argv)

    # Build config with any overrides
    overrides: dict[str, Any] = {"seed": args.seed}
    if args.num_tasks is not None:
        overrides["num_tasks"] = args.num_tasks
    if args.num_days is not None:
        overrides["ops_num_days"] = args.num_days

    cfg = GenerationConfig(**overrides)
    rng = np.random.RandomState(cfg.seed)

    output_dir = Path(args.output)
    reference_dir = Path(args.reference)

    print(f"Generating synthetic dataset (seed={cfg.seed}, version={cfg.generator_version})")
    print(f"Output: {output_dir.resolve()}")

    # Generate
    print("Generating operations...")
    operations = generate_operations(cfg, rng)
    print(f"  → {len(operations)} operation records")

    print("Generating tasks...")
    tasks = generate_tasks(cfg, rng)
    print(f"  → {len(tasks)} task records")

    # Split
    ops_splits = assign_splits(operations, cfg, "operations")
    task_splits = assign_splits(tasks, cfg, "tasks")

    print("Splits:")
    for table_name, splits in [("operations", ops_splits), ("tasks", task_splits)]:
        for split_name, split_records in splits.items():
            print(f"  {table_name}/{split_name}: {len(split_records)} rows")

    # Write output
    print("Writing CSV files...")
    # Combine all splits back for the CSV (order preserved: train, val, test)
    all_ops = ops_splits["train"] + ops_splits["validation"] + ops_splits["test"]
    all_tasks = task_splits["train"] + task_splits["validation"] + task_splits["test"]

    _write_csv(all_ops, output_dir / "operations.csv", OPERATIONS_CSV_COLUMNS)
    _write_csv(all_tasks, output_dir / "tasks.csv", TASKS_CSV_COLUMNS)

    print("Writing JSONL files...")
    _write_jsonl(all_ops, output_dir / "operations.jsonl")
    _write_jsonl(all_tasks, output_dir / "tasks.jsonl")

    print("Writing manifest...")
    _write_manifest(output_dir, cfg, ops_splits, task_splits, reference_dir)

    print("Writing splits index...")
    _write_splits_index(output_dir, ops_splits, task_splits)

    # Verify reference data integrity
    ref_provenance = reference_dir / "provenance.json"
    if ref_provenance.exists():
        with open(ref_provenance) as f:
            prov = json.load(f)
        for file_info in prov["files"]:
            ref_file = reference_dir / file_info["filename"]
            if ref_file.exists():
                actual_hash = _sha256_file(ref_file)
                expected_hash = file_info["sha256"]
                status = "✓" if actual_hash == expected_hash else "✗ MISMATCH"
                print(f"Reference integrity: {file_info['filename']} {status}")
            else:
                print(f"Reference integrity: {file_info['filename']} NOT FOUND")

    print("Done.")


if __name__ == "__main__":
    main()
