#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
GOD MODE ENGINE — Dummy Data Setup Script
═══════════════════════════════════════════════════════════════════════════
Sets up mock/dummy data for testing the training system without real API.
Loads chart ranges, scenarios, and sample game data.

Usage:
    python scripts/setup_dummy_data.py           # Full setup
    python scripts/setup_dummy_data.py --charts  # Charts only
    python scripts/setup_dummy_data.py --scenarios # Scenarios only
    python scripts/setup_dummy_data.py --validate # Validate data files

Author: Smarter.Poker Engineering
═══════════════════════════════════════════════════════════════════════════
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Dict, List, Optional

# ═══════════════════════════════════════════════════════════════════════════
# PATHS
# ═══════════════════════════════════════════════════════════════════════════

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
CHARTS_DIR = DATA_DIR / "charts"
SCENARIOS_DIR = DATA_DIR / "scenarios"

# ═══════════════════════════════════════════════════════════════════════════
# COLORS FOR OUTPUT
# ═══════════════════════════════════════════════════════════════════════════

class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

def print_header(text: str):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'═' * 70}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'═' * 70}{Colors.END}\n")

def print_success(text: str):
    print(f"{Colors.GREEN}✅ {text}{Colors.END}")

def print_info(text: str):
    print(f"{Colors.CYAN}ℹ️  {text}{Colors.END}")

def print_warning(text: str):
    print(f"{Colors.WARNING}⚠️  {text}{Colors.END}")

def print_error(text: str):
    print(f"{Colors.FAIL}❌ {text}{Colors.END}")

# ═══════════════════════════════════════════════════════════════════════════
# DATA VALIDATION
# ═══════════════════════════════════════════════════════════════════════════

HAND_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
VALID_HANDS = []

# Generate all valid hand combos
for i, r1 in enumerate(HAND_RANKS):
    for j, r2 in enumerate(HAND_RANKS):
        if i < j:
            VALID_HANDS.append(f"{r1}{r2}s")  # Suited
            VALID_HANDS.append(f"{r1}{r2}o")  # Offsuit
        elif i == j:
            VALID_HANDS.append(f"{r1}{r2}")    # Pair
        else:
            VALID_HANDS.append(f"{r2}{r1}s")  # Suited (lower first)
            VALID_HANDS.append(f"{r2}{r1}o")  # Offsuit (lower first)

# Remove duplicates and create set
VALID_HANDS = set(VALID_HANDS)


def validate_chart(chart_data: Dict, filename: str) -> List[str]:
    """Validate a chart file for correct format."""
    errors = []

    if "meta" not in chart_data:
        errors.append(f"{filename}: Missing 'meta' section")

    if "charts" not in chart_data:
        errors.append(f"{filename}: Missing 'charts' section")
        return errors

    for chart_name, chart in chart_data["charts"].items():
        if "grid" not in chart:
            errors.append(f"{filename}/{chart_name}: Missing 'grid'")
            continue

        grid = chart["grid"]

        # Check for exactly 169 hands
        if len(grid) != 169:
            errors.append(f"{filename}/{chart_name}: Expected 169 hands, got {len(grid)}")

        # Check each hand is valid
        for hand in grid:
            if hand not in VALID_HANDS:
                errors.append(f"{filename}/{chart_name}: Invalid hand '{hand}'")

        # Check actions are valid
        valid_actions = {"PUSH", "FOLD", "CALL", "3BET", "RAISE", "CHECK"}
        for hand, action in grid.items():
            if action.upper() not in valid_actions:
                errors.append(f"{filename}/{chart_name}: Invalid action '{action}' for {hand}")

    return errors


def validate_scenario(scenario_data: Dict, filename: str) -> List[str]:
    """Validate a scenario file for correct format."""
    errors = []

    if "meta" not in scenario_data:
        errors.append(f"{filename}: Missing 'meta' section")

    if "categories" not in scenario_data:
        errors.append(f"{filename}: Missing 'categories' section")
        return errors

    for cat_name, category in scenario_data["categories"].items():
        if "scenarios" not in category:
            errors.append(f"{filename}/{cat_name}: Missing 'scenarios'")
            continue

        for scenario in category["scenarios"]:
            required = ["id", "title", "context", "prompt", "options"]
            for field in required:
                if field not in scenario:
                    errors.append(f"{filename}/{cat_name}/{scenario.get('id', '?')}: Missing '{field}'")

            # Validate options
            if "options" in scenario:
                correct_count = sum(1 for opt in scenario["options"] if opt.get("correct"))
                if correct_count != 1:
                    errors.append(
                        f"{filename}/{cat_name}/{scenario.get('id', '?')}: "
                        f"Expected 1 correct option, got {correct_count}"
                    )

    return errors


def run_validation() -> bool:
    """Validate all data files."""
    print_header("Validating Data Files")

    all_errors = []

    # Validate charts
    for chart_file in CHARTS_DIR.glob("*.json"):
        print_info(f"Validating {chart_file.name}...")
        try:
            with open(chart_file, 'r') as f:
                data = json.load(f)
            errors = validate_chart(data, chart_file.name)
            all_errors.extend(errors)
        except json.JSONDecodeError as e:
            all_errors.append(f"{chart_file.name}: Invalid JSON - {e}")

    # Validate scenarios
    for scenario_file in SCENARIOS_DIR.glob("*.json"):
        print_info(f"Validating {scenario_file.name}...")
        try:
            with open(scenario_file, 'r') as f:
                data = json.load(f)
            errors = validate_scenario(data, scenario_file.name)
            all_errors.extend(errors)
        except json.JSONDecodeError as e:
            all_errors.append(f"{scenario_file.name}: Invalid JSON - {e}")

    # Report results
    if all_errors:
        print_error(f"Found {len(all_errors)} validation errors:")
        for error in all_errors:
            print(f"  • {error}")
        return False
    else:
        print_success("All data files validated successfully!")
        return True


