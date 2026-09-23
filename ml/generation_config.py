"""
Generation configuration and parameter manifest for DATA-001.

Every parameter that influences synthetic data generation is documented here.
This serves as the provenance manifest: given a seed and this config, the output
is fully reproducible.

ASSUMPTIONS — these are synthetic demo hypotheses, NOT measured CAT 325 data:
- Fuel consumption correlates loosely with load cycles and inversely with idling
- Seatbelt unfastening correlates with but does not deterministically cause alerts
- Task durations are influenced by skill, weather, soil, and machine age
- Temperature and soil moisture vary seasonally within documented ranges
- All relationships include variance and counterexamples
"""

from __future__ import annotations

from dataclasses import dataclass, field

GENERATOR_VERSION = "data-001-v1"


@dataclass(frozen=True)
class OperatorProfile:
    """A synthetic operator identity and skill level."""

    operator_id: str
    skill: str  # Beginner | Intermediate | Expert


@dataclass(frozen=True)
class MachineProfile:
    """A synthetic machine identity."""

    machine_id: str
    machine_model: str
    age_years: float  # approximate age at generation start
    initial_engine_hours: float  # cumulative meter at generation start


@dataclass(frozen=True)
class GenerationConfig:
    """
    Complete parameter manifest for reproducible synthetic dataset generation.

    All ranges and rates are synthetic assumptions for a demo, not OEM specifications.
    """

    # --- Reproduction ---
    seed: int = 42
    generator_version: str = GENERATOR_VERSION

    # --- Operations generation ---
    interval_minutes: float = 60.0
    timezone: str = "America/Chicago"
    # Work schedule: hours of day (0-23) when operations occur
    work_start_hour: int = 6
    work_end_hour: int = 18  # exclusive
    # Only weekdays (Mon-Fri)
    weekdays_only: bool = True
    # Start date for synthetic operations (after reference data ends 2025-05-02)
    ops_start_date: str = "2025-05-05"  # Monday after reference data
    ops_num_days: int = 42  # ~6 weeks of work days

    # Fuel consumption per interval (liters) — synthetic range
    fuel_base_min: float = 1.5
    fuel_base_max: float = 4.0
    fuel_load_bonus_per_cycle: float = 0.3  # additional fuel per load cycle
    fuel_idle_penalty: float = 0.5  # base fuel when mostly idling

    # Load cycles per interval — synthetic range
    load_cycles_active_min: int = 3
    load_cycles_active_max: int = 18
    load_cycles_idle_probability: float = 0.15  # chance of zero cycles (idle interval)

    # Idling time per interval (minutes) — anticorrelated with load cycles
    idle_base_min: float = 5.0
    idle_base_max: float = 55.0

    # Engine hours increment per interval (hours of runtime within 60-min interval)
    engine_hours_min_increment: float = 0.7
    engine_hours_max_increment: float = 1.0

    # Seatbelt behavior
    seatbelt_unfastened_probability: float = 0.08  # base rate
    seatbelt_unfastened_streak_max: int = 3  # max consecutive unfastened intervals

    # Safety alert behavior — correlated with but NOT deterministic from seatbelt
    alert_given_unfastened_probability: float = 0.70  # P(alert | unfastened)
    alert_given_fastened_probability: float = 0.03  # P(alert | fastened) — rare false alarms
    # Counterexample rate: unfastened but no alert
    # = 1 - alert_given_unfastened_probability = 0.30

    # --- Environmental parameters ---
    temperature_summer_mean: float = 30.0
    temperature_summer_std: float = 5.0
    temperature_spring_mean: float = 20.0
    temperature_spring_std: float = 6.0
    temperature_min_clamp: float = -5.0
    temperature_max_clamp: float = 45.0

    soil_types: tuple[str, ...] = ("Sand", "Loam", "Clay", "Gravel")
    soil_type_weights: tuple[float, ...] = (0.25, 0.35, 0.25, 0.15)
    soil_moisture_min: float = 5.0
    soil_moisture_max: float = 55.0
    soil_moisture_rain_bonus: float = 15.0  # added moisture during rainy weather

    # --- Task generation ---
    task_types: tuple[str, ...] = (
        "Earth Excavation",
        "Trenching",
        "Material Loading",
        "Grading",
        "Demolition",
    )
    weather_categories: tuple[str, ...] = ("Sunny", "Rainy", "Cloudy", "Windy")
    skill_levels: tuple[str, ...] = ("Beginner", "Intermediate", "Expert")

    # Base estimated minutes per task type (synthetic assumptions)
    task_base_minutes: dict[str, float] = field(
        default_factory=lambda: {
            "Earth Excavation": 60.0,
            "Trenching": 45.0,
            "Material Loading": 30.0,
            "Grading": 35.0,
            "Demolition": 90.0,
        }
    )

    # Skill multipliers on actual time (lower = faster)
    skill_multipliers: dict[str, float] = field(
        default_factory=lambda: {
            "Expert": 0.90,
            "Intermediate": 1.05,
            "Beginner": 1.25,
        }
    )

    # Weather multipliers on actual time
    weather_multipliers: dict[str, float] = field(
        default_factory=lambda: {
            "Sunny": 1.0,
            "Cloudy": 1.02,
            "Rainy": 1.15,
            "Windy": 1.10,
        }
    )

    # Soil type multipliers on actual time
    soil_multipliers: dict[str, float] = field(
        default_factory=lambda: {
            "Sand": 0.95,
            "Loam": 1.0,
            "Clay": 1.12,
            "Gravel": 1.08,
            "Unknown": 1.0,
        }
    )

    # Machine age effect: additional multiplier per year of age
    machine_age_multiplier_per_year: float = 0.01

    # Noise on actual time (std as fraction of base)
    task_time_noise_std_fraction: float = 0.12

    # Estimated time noise (std as fraction of base) — estimates aren't perfect
    estimated_time_noise_std_fraction: float = 0.08

    # Counterexample rate: fraction of tasks where actual < estimated even for beginners
    counterexample_rate: float = 0.10

    # Machine age range for generated tasks (years)
    machine_age_min: float = 1.0
    machine_age_max: float = 8.0

    # Number of task records to generate
    num_tasks: int = 500

    # --- Profiles ---
    operators: tuple[OperatorProfile, ...] = (
        OperatorProfile(operator_id="OP1001", skill="Expert"),
        OperatorProfile(operator_id="OP2001", skill="Intermediate"),
    )

    machines: tuple[MachineProfile, ...] = (
        MachineProfile(
            machine_id="EXC001",
            machine_model="CAT 325",
            age_years=2.0,
            initial_engine_hours=1530.2,  # continues from reference data
        ),
        MachineProfile(
            machine_id="EXC002",
            machine_model="CAT 325",
            age_years=5.0,
            initial_engine_hours=6200.0,
        ),
    )

    # --- Train/validation/test split ---
    # Split by generation group (chronological blocks), NOT random scatter
    train_fraction: float = 0.70
    validation_fraction: float = 0.15
    test_fraction: float = 0.15

    def __post_init__(self) -> None:
        total = self.train_fraction + self.validation_fraction + self.test_fraction
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"Split fractions must sum to 1.0, got {total}")
