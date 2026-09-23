"""
Tests for DATA-001 synthetic dataset generation.

Verifies determinism, schema compliance, semantic constraints,
reference preservation, and split integrity.
"""

from __future__ import annotations

import hashlib
import json

# Add parent to path for imports
import sys
import tempfile
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

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
    """Smaller config for fast tests."""
    return GenerationConfig(seed=42, ops_num_days=5, num_tasks=30)


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
    # Need a fresh RNG after operations to get deterministic task output
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
        for r1, r2 in zip(ops1, ops2):
            assert r1 == r2, f"Mismatch: {r1} != {r2}"

    def test_tasks_deterministic(self, cfg: GenerationConfig) -> None:
        rng1 = np.random.RandomState(cfg.seed)
        _ = generate_operations(cfg, rng1)
        tasks1 = generate_tasks(cfg, rng1)

        rng2 = np.random.RandomState(cfg.seed)
        _ = generate_operations(cfg, rng2)
        tasks2 = generate_tasks(cfg, rng2)

        assert len(tasks1) == len(tasks2)
        for r1, r2 in zip(tasks1, tasks2):
            assert r1 == r2

    def test_different_seed_produces_different_output(self) -> None:
        cfg1 = GenerationConfig(seed=42, ops_num_days=3, num_tasks=10)
        cfg2 = GenerationConfig(seed=99, ops_num_days=3, num_tasks=10)

        rng1 = np.random.RandomState(cfg1.seed)
        ops1 = generate_operations(cfg1, rng1)

        rng2 = np.random.RandomState(cfg2.seed)
        ops2 = generate_operations(cfg2, rng2)

        # At least some records should differ
        differences = sum(1 for r1, r2 in zip(ops1, ops2) if r1["fuel_used_l"] != r2["fuel_used_l"])
        assert differences > 0, "Different seeds should produce different data"

    def test_full_pipeline_determinism(self) -> None:
        """Run the full generator twice and compare output files byte-for-byte."""
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
                    "10",
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
                    "10",
                    "--reference",
                    str(REFERENCE_DIR),
                ]
            )

            for filename in ("operations.csv", "tasks.csv", "splits.json"):
                f1 = Path(tmp1) / filename
                f2 = Path(tmp2) / filename
                assert f1.read_bytes() == f2.read_bytes(), f"{filename} differs between runs"


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

    @pytest.fixture
    def common_schema(self) -> dict:
        with open(SCHEMA_DIR / "common.schema.json") as f:
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
        for i, r in enumerate(small_operations):
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
        assert soils >= expected  # superset OK (may include Unknown)

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
# Split integrity tests
# ---------------------------------------------------------------------------


class TestSplitIntegrity:
    """Train/validation/test splits must not leak across groups."""

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
        # Reconstruct and verify order
        reconstructed = splits["train"] + splits["validation"] + splits["test"]
        assert reconstructed == small_operations

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
