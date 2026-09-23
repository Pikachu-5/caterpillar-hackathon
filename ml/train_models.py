"""Train ML-001 models and write reproducible local artifacts and metrics."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from models import train_and_evaluate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("../data/generated"))
    parser.add_argument("--artifacts", type=Path, default=Path("artifacts"))
    parser.add_argument("--interval-coverage", type=float, default=0.90)
    args = parser.parse_args()
    report = train_and_evaluate(
        args.data,
        args.artifacts,
        interval_coverage=args.interval_coverage,
    )
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
