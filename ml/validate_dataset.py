"""
Schema and semantic validation for generated datasets.

Validates generated output against:
1. JSON schemas from shared/schemas/ (structural compliance)
2. Semantic constraints (monotonic engine hours, idle <= interval, etc.)
3. Reference data integrity (SHA256 verification)

Usage:
    uv run python validate_dataset.py [../data/generated/]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

try:
    import jsonschema
except ImportError:
    jsonschema = None  # type: ignore[assignment]


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_schema(schema_dir: Path, filename: str) -> dict[str, Any]:
    """Load a JSON schema and set up a resolver for $ref resolution."""
    path = schema_dir / filename
    with open(path) as f:
        return json.load(f)


def _get_format_checker() -> jsonschema.FormatChecker | None:
    """Get a jsonschema FormatChecker with date-time validation enabled."""
    if jsonschema is None:
        return None
    checker = jsonschema.FormatChecker()
    if "date-time" not in checker.checkers:
        from datetime import datetime

        @checker.checks("date-time")
        def _check_datetime(val: Any) -> bool:
            if not isinstance(val, str):
                return True
            try:
                datetime.fromisoformat(val)
                return True
            except (ValueError, TypeError):
                return False

    return checker


def _create_validator(schema: dict[str, Any], schema_dir: Path) -> jsonschema.Draft202012Validator:
    """Create a JSON Schema validator with local $ref resolution and format checking."""
    # Build a schema store for all schemas in the directory
    store: dict[str, dict[str, Any]] = {}
    for schema_file in schema_dir.glob("*.schema.json"):
        with open(schema_file) as f:
            s = json.load(f)
        if "$id" in s:
            store[s["$id"]] = s
        # Also index by filename for relative $ref
        store[schema_file.name] = s

    format_checker = _get_format_checker()

    # Create a registry for jsonschema >= 4.18
    try:
        from referencing import Registry, Resource
        from referencing.jsonschema import DRAFT202012

        resources = []
        for uri, s in store.items():
            resources.append((uri, Resource.from_contents(s, default_specification=DRAFT202012)))
        registry = Registry().with_resources(resources)
        return jsonschema.Draft202012Validator(
            schema, registry=registry, format_checker=format_checker
        )
    except ImportError:
        # Fallback for older jsonschema without referencing
        resolver = jsonschema.RefResolver(
            base_uri=f"file://{schema_dir}/",
            referrer=schema,
            store=store,
        )
        return jsonschema.Draft202012Validator(
            schema, resolver=resolver, format_checker=format_checker
        )


class ValidationReport:
    """Accumulates validation results."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.checks_passed: int = 0
        self.checks_total: int = 0

    def error(self, msg: str) -> None:
        self.errors.append(msg)
        self.checks_total += 1

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def passed(self, msg: str) -> None:
        self.checks_passed += 1
        self.checks_total += 1

    def ok(self) -> bool:
        return len(self.errors) == 0

    def summary(self) -> str:
        lines = []
        if self.errors:
            lines.append(f"\n{'=' * 60}")
            lines.append(f"ERRORS ({len(self.errors)}):")
            for e in self.errors:
                lines.append(f"  ✗ {e}")
        if self.warnings:
            lines.append(f"\nWARNINGS ({len(self.warnings)}):")
            for w in self.warnings:
                lines.append(f"  ⚠ {w}")
        lines.append(f"\nResult: {self.checks_passed}/{self.checks_total} checks passed")
        if self.ok():
            lines.append("✓ All validations passed")
        else:
            lines.append("✗ Validation FAILED")
        return "\n".join(lines)


def _read_csv_records(path: Path) -> list[dict[str, Any]]:
    """Read a CSV file and return list of dicts with type coercion."""
    records = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Coerce numeric fields
            coerced: dict[str, Any] = {}
            for k, v in row.items():
                if v == "":
                    continue
                # Try integer first, then float
                try:
                    coerced[k] = int(v)
                except ValueError:
                    try:
                        coerced[k] = float(v)
                    except ValueError:
                        coerced[k] = v
            records.append(coerced)
    return records


def validate_schema(
    records: list[dict[str, Any]],
    schema: dict[str, Any],
    schema_dir: Path,
    table_name: str,
    report: ValidationReport,
) -> None:
    """Validate each record against its JSON schema."""
    if jsonschema is None:
        report.error("jsonschema is required for schema validation but is not installed")
        return

    validator = _create_validator(schema, schema_dir)

    errors_found = 0
    for i, record in enumerate(records):
        errs = list(validator.iter_errors(record))
        if errs:
            errors_found += 1
            if errors_found <= 5:  # Only show first 5 errors
                for err in errs:
                    report.error(f"{table_name}[{i}]: {err.message} at {list(err.path)}")

    if errors_found == 0:
        report.passed(f"{table_name}: all {len(records)} records pass schema validation")
    else:
        report.error(
            f"{table_name}: {errors_found}/{len(records)} records failed schema validation"
        )


