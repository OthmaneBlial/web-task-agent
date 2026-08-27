#!/usr/bin/env python3
"""Apply the narrow import-order repair required by PyPI gpt-researcher 0.16.0."""

import argparse
import site
from pathlib import Path


EARLY_IMPORTS = "import json_repair\nimport logging\nfrom typing import Any, Dict, List\n"
LATE_IMPORTS = "import logging\nfrom typing import Any, Dict, List\n\n"


def default_target() -> Path:
    candidates = [
        Path(package_dir) / "gpt_researcher" / "actions" / "query_processing.py"
        for package_dir in site.getsitepackages()
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SystemExit("gpt-researcher query_processing.py was not found in this Python environment")


def repair(target: Path) -> str:
    source = target.read_text(encoding="utf-8")
    if source.startswith(EARLY_IMPORTS) and LATE_IMPORTS not in source[len(EARLY_IMPORTS):]:
        return "already repaired"
    if not source.startswith("import json_repair\n"):
        raise SystemExit(f"refusing unexpected file header in {target}")
    if source.count(LATE_IMPORTS) != 1:
        raise SystemExit(f"refusing unexpected late-import shape in {target}")

    repaired = source.replace(LATE_IMPORTS, "\n", 1)
    repaired = repaired.replace("import json_repair\n", EARLY_IMPORTS, 1)
    if not repaired.startswith(EARLY_IMPORTS) or LATE_IMPORTS in repaired[len(EARLY_IMPORTS):]:
        raise SystemExit(f"repair postcondition failed for {target}")
    target.write_text(repaired, encoding="utf-8")
    return "repaired"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=Path, help="explicit file used by tests; defaults to the active environment")
    args = parser.parse_args()
    target = args.target or default_target()
    print(f"GPT Researcher 0.16.0 import order: {repair(target)} ({target})")


if __name__ == "__main__":
    main()
