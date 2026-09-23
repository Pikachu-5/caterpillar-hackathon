"""ML-001 callable ETA and unusual-usage adapters.

Models are trained only on the generated synthetic dataset. Outputs are useful
for demo behavior and carry their synthetic basis in the shared contracts.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

MODEL_VERSION = "ml-001-v1"
ETA_CATEGORICAL_FEATURES = ("task_type", "weather", "operator_skill", "soil_type")
ETA_NUMERIC_FEATURES = (
    "machine_age_years",
    "air_temperature_c",
    "soil_moisture_percent_vwc",
)
ETA_FEATURES = (*ETA_CATEGORICAL_FEATURES, *ETA_NUMERIC_FEATURES)
ETA_EXCLUDED_FEATURES = (
    "actual_minutes",
    "estimated_minutes",
    "task_id",
    "operator_id",
    "machine_id",
    "started_at",
)
USAGE_FEATURES = ("idle_fraction", "cycles_per_active_hour", "fuel_per_active_hour")


def _eta_features(rows: pd.DataFrame) -> pd.DataFrame:
    """Select known-at-prediction-time fields; never expose either duration column."""
    return rows.reindex(columns=ETA_FEATURES)


def _median_baselines(train: pd.DataFrame) -> tuple[float, dict[str, float]]:
    global_median = float(train["actual_minutes"].median())
    medians = {
        str(task_type): float(group["actual_minutes"].median())
        for task_type, group in train.groupby("task_type", sort=True)
    }
    return global_median, medians


def _usage_features(rows: pd.DataFrame) -> pd.DataFrame:
    intervals = rows["interval_minutes"].astype(float).clip(lower=1e-6)
    idle = rows["idling_time_min"].astype(float).clip(lower=0)
    active_minutes = (intervals - idle).clip(lower=1.0)
    return pd.DataFrame(
        {
            "idle_fraction": (idle / intervals).clip(0, 1),
            "cycles_per_active_hour": rows["load_cycles"].astype(float) * 60 / active_minutes,
            "fuel_per_active_hour": rows["fuel_used_l"].astype(float) * 60 / active_minutes,
        },
        index=rows.index,
    )


def _robust_statistics(features: pd.DataFrame) -> dict[str, dict[str, float]]:
    statistics: dict[str, dict[str, float]] = {}
    for feature in USAGE_FEATURES:
        values = features[feature].astype(float)
        median = float(values.median())
        mad = float((values - median).abs().median())
        scale = 1.4826 * mad
        # A non-zero floor handles quantized/small synthetic samples without
        # turning every difference from a zero MAD into an outlier.
        floor = max(abs(median) * 0.05, 0.05)
        statistics[feature] = {
            "median": median,
            "scale": max(scale, floor),
            "threshold_p95": float(values.quantile(0.95)),
        }
    return statistics


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {"mae_minutes": float(np.mean(np.abs(y_true - y_pred)))}


def _per_category_mae(
    rows: pd.DataFrame, predictions: np.ndarray
) -> dict[str, dict[str, float | int]]:
    errors = np.abs(rows["actual_minutes"].to_numpy(dtype=float) - predictions)
    result: dict[str, dict[str, float | int]] = {}
    for task_type in sorted(rows["task_type"].unique()):
        mask = rows["task_type"].to_numpy() == task_type
        result[str(task_type)] = {
            "count": int(mask.sum()),
            "mae_minutes": float(errors[mask].mean()),
        }
    return result


def _validated_split_block(
    *,
    table_name: str,
    split_name: str,
    table_rows: int,
    splits: dict[str, Any],
) -> tuple[int, int]:
    table_splits = splits.get(table_name)
    if not isinstance(table_splits, dict):
        raise TypeError(f"splits.json missing '{table_name}' split definitions")
    required = ("train", "validation", "test")
    missing = [name for name in required if name not in table_splits]
    if missing:
        raise ValueError(f"splits.json missing {table_name} split names: {missing}")

    bounds: dict[str, tuple[int, int]] = {}
    for name in required:
        split = table_splits[name]
        if not isinstance(split, dict):
            raise TypeError(f"splits.json {table_name}/{name} must be an object")
        start_raw = split.get("start_row")
        end_raw = split.get("end_row")
        if not isinstance(start_raw, int) or not isinstance(end_raw, int):
            raise TypeError(f"splits.json {table_name}/{name} bounds must be integers")
        if not (0 <= start_raw <= end_raw <= table_rows):
            raise ValueError(
                f"splits.json {table_name}/{name} range [{start_raw}, {end_raw}] "
                f"out of bounds for {table_rows} rows"
            )
        bounds[name] = (start_raw, end_raw)

    train_start, train_end = bounds["train"]
    validation_start, validation_end = bounds["validation"]
    test_start, test_end = bounds["test"]
    if train_start != 0:
        raise ValueError(f"splits.json {table_name}/train must start at row 0")
    if validation_start != train_end:
        raise ValueError(f"splits.json {table_name}/validation must start at train end_row")
    if test_start != validation_end:
        raise ValueError(f"splits.json {table_name}/test must start at validation end_row")
    if test_end != table_rows:
        raise ValueError(f"splits.json {table_name}/test end_row must equal table row count")
    return bounds[split_name]


def train_and_evaluate(
    generated_dir: Path,
    artifact_dir: Path,
    *,
    interval_coverage: float = 0.90,
) -> dict[str, Any]:
    """Fit from the manifest's chronological train block and evaluate held-out blocks.

    Validation rows calibrate an absolute-residual interval. Test rows are used
    only for the final report and coverage check.
    """
    if not 0 < interval_coverage < 1:
        raise ValueError("interval_coverage must be between 0 and 1")
    generated_dir = Path(generated_dir)
    artifact_dir = Path(artifact_dir)
    manifest = json.loads((generated_dir / "manifest.json").read_text())
    splits = json.loads((generated_dir / "splits.json").read_text())
    tasks = pd.read_csv(generated_dir / "tasks.csv")
    operations = pd.read_csv(generated_dir / "operations.csv")
    for filename, table_name in (("tasks.csv", "tasks"), ("operations.csv", "operations")):
        actual_hash = hashlib.sha256((generated_dir / filename).read_bytes()).hexdigest()
        expected_hash = str(manifest["output"][table_name]["sha256"])
        if actual_hash != expected_hash:
            raise ValueError(f"{filename} SHA256 does not match generated manifest")

    def block(table: pd.DataFrame, table_name: str, name: str) -> pd.DataFrame:
        start_row, end_row = _validated_split_block(
            table_name=table_name,
            split_name=name,
            table_rows=len(table),
            splits=splits,
        )
        return table.iloc[start_row:end_row].reset_index(drop=True)

    train = block(tasks, "tasks", "train")
    validation = block(tasks, "tasks", "validation")
    test = block(tasks, "tasks", "test")
    operations_train = block(operations, "operations", "train")
    for name, frame in (("train", train), ("validation", validation), ("test", test)):
        if frame.empty:
            raise ValueError(f"The generated tasks {name} split is empty")
        if not (frame["provenance"] == "synthetic").all():
            raise ValueError("ETA fitting and evaluation accept synthetic records only")
    if operations_train.empty:
        raise ValueError("The generated operations train split is empty")
    if not (operations_train["provenance"] == "synthetic").all():
        raise ValueError("Usage baseline fitting accepts synthetic records only")

    global_median, task_medians = _median_baselines(train)
    baseline_validation = np.array(
        [task_medians.get(str(t), global_median) for t in validation["task_type"]], dtype=float
    )
    baseline_test = np.array(
        [task_medians.get(str(t), global_median) for t in test["task_type"]], dtype=float
    )

    preprocessor = ColumnTransformer(
        [
            ("categorical", OneHotEncoder(handle_unknown="ignore"), list(ETA_CATEGORICAL_FEATURES)),
            ("numeric", "passthrough", list(ETA_NUMERIC_FEATURES)),
        ],
        remainder="drop",
    )
    regressor = Pipeline(
        [
            ("features", preprocessor),
            (
                "regressor",
                RandomForestRegressor(
                    n_estimators=400,
                    min_samples_leaf=5,
                    max_features=0.9,
                    random_state=42,
                    n_jobs=1,
                ),
            ),
        ]
    )
    # estimated_minutes is explicitly absent from the feature selector. Only
    # training rows are used to fit encoders and the regressor.
    regressor.fit(_eta_features(train), train["actual_minutes"].astype(float))
    validation_predictions = np.maximum(regressor.predict(_eta_features(validation)), 0)
    test_predictions = np.maximum(regressor.predict(_eta_features(test)), 0)

    residuals = np.abs(validation["actual_minutes"].to_numpy(dtype=float) - validation_predictions)
    rank = min(int(np.ceil((len(residuals) + 1) * interval_coverage)), len(residuals))
    interval_radius = float(np.sort(residuals)[max(rank - 1, 0)])
    test_actual = test["actual_minutes"].to_numpy(dtype=float)
    test_coverage = float(np.mean(np.abs(test_actual - test_predictions) <= interval_radius))

    usage_training_features = _usage_features(operations_train)
    usage_statistics = _robust_statistics(usage_training_features)

    artifact_dir.mkdir(parents=True, exist_ok=True)
    model_path = artifact_dir / "eta_model.joblib"
    joblib.dump(regressor, model_path, compress=3)
    model_sha256 = hashlib.sha256(model_path.read_bytes()).hexdigest()
    dataset_hash = str(manifest["output"]["tasks"]["sha256"])
    operations_hash = str(manifest["output"]["operations"]["sha256"])

    report: dict[str, Any] = {
        "model_version": MODEL_VERSION,
        "dataset": {
            "generator_version": manifest["generator_version"],
            "task_sha256": dataset_hash,
            "operations_sha256": operations_hash,
        },
        "model": {
            "file": model_path.name,
            "sha256": model_sha256,
            "algorithm": "RandomForestRegressor",
            "features": list(ETA_FEATURES),
            "excluded_features": list(ETA_EXCLUDED_FEATURES),
            "parameters": {
                "n_estimators": 400,
                "min_samples_leaf": 5,
                "max_features": 0.9,
                "random_state": 42,
            },
        },
        "split_counts": {"train": len(train), "validation": len(validation), "test": len(test)},
        "baseline": {
            "global_median_minutes": global_median,
            "task_type_medians_minutes": task_medians,
            "validation": {
                "mae_minutes": _metrics(
                    validation["actual_minutes"].to_numpy(dtype=float), baseline_validation
                )["mae_minutes"],
                "per_task_type": _per_category_mae(validation, baseline_validation),
            },
            "test": {
                "mae_minutes": _metrics(test_actual, baseline_test)["mae_minutes"],
                "per_task_type": _per_category_mae(test, baseline_test),
            },
        },
        "regression": {
            "validation": {
                "mae_minutes": _metrics(
                    validation["actual_minutes"].to_numpy(dtype=float), validation_predictions
                )["mae_minutes"],
                "per_task_type": _per_category_mae(validation, validation_predictions),
            },
            "test": {
                "mae_minutes": _metrics(test_actual, test_predictions)["mae_minutes"],
                "per_task_type": _per_category_mae(test, test_predictions),
            },
            "interval": {
                "method": "absolute residual quantile calibrated on validation split",
                "nominal_coverage": interval_coverage,
                "radius_minutes": interval_radius,
                "test_empirical_coverage": test_coverage,
            },
        },
        "usage_baseline": {
            "method": "training p95 cutoff for bounded idle fraction; three robust standard deviations (1.4826 × MAD) for rates",
            "features": usage_statistics,
            "training_rows": len(operations_train),
        },
        "limitations": [
            "All fitting and evaluation records are generated synthetic examples.",
            "Metrics describe held-out synthetic blocks and do not establish real-world accuracy.",
            "Intervals are calibrated on synthetic validation residuals; test coverage is reported separately.",
            "Idle fraction and per-active-hour rates are demo aggregate features, not OEM limits.",
        ],
    }
    (artifact_dir / "metadata.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    return report


@dataclass
class ETAUsageModels:
    """Loaded ML-001 adapters returning shared Prediction and Insight payloads."""

    model: Pipeline
    metadata: dict[str, Any]

    @classmethod
    def load(cls, artifact_dir: Path) -> ETAUsageModels:
        artifact_dir = Path(artifact_dir)
        model_path = artifact_dir / "eta_model.joblib"
        metadata = json.loads((artifact_dir / "metadata.json").read_text())
        actual_hash = hashlib.sha256(model_path.read_bytes()).hexdigest()
        if actual_hash != metadata["model"]["sha256"]:
            raise ValueError("ETA model artifact hash does not match metadata")
        if metadata.get("model_version") != MODEL_VERSION:
            raise ValueError(f"Unsupported model version: {metadata.get('model_version')!r}")
        return cls(joblib.load(model_path), metadata)

    def predict_eta(
        self,
        task: dict[str, Any],
        *,
        elapsed_minutes: float = 0.0,
        computed_at: datetime | None = None,
        use_regression: bool = True,
    ) -> dict[str, Any]:
        """Predict total and remaining minutes using only a task's current inputs."""
        if elapsed_minutes < 0:
            raise ValueError("elapsed_minutes must be non-negative")
        task_type = str(task["task_type"])
        if use_regression:
            missing = [feature for feature in ETA_FEATURES if task.get(feature) is None]
            if missing:
                raise ValueError(
                    f"Regression ETA requires prediction-time features: {', '.join(missing)}"
                )
            frame = pd.DataFrame([{key: task.get(key) for key in ETA_FEATURES}])
            total = max(float(self.model.predict(frame)[0]), 0.0)
            method = "regression"
        else:
            medians = self.metadata["baseline"]["task_type_medians_minutes"]
            total = float(
                medians.get(task_type, self.metadata["baseline"]["global_median_minutes"])
            )
            method = "baseline"
        interval = self.metadata["regression"]["interval"] if method == "regression" else None
        radius = float(interval["radius_minutes"]) if interval else None
        lower = max(0.0, total - radius) if radius is not None else None
        upper = max(0.0, total + radius) if radius is not None else None
        timestamp = computed_at or datetime.now(UTC)
        if timestamp.tzinfo is None or timestamp.utcoffset() is None:
            raise ValueError("computed_at must be timezone-aware")
        result = {
            "task_id": str(task["task_id"]),
            "estimated_total_minutes": total,
            "remaining_minutes": max(0.0, total - elapsed_minutes),
            "interval_lower_minutes": lower,
            "interval_upper_minutes": upper,
            "interval_coverage": float(interval["nominal_coverage"]) if interval else None,
            "method": method,
            "model_version": MODEL_VERSION,
            "synthetic_basis": True,
            "explanation_factors": [
                "Model trained and evaluated on generated synthetic task examples.",
                "Historical estimated_minutes is excluded from the prediction features.",
            ],
            "computed_at": timestamp.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        }
        return result

    def detect_unusual_usage(
        self,
        operation: dict[str, Any],
        *,
        operator_id: str,
        session_id: str,
        observed_at: datetime | None = None,
        z_threshold: float = 3.0,
    ) -> list[dict[str, Any]]:
        """Return statistical inefficiency insights, never deterministic safety alerts."""
        if z_threshold <= 0:
            raise ValueError("z_threshold must be positive")
        if observed_at is None:
            # Synthetic historical operations have an explicit timezone. Source
            # sample timestamps do not, so those require an explicit runtime time.
            if not operation.get("timezone"):
                raise ValueError("observed_at is required when operation timezone is unknown")
            observed_at = datetime.strptime(
                str(operation["timestamp"]), "%Y-%m-%d %H:%M:%S"
            ).replace(tzinfo=ZoneInfo(str(operation["timezone"])))
        if observed_at.tzinfo is None or observed_at.utcoffset() is None:
            raise ValueError("observed_at must be timezone-aware")
        interval_minutes = float(operation["interval_minutes"])
        features = _usage_features(pd.DataFrame([operation])).iloc[0]
        evidence: list[dict[str, Any]] = []
        for feature in USAGE_FEATURES:
            baseline = self.metadata["usage_baseline"]["features"][feature]
            observed = float(features[feature])
            z_score = (observed - float(baseline["median"])) / float(baseline["scale"])
            # Idle fraction is bounded at 1.0 and its generated distribution is
            # deliberately broad; use its empirical upper tail so the baseline
            # can identify unusually idle windows. Rate features use the robust
            # z threshold, which is less sensitive to ties/rounding.
            is_outlier = (
                observed > float(baseline["threshold_p95"])
                if feature == "idle_fraction"
                else z_score >= z_threshold
            )
            if is_outlier:
                units = {
                    "idle_fraction": "fraction of interval",
                    "cycles_per_active_hour": "cycles per active hour (estimated)",
                    "fuel_per_active_hour": "liters per active hour (estimated)",
                }[feature]
                evidence.append(
                    {
                        "metric": (
                            f"{feature} (above training p95; robust z={z_score:.1f})"
                            if feature == "idle_fraction"
                            else f"{feature} (robust z={z_score:.1f})"
                        ),
                        "observed_value": observed,
                        "baseline_value": float(baseline["median"]),
                        "unit": units,
                    }
                )
        if not evidence:
            return []
        idle_flag = any(item["metric"].startswith("idle_fraction") for item in evidence)
        kind = "excessive_idling" if idle_flag else "unusual_usage"
        z_scores = [float(item["metric"].rsplit("=", 1)[1][:-1]) for item in evidence]
        severity = "warning" if max(z_scores) >= 4.0 else "info"
        summary = (
            f"Idling was unusually high in this {interval_minutes:g}-minute usage interval."
            if idle_flag
            else "This interval's usage rates were unusual compared with the synthetic training baseline."
        )
        stable_key = f"{session_id}:{operation.get('timestamp', observed_at.isoformat())}:{kind}"
        insight_id = "ML-" + hashlib.sha256(stable_key.encode()).hexdigest()[:32]
        return [
            {
                "insight_id": insight_id,
                "operator_id": operator_id,
                "session_id": session_id,
                "kind": kind,
                "summary": summary,
                "severity": severity,
                "observed_at": observed_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
                "evidence": evidence,
                "method": "statistical",
                "model_version": MODEL_VERSION,
                "synthetic_basis": True,
            }
        ]