def validate_operations_semantics(records: list[dict[str, Any]], report: ValidationReport) -> None:
    """Check semantic constraints on operation records."""
    if not records:
        report.warn("No operation records to validate")
        return

    # Group by machine_id for per-machine checks
    by_machine: dict[str, list[dict[str, Any]]] = {}
    for r in records:
        mid = r.get("machine_id", "UNKNOWN")
        by_machine.setdefault(mid, []).append(r)

    # Check monotonic engine hours per machine
    for mid, machine_records in by_machine.items():
        sorted_recs = sorted(machine_records, key=lambda r: r["timestamp"])
        prev_hours = -1.0
        monotonic = True
        for r in sorted_recs:
            hours = r.get("engine_hours", 0)
            if hours < prev_hours:
                report.error(
                    f"operations: engine_hours not monotonic for {mid} "
                    f"at {r['timestamp']}: {hours} < {prev_hours}"
                )
                monotonic = False
                break
            prev_hours = hours
        if monotonic:
            report.passed(f"operations/{mid}: engine_hours monotonically increasing")

    # Check per-record constraints
    constraint_errors = 0
    for i, r in enumerate(records):
        interval = r.get("interval_minutes", 60)

        # idling_time_min <= interval_minutes
        idle = r.get("idling_time_min", 0)
        if idle > interval + 0.01:  # small float tolerance
            if constraint_errors < 5:
                report.error(
                    f"operations[{i}]: idling_time_min ({idle}) > interval_minutes ({interval})"
                )
            constraint_errors += 1

        # fuel_used_l >= 0
        fuel = r.get("fuel_used_l", 0)
        if fuel < 0:
            if constraint_errors < 5:
                report.error(f"operations[{i}]: fuel_used_l ({fuel}) < 0")
            constraint_errors += 1

        # load_cycles >= 0 and integer
        cycles = r.get("load_cycles", 0)
        if cycles < 0 or not isinstance(cycles, int):
            if constraint_errors < 5:
                report.error(f"operations[{i}]: load_cycles ({cycles}) must be nonneg integer")
            constraint_errors += 1

    # Check no duplicate timestamps per machine
    for mid, machine_records in by_machine.items():
        timestamps = [r["timestamp"] for r in machine_records]
        if len(timestamps) != len(set(timestamps)):
            report.error(f"operations/{mid}: duplicate timestamps found")
        else:
            report.passed(f"operations/{mid}: no duplicate timestamps")

    if constraint_errors == 0:
        report.passed("operations: all per-record constraints satisfied")
    else:
        report.error(f"operations: {constraint_errors} constraint violations")

    # Check provenance
    for r in records:
        if r.get("provenance") != "synthetic":
            report.error("operations: record missing provenance='synthetic'")
            break
    else:
        report.passed("operations: all records have provenance='synthetic'")


def validate_tasks_semantics(records: list[dict[str, Any]], report: ValidationReport) -> None:
    """Check semantic constraints on task records."""
    if not records:
        report.warn("No task records to validate")
        return

    # Check all task types covered
    task_types_present = {r["task_type"] for r in records}
    expected_types = {"Earth Excavation", "Trenching", "Material Loading", "Grading", "Demolition"}
    missing = expected_types - task_types_present
    if missing:
        report.error(f"tasks: missing task types: {missing}")
    else:
        report.passed("tasks: all 5 task types covered")

    # Check all skill levels covered
    skills_present = {r["operator_skill"] for r in records}
    expected_skills = {"Beginner", "Intermediate", "Expert"}
    missing_skills = expected_skills - skills_present
    if missing_skills:
        report.error(f"tasks: missing skill levels: {missing_skills}")
    else:
        report.passed("tasks: all 3 skill levels covered")

    # Check all weather categories covered
    weather_present = {r["weather"] for r in records}
    expected_weather = {"Sunny", "Rainy", "Cloudy", "Windy"}
    missing_weather = expected_weather - weather_present
    if missing_weather:
        report.error(f"tasks: missing weather categories: {missing_weather}")
    else:
        report.passed("tasks: all 4 weather categories covered")

    # Check positive times
    time_errors = 0
    for i, r in enumerate(records):
        if r.get("estimated_minutes", 0) <= 0:
            if time_errors < 3:
                report.error(f"tasks[{i}]: estimated_minutes <= 0")
            time_errors += 1
        if r.get("actual_minutes", 0) <= 0:
            if time_errors < 3:
                report.error(f"tasks[{i}]: actual_minutes <= 0")
            time_errors += 1

    if time_errors == 0:
        report.passed("tasks: all times positive")

    # Check provenance
    for r in records:
        if r.get("provenance") != "synthetic":
            report.error("tasks: record missing provenance='synthetic'")
            break
    else:
        report.passed("tasks: all records have provenance='synthetic'")

    # Check unique task IDs
    task_ids = [r["task_id"] for r in records]
    if len(task_ids) != len(set(task_ids)):
        report.error("tasks: duplicate task_id values found")
    else:
        report.passed("tasks: all task_id values unique")


