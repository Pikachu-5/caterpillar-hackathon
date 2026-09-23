"""
Tests for DATA-001 synthetic dataset generation.

Verifies determinism, schema compliance, semantic constraints,
reference preservation, split integrity, error handling, and coverage.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path

import numpy as np
import pytest

from generate_dataset import (
    OPERATIONS_CSV_COLUMNS,
    TASKS_CSV_COLUMNS,
    assign_splits,
    generate_operations,
    generate_tasks,
)
from generate_dataset import (
    main as generate_main,
)
from generation_config import GENERATOR_VERSION, GenerationConfig
from validate_dataset import (
    ValidationReport,
    _create_validator,
    validate_schema,
    validate_splits,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
REFERENCE_DIR = REPO_ROOT / "data" / "reference"
SCHEMA_DIR = REPO_ROOT / "shared" / "schemas"


@pytest.fixture
def cfg() -> GenerationConfig:
    """Default generation config for tests."""
    return GenerationConfig(seed=42)


@pytest.fixture
def small_cfg() -> GenerationConfig:
    """Smaller config for fast tests (60 is min tasks to cover all combos)."""
    return GenerationConfig(seed=42, ops_num_days=5, num_tasks=60)


@pytest.fixture
def operations(cfg: GenerationConfig) -> list[dict]:
    rng = np.random.RandomState(cfg.seed)
    return generate_operations(cfg, rng)


@pytest.fixture
def small_operations(small_cfg: GenerationConfig) -> list[dict]:
    rng = np.random.RandomState(small_cfg.seed)
    return generate_operations(small_cfg, rng)


@pytest.fixture
def tasks(cfg: GenerationConfig) -> list[dict]:
    rng = np.random.RandomState(cfg.seed)
    _ = generate_operations(cfg, rng)  # advance RNG state
    return generate_tasks(cfg, rng)


@pytest.fixture
def small_tasks(small_cfg: GenerationConfig) -> list[dict]:
    rng = np.random.RandomState(small_cfg.seed)
    _ = generate_operations(small_cfg, rng)
    return generate_tasks(small_cfg, rng)


# ---------------------------------------------------------------------------
# Determinism tests
# ---------------------------------------------------------------------------


class TestDeterminism:
    """Same seed must produce identical output."""

    def test_operations_deterministic(self, cfg: GenerationConfig) -> None:
        rng1 = np.random.RandomState(cfg.seed)
        ops1 = generate_operations(cfg, rng1)

        rng2 = np.random.RandomState(cfg.seed)
        ops2 = generate_operations(cfg, rng2)

        assert len(ops1) == len(ops2)
        for r1, r2 in zip(ops1, ops2, strict=True):
            assert r1 == r2, f"Mismatch: {r1} != {r2}"

    def test_tasks_deterministic(self, cfg: GenerationConfig) -> None:
        rng1 = np.random.RandomState(cfg.seed)
        _ = generate_operations(cfg, rng1)
        tasks1 = generate_tasks(cfg, rng1)

        rng2 = np.random.RandomState(cfg.seed)
        _ = generate_operations(cfg, rng2)
        tasks2 = generate_tasks(cfg, rng2)

        assert len(tasks1) == len(tasks2)
        for r1, r2 in zip(tasks1, tasks2, strict=True):
            assert r1 == r2

    def test_different_seed_produces_different_output(self) -> None:
        cfg1 = GenerationConfig(seed=42, ops_num_days=3, num_tasks=60)
        cfg2 = GenerationConfig(seed=99, ops_num_days=3, num_tasks=60)

        rng1 = np.random.RandomState(cfg1.seed)
        ops1 = generate_operations(cfg1, rng1)

        rng2 = np.random.RandomState(cfg2.seed)
        ops2 = generate_operations(cfg2, rng2)

        differences = sum(
            1 for r1, r2 in zip(ops1, ops2, strict=True) if r1["fuel_used_l"] != r2["fuel_used_l"]
        )
        assert differences > 0, "Different seeds should produce different data"

    def test_full_pipeline_determinism(self) -> None:
        """Run the full generator twice and compare output files."""
        with tempfile.TemporaryDirectory() as tmp1, tempfile.TemporaryDirectory() as tmp2:
            generate_main(
                [
                    "--seed",
                    "42",
                    "--output",
                    tmp1,
                    "--num-days",
                    "3",
                    "--num-tasks",
                    "60",
                    "--reference",
                    str(REFERENCE_DIR),
                ]
            )
            generate_main(
                [
                    "--seed",
                    "42",
                    "--output",
                    tmp2,
                    "--num-days",
                    "3",
                    "--num-tasks",
                    "60",
                    "--reference",
                    str(REFERENCE_DIR),
                ]
            )

            for filename in (
                "operations.csv",
                "tasks.csv",
                "operations.jsonl",
                "tasks.jsonl",
                "splits.json",
            ):
                f1 = Path(tmp1) / filename
                f2 = Path(tmp2) / filename
                assert f1.read_bytes() == f2.read_bytes(), f"{filename} differs between runs"

            # In manifest.json, compare all fields excluding wall-clock generated_at
            m1 = json.loads((Path(tmp1) / "manifest.json").read_text())
            m2 = json.loads((Path(tmp2) / "manifest.json").read_text())
            gen_at1 = m1.pop("generated_at")
            gen_at2 = m2.pop("generated_at")
            assert m1 == m2, "Manifest parameters, hashes, or row counts differ between runs"
            assert gen_at1.endswith("Z") and "T" in gen_at1
            assert gen_at2.endswith("Z") and "T" in gen_at2


# ---------------------------------------------------------------------------
# Schema compliance tests
# ---------------------------------------------------------------------------


class TestSchemaCompliance:
    """Generated records must conform to shared JSON schemas."""

    @pytest.fixture
    def operation_schema(self) -> dict:
        with open(SCHEMA_DIR / "historical-operation.schema.json") as f:
            return json.load(f)

    @pytest.fixture
    def task_schema(self) -> dict:
        with open(SCHEMA_DIR / "historical-task.schema.json") as f:
            return json.load(f)

    def test_operations_have_required_fields(self, small_operations: list[dict]) -> None:
        required = {
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
        }
        synthetic_required = {
            "generator_version",
            "generation_seed",
            "interval_minutes",
            "timezone",
            "machine_model",
        }

        for i, r in enumerate(small_operations):
            for field in required | synthetic_required:
                assert field in r, f"operations[{i}] missing required field '{field}'"

    def test_tasks_have_required_fields(self, small_tasks: list[dict]) -> None:
        required = {
            "task_id",
            "task_type",
            "weather",
            "operator_skill",
            "machine_age_years",
            "estimated_minutes",
            "actual_minutes",
            "provenance",
        }
        synthetic_required = {"generator_version", "generation_seed"}

        for i, r in enumerate(small_tasks):
            for field in required | synthetic_required:
                assert field in r, f"tasks[{i}] missing required field '{field}'"

    def test_operations_field_values(self, small_operations: list[dict]) -> None:
        for r in small_operations:
            assert r["provenance"] == "synthetic"
            assert r["seatbelt_status"] in ("Fastened", "Unfastened")
            assert r["safety_alert_triggered"] in ("Yes", "No")
            assert r["machine_model"] == "CAT 325"
            assert r["generator_version"] == GENERATOR_VERSION
            assert isinstance(r["load_cycles"], int)
            assert isinstance(r["generation_seed"], int)

    def test_tasks_field_values(self, small_tasks: list[dict]) -> None:
        valid_types = {"Earth Excavation", "Trenching", "Material Loading", "Grading", "Demolition"}
        valid_weather = {"Sunny", "Rainy", "Cloudy", "Windy"}
        valid_skills = {"Beginner", "Intermediate", "Expert"}

        for i, r in enumerate(small_tasks):
            assert r["provenance"] == "synthetic"
            assert r["task_type"] in valid_types, f"tasks[{i}]: invalid task_type {r['task_type']}"
            assert r["weather"] in valid_weather, f"tasks[{i}]: invalid weather {r['weather']}"
            assert r["operator_skill"] in valid_skills
            assert r["generator_version"] == GENERATOR_VERSION

    def test_operations_no_extra_fields(self, small_operations: list[dict]) -> None:
        """Operations must not contain fields not in the schema."""
        allowed = set(OPERATIONS_CSV_COLUMNS)
        for i, r in enumerate(small_operations):
            extra = set(r.keys()) - allowed
            assert not extra, f"operations[{i}] has extra fields: {extra}"

    def test_tasks_no_extra_fields(self, small_tasks: list[dict]) -> None:
        allowed = set(TASKS_CSV_COLUMNS)
        for i, r in enumerate(small_tasks):
            extra = set(r.keys()) - allowed
            assert not extra, f"tasks[{i}] has extra fields: {extra}"

    def test_invalid_datetime_rejected(self, task_schema: dict) -> None:
        """JSON Schema format validation must reject invalid date-time strings."""
        validator = _create_validator(task_schema, SCHEMA_DIR)
        invalid_task = {
            "task_id": "T9999",
            "task_type": "Earth Excavation",
            "weather": "Sunny",
            "operator_skill": "Expert",
            "machine_age_years": 2.0,
            "estimated_minutes": 60,
            "actual_minutes": 55,
            "provenance": "synthetic",
            "generator_version": GENERATOR_VERSION,
            "generation_seed": 42,
            "started_at": "not-a-datetime",
        }
        errors = list(validator.iter_errors(invalid_task))
        assert any("date-time" in err.message for err in errors), (
            f"Expected date-time format error, got: {[e.message for e in errors]}"
        )

    def test_valid_datetime_accepted(self, small_tasks: list[dict], task_schema: dict) -> None:
        """Valid date-time strings must pass format validation."""
        validator = _create_validator(task_schema, SCHEMA_DIR)
        for r in small_tasks:
            errors = list(validator.iter_errors(r))
            assert not errors, f"Unexpected validation errors: {[e.message for e in errors]}"


# ---------------------------------------------------------------------------
# Semantic constraint tests
# ---------------------------------------------------------------------------


class TestSemanticConstraints:
    """Business logic and physical constraints."""

    def test_engine_hours_monotonic_per_machine(self, small_operations: list[dict]) -> None:
        """Engine hours must increase monotonically per machine."""
        by_machine: dict[str, list[dict]] = {}
        for r in small_operations:
            by_machine.setdefault(r["machine_id"], []).append(r)

        for mid, records in by_machine.items():
            sorted_recs = sorted(records, key=lambda r: r["timestamp"])
            for i in range(1, len(sorted_recs)):
                assert sorted_recs[i]["engine_hours"] >= sorted_recs[i - 1]["engine_hours"], (
                    f"Engine hours not monotonic for {mid} at index {i}"
                )

    def test_idling_time_within_interval(self, small_operations: list[dict]) -> None:
        for r in small_operations:
            assert r["idling_time_min"] <= r["interval_minutes"] + 0.01, (
                f"idling_time_min ({r['idling_time_min']}) > interval ({r['interval_minutes']})"
            )

    def test_fuel_nonnegative(self, small_operations: list[dict]) -> None:
        for r in small_operations:
            assert r["fuel_used_l"] >= 0, f"Negative fuel: {r['fuel_used_l']}"

    def test_load_cycles_nonneg_integer(self, small_operations: list[dict]) -> None:
        for r in small_operations:
            assert isinstance(r["load_cycles"], int)
            assert r["load_cycles"] >= 0

    def test_no_duplicate_timestamps_per_machine(self, small_operations: list[dict]) -> None:
        by_machine: dict[str, list[str]] = {}
        for r in small_operations:
            by_machine.setdefault(r["machine_id"], []).append(r["timestamp"])

        for mid, timestamps in by_machine.items():
            assert len(timestamps) == len(set(timestamps)), (
                f"Duplicate timestamps for machine {mid}"
            )

    def test_task_times_positive(self, small_tasks: list[dict]) -> None:
        for r in small_tasks:
            assert r["estimated_minutes"] > 0
            assert r["actual_minutes"] > 0

    def test_unique_task_ids(self, small_tasks: list[dict]) -> None:
        ids = [r["task_id"] for r in small_tasks]
        assert len(ids) == len(set(ids)), "Duplicate task IDs found"

    def test_temperature_in_range(self, small_operations: list[dict]) -> None:
        for r in small_operations:
            assert -60 <= r["air_temperature_c"] <= 70

    def test_soil_moisture_in_range(self, small_operations: list[dict]) -> None:
        for r in small_operations:
            assert 0 <= r["soil_moisture_percent_vwc"] <= 100

    def test_seatbelt_alert_not_deterministic(self, operations: list[dict]) -> None:
        """
        Seatbelt unfastened should NOT deterministically map to alert=Yes.
        There must be counterexamples (unfastened+no-alert and fastened+alert).
        """
        unfastened_no_alert = sum(
            1
            for r in operations
            if r["seatbelt_status"] == "Unfastened" and r["safety_alert_triggered"] == "No"
        )
        fastened_with_alert = sum(
            1
            for r in operations
            if r["seatbelt_status"] == "Fastened" and r["safety_alert_triggered"] == "Yes"
        )
        assert unfastened_no_alert > 0, "Expected some unfastened-without-alert counterexamples"
        assert fastened_with_alert > 0, "Expected some fastened-with-alert counterexamples"


# ---------------------------------------------------------------------------
# Category coverage tests
# ---------------------------------------------------------------------------


class TestCategoryCoverage:
    """Generated data must cover all required categories."""

    def test_all_task_types_present(self, small_tasks: list[dict]) -> None:
        types = {r["task_type"] for r in small_tasks}
        expected = {"Earth Excavation", "Trenching", "Material Loading", "Grading", "Demolition"}
        assert types == expected

    def test_all_skills_present(self, small_tasks: list[dict]) -> None:
        skills = {r["operator_skill"] for r in small_tasks}
        expected = {"Beginner", "Intermediate", "Expert"}
        assert skills == expected

    def test_all_weather_present(self, small_tasks: list[dict]) -> None:
        weather = {r["weather"] for r in small_tasks}
        expected = {"Sunny", "Rainy", "Cloudy", "Windy"}
        assert weather == expected

    def test_all_soil_types_present(self, small_operations: list[dict]) -> None:
        soils = {r["soil_type"] for r in small_operations}
        expected = {"Sand", "Loam", "Clay", "Gravel"}
        assert soils >= expected

    def test_both_seatbelt_states_present(self, operations: list[dict]) -> None:
        states = {r["seatbelt_status"] for r in operations}
        assert states == {"Fastened", "Unfastened"}

    def test_both_alert_states_present(self, operations: list[dict]) -> None:
        states = {r["safety_alert_triggered"] for r in operations}
        assert states == {"Yes", "No"}


# ---------------------------------------------------------------------------
# Reference preservation tests
# ---------------------------------------------------------------------------


class TestReferencePreservation:
    """Reference CSVs must never be modified."""

    def test_reference_operations_sha256(self) -> None:
        ops_file = REFERENCE_DIR / "operations.csv"
        assert ops_file.exists(), f"Reference file missing: {ops_file}"

        with open(REFERENCE_DIR / "provenance.json") as f:
            prov = json.load(f)

        expected = next(f["sha256"] for f in prov["files"] if f["filename"] == "operations.csv")
        actual = hashlib.sha256(ops_file.read_bytes()).hexdigest()
        assert actual == expected, "Reference operations.csv has been modified!"

    def test_reference_tasks_sha256(self) -> None:
        tasks_file = REFERENCE_DIR / "tasks.csv"
        assert tasks_file.exists(), f"Reference file missing: {tasks_file}"

        with open(REFERENCE_DIR / "provenance.json") as f:
            prov = json.load(f)

        expected = next(f["sha256"] for f in prov["files"] if f["filename"] == "tasks.csv")
        actual = hashlib.sha256(tasks_file.read_bytes()).hexdigest()
        assert actual == expected, "Reference tasks.csv has been modified!"


# ---------------------------------------------------------------------------
# Split integrity and chronology tests
# ---------------------------------------------------------------------------


class TestSplitIntegrity:
    """Train/validation/test splits must not leak across groups and be chronological."""

    def test_splits_sum_to_total(
        self, small_operations: list[dict], small_cfg: GenerationConfig
    ) -> None:
        splits = assign_splits(small_operations, small_cfg, "operations")
        total = sum(len(v) for v in splits.values())
        assert total == len(small_operations)

    def test_splits_are_contiguous(
        self, small_operations: list[dict], small_cfg: GenerationConfig
    ) -> None:
        """Splits should be contiguous blocks, not random scatter."""
        splits = assign_splits(small_operations, small_cfg, "operations")
        reconstructed = splits["train"] + splits["validation"] + splits["test"]
        assert len(reconstructed) == len(small_operations)

    def test_splits_no_overlap(self, small_tasks: list[dict], small_cfg: GenerationConfig) -> None:
        splits = assign_splits(small_tasks, small_cfg, "tasks")
        train_ids = {r["task_id"] for r in splits["train"]}
        val_ids = {r["task_id"] for r in splits["validation"]}
        test_ids = {r["task_id"] for r in splits["test"]}

        assert not train_ids & val_ids, "Train/val overlap"
        assert not train_ids & test_ids, "Train/test overlap"
        assert not val_ids & test_ids, "Val/test overlap"

    def test_all_splits_nonempty(
        self, small_tasks: list[dict], small_cfg: GenerationConfig
    ) -> None:
        splits = assign_splits(small_tasks, small_cfg, "tasks")
        for name, records in splits.items():
            assert len(records) > 0, f"Split '{name}' is empty"

    def test_operations_session_groups_no_leak(
        self, operations: list[dict], cfg: GenerationConfig
    ) -> None:
        """A logical machine run/session (machine_id, date) must appear in exactly one split."""
        splits = assign_splits(operations, cfg, "operations")
        train_groups = {(r["machine_id"], r["timestamp"][:10]) for r in splits["train"]}
        val_groups = {(r["machine_id"], r["timestamp"][:10]) for r in splits["validation"]}
        test_groups = {(r["machine_id"], r["timestamp"][:10]) for r in splits["test"]}

        assert not train_groups & val_groups, "Machine run leaked between train and validation"
        assert not train_groups & test_groups, "Machine run leaked between train and test"
        assert not val_groups & test_groups, "Machine run leaked between validation and test"

    def test_tasks_date_groups_no_leak(self, tasks: list[dict], cfg: GenerationConfig) -> None:
        """A task date group must appear in exactly one split."""
        splits = assign_splits(tasks, cfg, "tasks")
        train_dates = {r["started_at"][:10] for r in splits["train"]}
        val_dates = {r["started_at"][:10] for r in splits["validation"]}
        test_dates = {r["started_at"][:10] for r in splits["test"]}

        assert not train_dates & val_dates, "Task date leaked between train and validation"
        assert not train_dates & test_dates, "Task date leaked between train and test"
        assert not val_dates & test_dates, "Task date leaked between validation and test"

    def test_operations_splits_strictly_chronological(
        self, operations: list[dict], cfg: GenerationConfig
    ) -> None:
        """Splits must be ordered chronologically."""
        splits = assign_splits(operations, cfg, "operations")
        max_train = max(r["timestamp"] for r in splits["train"])
        min_val = min(r["timestamp"] for r in splits["validation"])
        max_val = max(r["timestamp"] for r in splits["validation"])
        min_test = min(r["timestamp"] for r in splits["test"])

        assert max_train <= min_val, f"Train ({max_train}) after validation ({min_val})"
        assert max_val <= min_test, f"Validation ({max_val}) after test ({min_test})"

    def test_tasks_splits_strictly_chronological(
        self, tasks: list[dict], cfg: GenerationConfig
    ) -> None:
        """Tasks splits must be ordered chronologically by started_at."""
        splits = assign_splits(tasks, cfg, "tasks")
        max_train = max(r["started_at"] for r in splits["train"])
        min_val = min(r["started_at"] for r in splits["validation"])
        max_val = max(r["started_at"] for r in splits["validation"])
        min_test = min(r["started_at"] for r in splits["test"])

        assert max_train <= min_val, f"Train ({max_train}) after validation ({min_val})"
        assert max_val <= min_test, f"Validation ({max_val}) after test ({min_test})"


# ---------------------------------------------------------------------------
# Task count allocation tests
# ---------------------------------------------------------------------------


class TestTaskCountAllocation:
    """Test task count allocation and combination coverage."""

    def test_undersized_count_rejected(self) -> None:
        """num_tasks smaller than combo count (60) must raise ValueError."""
        rng = np.random.RandomState(42)
        cfg10 = GenerationConfig(num_tasks=10)
        with pytest.raises(ValueError, match="smaller than minimum required combinations"):
            generate_tasks(cfg10, rng)

        cfg59 = GenerationConfig(num_tasks=59)
        with pytest.raises(ValueError, match="smaller than minimum required combinations"):
            generate_tasks(cfg59, rng)

    def test_exact_minimum_count(self) -> None:
        """num_tasks=60 must generate exactly 60 tasks with all combinations covered."""
        rng = np.random.RandomState(42)
        cfg60 = GenerationConfig(num_tasks=60)
        tasks = generate_tasks(cfg60, rng)
        assert len(tasks) == 60
        combos = {(r["task_type"], r["operator_skill"], r["weather"]) for r in tasks}
        assert len(combos) == 60

    def test_exact_minimum_plus_one(self) -> None:
        """num_tasks=61 must generate exactly 61 tasks."""
        rng = np.random.RandomState(42)
        cfg61 = GenerationConfig(num_tasks=61)
        tasks = generate_tasks(cfg61, rng)
        assert len(tasks) == 61

    def test_larger_count(self) -> None:
        """num_tasks=120 must generate exactly 120 tasks."""
        rng = np.random.RandomState(42)
        cfg120 = GenerationConfig(num_tasks=120)
        tasks = generate_tasks(cfg120, rng)
        assert len(tasks) == 120


# ---------------------------------------------------------------------------
# Validation failure tests
# ---------------------------------------------------------------------------


class TestValidationFailures:
    """Test that validation fails closed on missing dependencies, missing artifacts, and invalid ranges."""

    def test_missing_jsonschema_fails_closed(self) -> None:
        """When jsonschema is missing, validate_schema must record an error, not warn."""
        import validate_dataset

        orig = validate_dataset.jsonschema
        try:
            validate_dataset.jsonschema = None
            report = ValidationReport()
            validate_schema([], {}, SCHEMA_DIR, "operations", report)
            assert not report.ok()
            assert any("jsonschema is required" in e for e in report.errors)
        finally:
            validate_dataset.jsonschema = orig

    def test_missing_required_artifacts_fails_validation(self) -> None:
        """An empty or incomplete directory must fail validation."""
        with tempfile.TemporaryDirectory() as empty_dir:
            report = ValidationReport()
            validate_splits(Path(empty_dir), report)
            assert not report.ok()
            assert any("splits.json" in e for e in report.errors)

    def test_validate_splits_valid_ranges_pass(self) -> None:
        """Valid contiguous ranges covering total rows must pass."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            ops_file = tmp_path / "operations.csv"
            tasks_file = tmp_path / "tasks.csv"
            ops_file.write_text("timestamp\n" + "2025-05-01 08:00:00\n" * 100)
            tasks_file.write_text("task_id\n" + "T001\n" * 50)

            splits = {
                "operations": {
                    "train": {"start_row": 0, "end_row": 70},
                    "validation": {"start_row": 70, "end_row": 85},
                    "test": {"start_row": 85, "end_row": 100},
                },
                "tasks": {
                    "train": {"start_row": 0, "end_row": 35},
                    "validation": {"start_row": 35, "end_row": 42},
                    "test": {"start_row": 42, "end_row": 50},
                },
            }
            (tmp_path / "splits.json").write_text(json.dumps(splits))

            report = ValidationReport()
            validate_splits(tmp_path, report)
            assert report.ok()

    def test_validate_splits_overlapping_ranges_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "operations.csv").write_text("timestamp\n" + "2025-05-01 08:00:00\n" * 100)
            (tmp_path / "tasks.csv").write_text("task_id\n" + "T001\n" * 50)
            splits = {
                "operations": {
                    "train": {"start_row": 0, "end_row": 75},
                    "validation": {"start_row": 70, "end_row": 85},  # overlaps with train
                    "test": {"start_row": 85, "end_row": 100},
                },
                "tasks": {
                    "train": {"start_row": 0, "end_row": 35},
                    "validation": {"start_row": 35, "end_row": 42},
                    "test": {"start_row": 42, "end_row": 50},
                },
            }
            (tmp_path / "splits.json").write_text(json.dumps(splits))
            report = ValidationReport()
            validate_splits(tmp_path, report)
            assert not report.ok()
            assert any("validation start_row" in e for e in report.errors)

    def test_validate_splits_gaps_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "operations.csv").write_text("timestamp\n" + "2025-05-01 08:00:00\n" * 100)
            (tmp_path / "tasks.csv").write_text("task_id\n" + "T001\n" * 50)
            splits = {
                "operations": {
                    "train": {"start_row": 0, "end_row": 65},
                    "validation": {"start_row": 70, "end_row": 85},  # gap 65..70
                    "test": {"start_row": 85, "end_row": 100},
                },
                "tasks": {
                    "train": {"start_row": 0, "end_row": 35},
                    "validation": {"start_row": 35, "end_row": 42},
                    "test": {"start_row": 42, "end_row": 50},
                },
            }
            (tmp_path / "splits.json").write_text(json.dumps(splits))
            report = ValidationReport()
            validate_splits(tmp_path, report)
            assert not report.ok()
            assert any("validation start_row" in e for e in report.errors)

    def test_validate_splits_out_of_bounds_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "operations.csv").write_text("timestamp\n" + "2025-05-01 08:00:00\n" * 100)
            (tmp_path / "tasks.csv").write_text("task_id\n" + "T001\n" * 50)
            splits = {
                "operations": {
                    "train": {"start_row": -5, "end_row": 70},  # negative
                    "validation": {"start_row": 70, "end_row": 85},
                    "test": {"start_row": 85, "end_row": 150},  # > 100
                },
                "tasks": {
                    "train": {"start_row": 0, "end_row": 35},
                    "validation": {"start_row": 35, "end_row": 42},
                    "test": {"start_row": 42, "end_row": 50},
                },
            }
            (tmp_path / "splits.json").write_text(json.dumps(splits))
            report = ValidationReport()
            validate_splits(tmp_path, report)
            assert not report.ok()
            assert any("out of bounds" in e for e in report.errors)

    def test_validate_splits_end_mismatch_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "operations.csv").write_text("timestamp\n" + "2025-05-01 08:00:00\n" * 100)
            (tmp_path / "tasks.csv").write_text("task_id\n" + "T001\n" * 50)
            splits = {
                "operations": {
                    "train": {"start_row": 0, "end_row": 70},
                    "validation": {"start_row": 70, "end_row": 85},
                    "test": {"start_row": 85, "end_row": 90},  # 90 != 100
                },
                "tasks": {
                    "train": {"start_row": 0, "end_row": 35},
                    "validation": {"start_row": 35, "end_row": 42},
                    "test": {"start_row": 42, "end_row": 50},
                },
            }
            (tmp_path / "splits.json").write_text(json.dumps(splits))
            report = ValidationReport()
            validate_splits(tmp_path, report)
            assert not report.ok()
            assert any("test end_row" in e for e in report.errors)


# ---------------------------------------------------------------------------
# Config validation tests
# ---------------------------------------------------------------------------


class TestConfig:
    """Generation config must be self-consistent."""

    def test_split_fractions_sum_to_one(self, cfg: GenerationConfig) -> None:
        total = cfg.train_fraction + cfg.validation_fraction + cfg.test_fraction
        assert abs(total - 1.0) < 1e-9

    def test_invalid_fractions_raise(self) -> None:
        with pytest.raises(ValueError, match="sum to 1.0"):
            GenerationConfig(train_fraction=0.5, validation_fraction=0.5, test_fraction=0.5)

    def test_version_set(self, cfg: GenerationConfig) -> None:
        assert cfg.generator_version == GENERATOR_VERSION
        assert len(cfg.generator_version) > 0
