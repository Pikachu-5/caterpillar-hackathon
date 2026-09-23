"""Tests for ML-001 model training and adapter behaviors."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from generate_dataset import main as generate_main
from models import (
    ETA_EXCLUDED_FEATURES,
    ETA_FEATURES,
    MODEL_VERSION,
    ETAUsageModels,
    train_and_evaluate,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMA_DIR = REPO_ROOT / "shared" / "schemas"


@pytest.fixture(scope="module")
def generated_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    generated = tmp_path_factory.mktemp("generated")
    generate_main(
        [
            "--seed",
            "42",
            "--output",
            str(generated),
            "--num-days",
            "5",
            "--num-tasks",
            "60",
            "--reference",
            str(REPO_ROOT / "data" / "reference"),
        ]
    )
    return generated


@pytest.fixture(scope="module")
def artifacts_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return tmp_path_factory.mktemp("artifacts")


@pytest.fixture(scope="module")
def training_report(generated_dir: Path, artifacts_dir: Path) -> dict[str, Any]:
    return train_and_evaluate(generated_dir, artifacts_dir)


def test_train_and_evaluate_rejects_noncontiguous_splits(generated_dir: Path, tmp_path: Path) -> None:
    tampered = tmp_path / "tampered"
    tampered.mkdir()
    for filename in ("tasks.csv", "operations.csv", "manifest.json", "splits.json"):
        (tampered / filename).write_bytes((generated_dir / filename).read_bytes())

    splits_path = tampered / "splits.json"
    splits = json.loads(splits_path.read_text())
    splits["tasks"]["validation"]["start_row"] += 1
    splits_path.write_text(json.dumps(splits, indent=2) + "\n")

    with pytest.raises(ValueError, match="tasks/validation"):
        train_and_evaluate(tampered, tmp_path / "artifacts")


def test_training_report_keeps_target_excluded_and_records_interval(training_report: dict[str, Any]) -> None:
    model_info = training_report["model"]
    assert model_info["features"] == list(ETA_FEATURES)
    assert model_info["excluded_features"] == list(ETA_EXCLUDED_FEATURES)
    assert "actual_minutes" not in model_info["features"]
    assert "estimated_minutes" not in model_info["features"]

    interval = training_report["regression"]["interval"]
    assert interval["method"] == "absolute residual quantile calibrated on validation split"
    assert interval["nominal_coverage"] == pytest.approx(0.90)
    assert interval["radius_minutes"] >= 0
    assert 0 <= interval["test_empirical_coverage"] <= 1


def test_model_load_rejects_hash_and_version_mismatch(artifacts_dir: Path, tmp_path: Path) -> None:
    metadata_path = artifacts_dir / "metadata.json"
    original_metadata = json.loads(metadata_path.read_text())

    bad_hash_dir = tmp_path / "bad-hash"
    bad_hash_dir.mkdir()
    (bad_hash_dir / "eta_model.joblib").write_bytes((artifacts_dir / "eta_model.joblib").read_bytes())
    bad_hash_metadata = copy.deepcopy(original_metadata)
    bad_hash_metadata["model"]["sha256"] = "0" * 64
    (bad_hash_dir / "metadata.json").write_text(json.dumps(bad_hash_metadata))
    with pytest.raises(ValueError, match="hash"):
        ETAUsageModels.load(bad_hash_dir)

    bad_version_dir = tmp_path / "bad-version"
    bad_version_dir.mkdir()
    (bad_version_dir / "eta_model.joblib").write_bytes((artifacts_dir / "eta_model.joblib").read_bytes())
    bad_version_metadata = copy.deepcopy(original_metadata)
    bad_version_metadata["model_version"] = "ml-001-v0"
    (bad_version_dir / "metadata.json").write_text(json.dumps(bad_version_metadata))
    with pytest.raises(ValueError, match="Unsupported model version"):
        ETAUsageModels.load(bad_version_dir)


def test_prediction_and_usage_outputs_follow_contract_shape(
    generated_dir: Path,
    artifacts_dir: Path,
) -> None:
    prediction_schema = json.loads((SCHEMA_DIR / "prediction.schema.json").read_text())
    insight_schema = json.loads((SCHEMA_DIR / "insight.schema.json").read_text())
    prediction_required = set(prediction_schema["required"])
    insight_required = set(insight_schema["required"])

    model = ETAUsageModels.load(artifacts_dir)
    tasks = json.loads((generated_dir / "tasks.jsonl").read_text().splitlines()[0])
    prediction = model.predict_eta(tasks, elapsed_minutes=10.0)
    assert set(prediction) == prediction_required
    assert prediction["model_version"] == MODEL_VERSION
    assert prediction["method"] == "regression"

    strict_metadata = copy.deepcopy(model.metadata)
    strict_metadata["usage_baseline"]["features"] = {
        "idle_fraction": {"median": 0.2, "scale": 1.0, "threshold_p95": 0.95},
        "cycles_per_active_hour": {"median": 10.0, "scale": 2.0, "threshold_p95": 100.0},
        "fuel_per_active_hour": {"median": 20.0, "scale": 2.0, "threshold_p95": 100.0},
    }
    strict_model = ETAUsageModels(model=model.model, metadata=strict_metadata)
    operation = {
        "timestamp": "2024-01-10 10:00:00",
        "timezone": "UTC",
        "interval_minutes": 60,
        "idling_time_min": 0,
        "load_cycles": 60,
        "fuel_used_l": 60,
    }
    assert strict_model.detect_unusual_usage(
        operation, operator_id="op-1", session_id="session-1", z_threshold=30.0
    ) == []

    insights = strict_model.detect_unusual_usage(
        operation, operator_id="op-1", session_id="session-1", z_threshold=3.0
    )
    assert len(insights) == 1
    insight = insights[0]
    assert set(insight) == insight_required
    assert insight["severity"] == "warning"