def validate_reference_integrity(reference_dir: Path, report: ValidationReport) -> None:
    """Verify reference CSVs match their documented SHA256 hashes."""
    provenance_file = reference_dir / "provenance.json"
    if not provenance_file.exists():
        report.warn(f"Reference provenance not found: {provenance_file}")
        return

    with open(provenance_file) as f:
        prov = json.load(f)

    for file_info in prov["files"]:
        ref_file = reference_dir / file_info["filename"]
        if not ref_file.exists():
            report.error(f"Reference file missing: {ref_file}")
            continue

        actual_hash = _sha256_file(ref_file)
        expected_hash = file_info["sha256"]
        if actual_hash == expected_hash:
            report.passed(f"reference/{file_info['filename']}: SHA256 matches")
        else:
            report.error(
                f"reference/{file_info['filename']}: SHA256 mismatch! "
                f"expected={expected_hash}, actual={actual_hash}"
            )


def validate_splits(generated_dir: Path, report: ValidationReport) -> None:
    """Verify the splits index is consistent with the data files."""
    splits_file = generated_dir / "splits.json"
    if not splits_file.exists():
        report.error(f"Required artifact splits.json not found at {splits_file}")
        return

    try:
        with open(splits_file) as f:
            splits = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        report.error(f"Failed to parse splits.json: {e}")
        return

    for table in ("operations", "tasks"):
        csv_file = generated_dir / f"{table}.csv"
        if not csv_file.exists():
            report.error(f"Required artifact {table}.csv not found at {csv_file}")
            continue

        records = _read_csv_records(csv_file)
        total_rows = len(records)

        table_splits = splits.get(table)
        if not isinstance(table_splits, dict):
            report.error(f"splits.json: '{table}' section missing or not an object")
            continue

        required_splits = ("train", "validation", "test")
        missing_splits = [s for s in required_splits if s not in table_splits]
        if missing_splits:
            report.error(f"splits/{table}: missing split names: {missing_splits}")
            continue

        # Validate types and bounds
        valid_ranges = True
        for s_name in required_splits:
            s = table_splits[s_name]
            if not isinstance(s, dict):
                report.error(f"splits/{table}/{s_name}: expected dict, got {type(s)}")
                valid_ranges = False
                continue

            start_row = s.get("start_row")
            end_row = s.get("end_row")

            if not (isinstance(start_row, int) and not isinstance(start_row, bool)) or not (
                isinstance(end_row, int) and not isinstance(end_row, bool)
            ):
                report.error(
                    f"splits/{table}/{s_name}: start_row and end_row must be integers "
                    f"(got start_row={start_row}, end_row={end_row})"
                )
                valid_ranges = False
                continue

            if not (0 <= start_row <= end_row <= total_rows):
                report.error(
                    f"splits/{table}/{s_name}: range [{start_row}, {end_row}] out of "
                    f"bounds for {total_rows} rows"
                )
                valid_ranges = False

        if not valid_ranges:
            continue

        train_s = table_splits["train"]
        val_s = table_splits["validation"]
        test_s = table_splits["test"]

        # 1. train begins at row 0
        if train_s["start_row"] != 0:
            report.error(f"splits/{table}: train must begin at row 0, got {train_s['start_row']}")
        else:
            report.passed(f"splits/{table}: train begins at row 0")

        # 2. validation begins exactly where train ends
        if val_s["start_row"] != train_s["end_row"]:
            report.error(
                f"splits/{table}: validation start_row ({val_s['start_row']}) does "
                f"not match train end_row ({train_s['end_row']})"
            )
        else:
            report.passed(f"splits/{table}: validation begins exactly where train ends")

        # 3. test begins exactly where validation ends
        if test_s["start_row"] != val_s["end_row"]:
            report.error(
                f"splits/{table}: test start_row ({test_s['start_row']}) does not "
                f"match validation end_row ({val_s['end_row']})"
            )
        else:
            report.passed(f"splits/{table}: test begins exactly where validation ends")

        # 4. final test end equals CSV row count
        if test_s["end_row"] != total_rows:
            report.error(
                f"splits/{table}: test end_row ({test_s['end_row']}) does not match "
                f"CSV row count ({total_rows})"
            )
        else:
            report.passed(f"splits/{table}: final test end matches CSV row count ({total_rows})")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Validate generated dataset")
    parser.add_argument(
        "generated_dir",
        nargs="?",
        default="../data/generated/",
        help="Path to generated data directory (default: ../data/generated/)",
    )
    parser.add_argument(
        "--reference",
        type=str,
        default="../data/reference/",
        help="Path to reference data directory",
    )
    parser.add_argument(
        "--schemas",
        type=str,
        default="../shared/schemas/",
        help="Path to JSON schema directory",
    )

    args = parser.parse_args(argv)
    generated_dir = Path(args.generated_dir)
    reference_dir = Path(args.reference)
    schema_dir = Path(args.schemas)

    report = ValidationReport()

    print(f"Validating dataset in {generated_dir.resolve()}")
    print(f"Reference: {reference_dir.resolve()}")
    print(f"Schemas: {schema_dir.resolve()}")
    print()

    if jsonschema is None:
        report.error("jsonschema package is required for validation but is not installed")

    # 1. Reference integrity
    print("Checking reference data integrity...")
    validate_reference_integrity(reference_dir, report)

    # 2. Check required generated artifacts
    ops_csv = generated_dir / "operations.csv"
    tasks_csv = generated_dir / "tasks.csv"
    ops_jsonl = generated_dir / "operations.jsonl"
    tasks_jsonl = generated_dir / "tasks.jsonl"
    manifest_json = generated_dir / "manifest.json"
    splits_json = generated_dir / "splits.json"

    required_files = [
        ("operations.csv", ops_csv),
        ("tasks.csv", tasks_csv),
        ("operations.jsonl", ops_jsonl),
        ("tasks.jsonl", tasks_jsonl),
        ("manifest.json", manifest_json),
        ("splits.json", splits_json),
    ]
    for name, path in required_files:
        if path.exists():
            report.passed(f"artifact/{name}: file exists")
        else:
            report.error(f"artifact/{name}: required file not found at {path}")

    # 3. Schema & semantics validation
    if ops_csv.exists():
        print("Validating operations schema...")
        ops_records = _read_csv_records(ops_csv)
        ops_schema = _load_schema(schema_dir, "historical-operation.schema.json")
        validate_schema(ops_records, ops_schema, schema_dir, "operations", report)

        print("Validating operations semantics...")
        validate_operations_semantics(ops_records, report)

        if ops_jsonl.exists():
            with open(ops_jsonl) as f:
                jsonl_count = sum(1 for line in f if line.strip())
            if jsonl_count == len(ops_records):
                report.passed(f"operations.jsonl: line count ({jsonl_count}) matches CSV")
            else:
                report.error(
                    f"operations.jsonl: line count ({jsonl_count}) does not match CSV ({len(ops_records)})"
                )

    if tasks_csv.exists():
        print("Validating tasks schema...")
        tasks_records = _read_csv_records(tasks_csv)
        tasks_schema = _load_schema(schema_dir, "historical-task.schema.json")
        validate_schema(tasks_records, tasks_schema, schema_dir, "tasks", report)

        print("Validating tasks semantics...")
        validate_tasks_semantics(tasks_records, report)

        if tasks_jsonl.exists():
            with open(tasks_jsonl) as f:
                jsonl_count = sum(1 for line in f if line.strip())
            if jsonl_count == len(tasks_records):
                report.passed(f"tasks.jsonl: line count ({jsonl_count}) matches CSV")
            else:
                report.error(
                    f"tasks.jsonl: line count ({jsonl_count}) does not match CSV ({len(tasks_records)})"
                )

    # 4. Splits validation
    print("Validating splits...")
    validate_splits(generated_dir, report)

    # 5. Manifest check
    if manifest_json.exists():
        try:
            with open(manifest_json) as f:
                m = json.load(f)
            required_keys = [
                "generator_version",
                "generation_seed",
                "generated_at",
                "parameters",
                "output",
                "reference_data",
                "units",
                "limits_disclaimer",
            ]
            for key in required_keys:
                if key in m:
                    report.passed(f"manifest: has required key '{key}'")
                else:
                    report.error(f"manifest: missing required key '{key}'")
        except (json.JSONDecodeError, OSError) as e:
            report.error(f"Failed to parse manifest.json: {e}")

    print(report.summary())
    sys.exit(0 if report.ok() else 1)


if __name__ == "__main__":
    main()