# ═══════════════════════════════════════════════════════════════════════════
# DATA STATISTICS
# ═══════════════════════════════════════════════════════════════════════════

def print_statistics():
    """Print statistics about loaded data."""
    print_header("Data Statistics")

    # Charts
    chart_count = 0
    chart_files = list(CHARTS_DIR.glob("*.json"))
    for chart_file in chart_files:
        with open(chart_file, 'r') as f:
            data = json.load(f)
            chart_count += len(data.get("charts", {}))

    print_info(f"Chart Files: {len(chart_files)}")
    print_info(f"Total Charts: {chart_count}")

    # Scenarios
    scenario_count = 0
    category_count = 0
    scenario_files = list(SCENARIOS_DIR.glob("*.json"))
    for scenario_file in scenario_files:
        with open(scenario_file, 'r') as f:
            data = json.load(f)
            categories = data.get("categories", {})
            category_count += len(categories)
            for cat in categories.values():
                scenario_count += len(cat.get("scenarios", []))

    print_info(f"Scenario Files: {len(scenario_files)}")
    print_info(f"Categories: {category_count}")
    print_info(f"Total Scenarios: {scenario_count}")


# ═══════════════════════════════════════════════════════════════════════════
# SAMPLE DATA GENERATION
# ═══════════════════════════════════════════════════════════════════════════

def generate_sample_hands() -> List[Dict]:
    """Generate sample hands for testing the PIO engine."""
    import random

    boards = [
        ["As", "Kd", "7h"],
        ["Qh", "Jd", "Tc"],
        ["9s", "8s", "2d"],
        ["Ah", "Th", "5h"],
        ["Kc", "Kd", "3s"],
    ]

    hero_hands = [
        ["Ac", "Kc"],
        ["Qd", "Qc"],
        ["Jh", "Ts"],
        ["9h", "9d"],
        ["As", "5s"],
    ]

    actions = ["CHECK", "BET 33%", "BET 66%", "BET 100%", "FOLD"]

    hands = []
    for i in range(20):
        board_idx = i % len(boards)
        hero_idx = i % len(hero_hands)

        hand = {
            "hand_id": f"demo_{i+1:03d}",
            "board": boards[board_idx],
            "hero_hand": hero_hands[hero_idx],
            "pot_size": random.randint(50, 500),
            "stack_effective": random.randint(50, 200),
            "position": random.choice(["BTN", "CO", "MP", "UTG"]),
            "street": random.choice(["Flop", "Turn", "River"]),
            "correct_actions": random.sample(actions, k=random.randint(1, 2)),
            "villain_range_description": "Typical opener range",
        }
        hands.append(hand)

    return hands


def save_sample_hands():
    """Save sample hands to data directory."""
    print_info("Generating sample PIO hands...")

    hands = generate_sample_hands()
    output_file = DATA_DIR / "sample_hands.json"

    with open(output_file, 'w') as f:
        json.dump({
            "meta": {
                "version": "1.0.0",
                "engine": "PIO",
                "description": "Sample hands for PIO engine testing"
            },
            "hands": hands
        }, f, indent=2)

    print_success(f"Saved {len(hands)} sample hands to {output_file}")


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="God Mode Engine - Dummy Data Setup"
    )
    parser.add_argument(
        "--charts", action="store_true",
        help="Process charts only"
    )
    parser.add_argument(
        "--scenarios", action="store_true",
        help="Process scenarios only"
    )
    parser.add_argument(
        "--validate", action="store_true",
        help="Validate data files only"
    )
    parser.add_argument(
        "--generate", action="store_true",
        help="Generate sample PIO hands"
    )
    parser.add_argument(
        "--stats", action="store_true",
        help="Show data statistics"
    )
    args = parser.parse_args()

    print_header("GOD MODE ENGINE — Data Setup")

    # Ensure directories exist
    CHARTS_DIR.mkdir(parents=True, exist_ok=True)
    SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)

    # Handle specific flags
    if args.validate:
        success = run_validation()
        sys.exit(0 if success else 1)

    if args.stats:
        print_statistics()
        sys.exit(0)

    if args.generate:
        save_sample_hands()
        sys.exit(0)

    # Full setup
    print_info(f"Project root: {PROJECT_ROOT}")
    print_info(f"Data directory: {DATA_DIR}")
    print()

    # Validate existing data
    print_info("Validating existing data files...")
    run_validation()

    # Show statistics
    print_statistics()

    # Generate sample hands if requested or if none exist
    sample_file = DATA_DIR / "sample_hands.json"
    if not sample_file.exists():
        save_sample_hands()
    else:
        print_info(f"Sample hands already exist at {sample_file}")

    print()
    print_success("Data setup complete!")
    print()
    print("Next steps:")
    print("  1. Run the FastAPI server: uvicorn src.api.main:app --reload")
    print("  2. Run the Next.js dev server: npm run dev")
    print("  3. Navigate to /hub/training to test the system")


if __name__ == "__main__":
    main()
