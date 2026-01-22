#!/usr/bin/env python3
"""
🎮 GOD MODE ENGINE — Game Registry Seeder
═══════════════════════════════════════════════════════════════════════════
Populates the game_registry table with 100 training games.
Auto-assigns engine_type and config based on game title/category.
═══════════════════════════════════════════════════════════════════════════

Usage:
    python seed_games.py                    # Dry run (print SQL)
    python seed_games.py --execute          # Execute against Supabase
    python seed_games.py --output schema.sql # Write to file
"""

import json
import re
import os
import sys
from typing import Dict, List, Optional

# ═══════════════════════════════════════════════════════════════════════════
# THE 100 GAMES — Sourced from TRAINING_LIBRARY.js
# ═══════════════════════════════════════════════════════════════════════════

TRAINING_LIBRARY = [
    # MTT GAMES (25)
    {"id": "mtt-001", "name": "Push/Fold Mastery", "focus": "Short stack all-in ranges", "category": "MTT", "difficulty": 2, "icon": "🎯", "tags": ["gto", "math"]},
    {"id": "mtt-002", "name": "ICM Fundamentals", "focus": "Independent chip model basics", "category": "MTT", "difficulty": 3, "icon": "📊", "tags": ["math"]},
    {"id": "mtt-003", "name": "Bubble Pressure", "focus": "Pre-money survival tactics", "category": "MTT", "difficulty": 3, "icon": "🫧", "tags": ["exploitative"]},
    {"id": "mtt-004", "name": "Final Table ICM", "focus": "Pay jump optimization", "category": "MTT", "difficulty": 4, "icon": "🏆", "tags": ["math", "gto"]},
    {"id": "mtt-005", "name": "PKO Bounty Hunter", "focus": "Bounty chip calculations", "category": "MTT", "difficulty": 3, "icon": "💰", "tags": ["math"]},
    {"id": "mtt-006", "name": "Satellite Survival", "focus": "Extreme ICM discipline", "category": "MTT", "difficulty": 4, "icon": "🎫", "tags": ["gto"]},
    {"id": "mtt-007", "name": "Deep Stack MTT", "focus": "Early tournament strategy", "category": "MTT", "difficulty": 2, "icon": "📚", "tags": ["gto"]},
    {"id": "mtt-008", "name": "Short Stack Ninja", "focus": "10-20BB mastery", "category": "MTT", "difficulty": 3, "icon": "⚡", "tags": ["gto", "math"]},
    {"id": "mtt-009", "name": "Resteal Wars", "focus": "3-bet shove defense", "category": "MTT", "difficulty": 3, "icon": "🔄", "tags": ["exploitative"]},
    {"id": "mtt-010", "name": "Squeeze Master", "focus": "Multi-way pressure plays", "category": "MTT", "difficulty": 4, "icon": "🤏", "tags": ["exploitative"]},
    {"id": "mtt-011", "name": "Ante Theft", "focus": "BB ante exploitation", "category": "MTT", "difficulty": 2, "icon": "💸", "tags": ["exploitative"]},
    {"id": "mtt-012", "name": "Big Stack Bully", "focus": "Covering stack pressure", "category": "MTT", "difficulty": 3, "icon": "🦈", "tags": ["exploitative"]},
    {"id": "mtt-013", "name": "Ladder Jump", "focus": "Pay jump patience", "category": "MTT", "difficulty": 4, "icon": "🪜", "tags": ["math", "gto"]},
    {"id": "mtt-014", "name": "3-Max Blitz", "focus": "Final 3 aggression", "category": "MTT", "difficulty": 4, "icon": "⚔️", "tags": ["gto"]},
    {"id": "mtt-015", "name": "Heads Up Duel", "focus": "1v1 tournament finale", "category": "MTT", "difficulty": 5, "icon": "👑", "tags": ["gto", "exploitative"]},
    {"id": "mtt-016", "name": "Chip & Chair", "focus": "Micro-stack comeback", "category": "MTT", "difficulty": 3, "icon": "🪑", "tags": ["math"]},
    {"id": "mtt-017", "name": "Blind Defense MTT", "focus": "Tournament BB play", "category": "MTT", "difficulty": 3, "icon": "🛡️", "tags": ["gto"]},
    {"id": "mtt-018", "name": "Button Warfare", "focus": "BTN open/defend ranges", "category": "MTT", "difficulty": 3, "icon": "🔘", "tags": ["gto"]},
    {"id": "mtt-019", "name": "Stop & Go", "focus": "Delayed shove tactics", "category": "MTT", "difficulty": 3, "icon": "🚦", "tags": ["exploitative"]},
    {"id": "mtt-020", "name": "Multi-way Bounty", "focus": "PKO pot odds overlay", "category": "MTT", "difficulty": 4, "icon": "💎", "tags": ["math"]},
    {"id": "mtt-021", "name": "Check-Shove Power", "focus": "Postflop aggression", "category": "MTT", "difficulty": 4, "icon": "💪", "tags": ["gto"]},
    {"id": "mtt-022", "name": "Clock Management", "focus": "Time bank strategy", "category": "MTT", "difficulty": 2, "icon": "⏰", "tags": ["exploitative"]},
    {"id": "mtt-023", "name": "Registration Edge", "focus": "Late reg advantages", "category": "MTT", "difficulty": 2, "icon": "📝", "tags": ["math"]},
    {"id": "mtt-024", "name": "Triple Barrel", "focus": "MTT bluff sequences", "category": "MTT", "difficulty": 4, "icon": "🎰", "tags": ["exploitative"]},
    {"id": "mtt-025", "name": "Level 10: MTT Champion", "focus": "Full tourney simulation", "category": "MTT", "difficulty": 5, "icon": "🏅", "tags": ["gto", "math", "exploitative"]},
    
    # CASH GAMES (25)
    {"id": "cash-001", "name": "Preflop Blueprint", "focus": "6-Max RFI ranges", "category": "CASH", "difficulty": 2, "icon": "♠️", "tags": ["gto"]},
    {"id": "cash-002", "name": "C-Bet Academy", "focus": "Continuation bet sizing", "category": "CASH", "difficulty": 2, "icon": "💥", "tags": ["gto"]},
    {"id": "cash-003", "name": "Defense Matrix", "focus": "Facing aggression", "category": "CASH", "difficulty": 3, "icon": "🛡️", "tags": ["gto"]},
    {"id": "cash-004", "name": "Value Extractor", "focus": "Thin value betting", "category": "CASH", "difficulty": 3, "icon": "💎", "tags": ["gto", "exploitative"]},
    {"id": "cash-005", "name": "Bluff Catcher", "focus": "Hero call decisions", "category": "CASH", "difficulty": 4, "icon": "🃏", "tags": ["exploitative"]},
    {"id": "cash-006", "name": "Position Power", "focus": "IP vs OOP dynamics", "category": "CASH", "difficulty": 2, "icon": "🪑", "tags": ["gto"]},
    {"id": "cash-007", "name": "3-Bet Pots", "focus": "Elevated pot strategy", "category": "CASH", "difficulty": 3, "icon": "🔺", "tags": ["gto"]},
    {"id": "cash-008", "name": "4-Bet Wars", "focus": "Pre-flop escalation", "category": "CASH", "difficulty": 4, "icon": "⚔️", "tags": ["gto", "math"]},
    {"id": "cash-009", "name": "Deep Stack Cash", "focus": "200BB+ strategy", "category": "CASH", "difficulty": 4, "icon": "📚", "tags": ["gto"]},
    {"id": "cash-010", "name": "Short Stack Rat", "focus": "40BB hit-and-run", "category": "CASH", "difficulty": 3, "icon": "🐀", "tags": ["exploitative"]},
    {"id": "cash-011", "name": "Donk Defense", "focus": "Facing lead bets", "category": "CASH", "difficulty": 3, "icon": "🫏", "tags": ["exploitative"]},
    {"id": "cash-012", "name": "River Decisions", "focus": "Final street mastery", "category": "CASH", "difficulty": 4, "icon": "🌊", "tags": ["gto", "math"]},
    {"id": "cash-013", "name": "Probe Betting", "focus": "Taking the initiative", "category": "CASH", "difficulty": 3, "icon": "🔍", "tags": ["exploitative"]},
    {"id": "cash-014", "name": "Check-Raise Art", "focus": "Aggression tactics", "category": "CASH", "difficulty": 4, "icon": "📈", "tags": ["gto"]},
    {"id": "cash-015", "name": "Overbetting", "focus": "Polarized big bets", "category": "CASH", "difficulty": 4, "icon": "💣", "tags": ["gto"]},
    {"id": "cash-016", "name": "Multi-way Pots", "focus": "3+ player dynamics", "category": "CASH", "difficulty": 3, "icon": "👥", "tags": ["gto"]},
    {"id": "cash-017", "name": "Rake Awareness", "focus": "Rake-adjusted strategy", "category": "CASH", "difficulty": 3, "icon": "🧮", "tags": ["math"]},
    {"id": "cash-018", "name": "Blind vs Blind", "focus": "SB vs BB warfare", "category": "CASH", "difficulty": 3, "icon": "🥊", "tags": ["gto"]},
    {"id": "cash-019", "name": "Straddle Games", "focus": "Extended pot dynamics", "category": "CASH", "difficulty": 3, "icon": "🦶", "tags": ["exploitative"]},
    {"id": "cash-020", "name": "Table Selection", "focus": "Finding soft spots", "category": "CASH", "difficulty": 2, "icon": "🎯", "tags": ["exploitative"]},
    {"id": "cash-021", "name": "Mixed Strategies", "focus": "Frequency execution", "category": "CASH", "difficulty": 4, "icon": "🎲", "tags": ["gto", "math"]},
    {"id": "cash-022", "name": "Texture Reading", "focus": "Board analysis", "category": "CASH", "difficulty": 3, "icon": "🔬", "tags": ["gto"]},
    {"id": "cash-023", "name": "Equity Denial", "focus": "Protection betting", "category": "CASH", "difficulty": 3, "icon": "🚫", "tags": ["gto"]},
    {"id": "cash-024", "name": "Pot Control", "focus": "Medium strength hands", "category": "CASH", "difficulty": 3, "icon": "⚖️", "tags": ["gto"]},
    {"id": "cash-025", "name": "Level 10: Cash King", "focus": "Full session grind", "category": "CASH", "difficulty": 5, "icon": "👑", "tags": ["gto", "math", "exploitative"]},
    
    # SPINS (10)
    {"id": "spins-001", "name": "Hyper Opener", "focus": "3-Max early game", "category": "SPINS", "difficulty": 2, "icon": "⚡", "tags": ["gto"]},
    {"id": "spins-002", "name": "Jackpot Pressure", "focus": "High multiplier play", "category": "SPINS", "difficulty": 4, "icon": "🎰", "tags": ["exploitative"]},
    {"id": "spins-003", "name": "Button Limp", "focus": "Trap strategies", "category": "SPINS", "difficulty": 3, "icon": "🪤", "tags": ["exploitative"]},
    {"id": "spins-004", "name": "SNG Endgame", "focus": "Final 2 battles", "category": "SPINS", "difficulty": 3, "icon": "🏁", "tags": ["gto"]},
    {"id": "spins-005", "name": "Phase Shifting", "focus": "Stack depth transitions", "category": "SPINS", "difficulty": 3, "icon": "🔄", "tags": ["gto", "math"]},
    {"id": "spins-006", "name": "Limb Trap", "focus": "Limp-call lines", "category": "SPINS", "difficulty": 3, "icon": "🕳️", "tags": ["exploitative"]},
    {"id": "spins-007", "name": "50/50 Survival", "focus": "Extreme ICM", "category": "SPINS", "difficulty": 4, "icon": "⚖️", "tags": ["math", "gto"]},
    {"id": "spins-008", "name": "Aggression Mode", "focus": "Constant pressure", "category": "SPINS", "difficulty": 3, "icon": "🔥", "tags": ["exploitative"]},
    {"id": "spins-009", "name": "Chip Lead Lock", "focus": "Protecting the lead", "category": "SPINS", "difficulty": 3, "icon": "🔒", "tags": ["gto"]},
    {"id": "spins-010", "name": "Level 10: Spin Master", "focus": "Full spin simulation", "category": "SPINS", "difficulty": 5, "icon": "🌀", "tags": ["gto", "math", "exploitative"]},
    
    # PSYCHOLOGY (20)
    {"id": "psy-001", "name": "Tilt Control", "focus": "Emotional regulation", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "😤", "tags": []},
    {"id": "psy-002", "name": "Timing Discipline", "focus": "Consistent action speed", "category": "PSYCHOLOGY", "difficulty": 2, "icon": "⏱️", "tags": []},
    {"id": "psy-003", "name": "Cooler Cage", "focus": "Bad beat resilience", "category": "PSYCHOLOGY", "difficulty": 4, "icon": "🥶", "tags": []},
    {"id": "psy-004", "name": "Pressure Chamber", "focus": "High stakes decisions", "category": "PSYCHOLOGY", "difficulty": 4, "icon": "🔥", "tags": []},
    {"id": "psy-005", "name": "Patience Master", "focus": "Waiting for spots", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "🐢", "tags": []},
    {"id": "psy-006", "name": "Focus Flow", "focus": "Concentration drills", "category": "PSYCHOLOGY", "difficulty": 2, "icon": "🎯", "tags": []},
    {"id": "psy-007", "name": "Result Detachment", "focus": "Process over outcome", "category": "PSYCHOLOGY", "difficulty": 4, "icon": "🧘", "tags": []},
    {"id": "psy-008", "name": "Confidence Builder", "focus": "Trust your reads", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "💪", "tags": []},
    {"id": "psy-009", "name": "Fear Eraser", "focus": "Bold decision making", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "🦁", "tags": []},
    {"id": "psy-010", "name": "Ego Killer", "focus": "Humble learning", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "🪞", "tags": []},
    {"id": "psy-011", "name": "Session Stamina", "focus": "Long session focus", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "🏃", "tags": []},
    {"id": "psy-012", "name": "Snap Decision", "focus": "Instinct training", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "⚡", "tags": []},
    {"id": "psy-013", "name": "Tell Blindness", "focus": "Ignoring false reads", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "🙈", "tags": []},
    {"id": "psy-014", "name": "Bankroll Mind", "focus": "Money management", "category": "PSYCHOLOGY", "difficulty": 2, "icon": "💰", "tags": ["math"]},
    {"id": "psy-015", "name": "Winners Tilt", "focus": "Staying sharp ahead", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "🎢", "tags": []},
    {"id": "psy-016", "name": "Variance Zen", "focus": "Accepting swings", "category": "PSYCHOLOGY", "difficulty": 4, "icon": "☯️", "tags": ["math"]},
    {"id": "psy-017", "name": "Study Habits", "focus": "Effective learning", "category": "PSYCHOLOGY", "difficulty": 2, "icon": "📖", "tags": []},
    {"id": "psy-018", "name": "Table Image", "focus": "Perception awareness", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "🎭", "tags": ["exploitative"]},
    {"id": "psy-019", "name": "Autopilot Escape", "focus": "Staying present", "category": "PSYCHOLOGY", "difficulty": 3, "icon": "✈️", "tags": []},
    {"id": "psy-020", "name": "Level 10: Mind Master", "focus": "Full mental game", "category": "PSYCHOLOGY", "difficulty": 5, "icon": "🧠", "tags": []},
    
    # ADVANCED (20)
    {"id": "adv-001", "name": "Solver Mimicry", "focus": "GTO execution", "category": "ADVANCED", "difficulty": 4, "icon": "🤖", "tags": ["gto"]},
    {"id": "adv-002", "name": "Blocker Logic", "focus": "Card removal effects", "category": "ADVANCED", "difficulty": 4, "icon": "🚫", "tags": ["gto", "math"]},
    {"id": "adv-003", "name": "Node Locking", "focus": "Exploitative trees", "category": "ADVANCED", "difficulty": 5, "icon": "🔒", "tags": ["exploitative"]},
    {"id": "adv-004", "name": "Range Construction", "focus": "Building strategies", "category": "ADVANCED", "difficulty": 4, "icon": "🏗️", "tags": ["gto"]},
    {"id": "adv-005", "name": "Frequency Math", "focus": "Mixed strategy %", "category": "ADVANCED", "difficulty": 4, "icon": "📊", "tags": ["gto", "math"]},
    {"id": "adv-006", "name": "EV Calculations", "focus": "Expected value math", "category": "ADVANCED", "difficulty": 4, "icon": "🧮", "tags": ["math"]},
    {"id": "adv-007", "name": "Indifference Theory", "focus": "Making villains neutral", "category": "ADVANCED", "difficulty": 5, "icon": "⚖️", "tags": ["gto", "math"]},
    {"id": "adv-008", "name": "Range Advantage", "focus": "Equity distribution", "category": "ADVANCED", "difficulty": 4, "icon": "📈", "tags": ["gto"]},
    {"id": "adv-009", "name": "Nut Advantage", "focus": "Polarization spots", "category": "ADVANCED", "difficulty": 4, "icon": "🥜", "tags": ["gto"]},
    {"id": "adv-010", "name": "Board Coverage", "focus": "Range composition", "category": "ADVANCED", "difficulty": 4, "icon": "🎨", "tags": ["gto"]},
    {"id": "adv-011", "name": "SPR Mastery", "focus": "Stack-to-pot ratios", "category": "ADVANCED", "difficulty": 3, "icon": "📐", "tags": ["math"]},
    {"id": "adv-012", "name": "MDF Defender", "focus": "Minimum defense", "category": "ADVANCED", "difficulty": 4, "icon": "🛡️", "tags": ["gto", "math"]},
    {"id": "adv-013", "name": "Combo Counting", "focus": "Hand combinations", "category": "ADVANCED", "difficulty": 3, "icon": "🔢", "tags": ["math"]},
    {"id": "adv-014", "name": "Bet Sizing Theory", "focus": "Geometric sizing", "category": "ADVANCED", "difficulty": 4, "icon": "📏", "tags": ["gto", "math"]},
    {"id": "adv-015", "name": "Population Reads", "focus": "Pool tendencies", "category": "ADVANCED", "difficulty": 3, "icon": "👥", "tags": ["exploitative"]},
    {"id": "adv-016", "name": "Exploit Ladder", "focus": "Deviation strategy", "category": "ADVANCED", "difficulty": 4, "icon": "🪜", "tags": ["exploitative"]},
    {"id": "adv-017", "name": "Capped Ranges", "focus": "Playing condensed", "category": "ADVANCED", "difficulty": 4, "icon": "📦", "tags": ["gto"]},
    {"id": "adv-018", "name": "Polarity Index", "focus": "Range splitting", "category": "ADVANCED", "difficulty": 5, "icon": "🧲", "tags": ["gto"]},
    {"id": "adv-019", "name": "Solver Scripts", "focus": "Sim interpretation", "category": "ADVANCED", "difficulty": 5, "icon": "💻", "tags": ["gto"]},
    {"id": "adv-020", "name": "Level 10: GTO Apex", "focus": "Ultimate theory test", "category": "ADVANCED", "difficulty": 5, "icon": "🏛️", "tags": ["gto", "math", "exploitative"]},
]


# ═══════════════════════════════════════════════════════════════════════════
# ENGINE AUTO-ASSIGNMENT LOGIC
# ═══════════════════════════════════════════════════════════════════════════

# Keywords that trigger CHART engine (preflop/ICM)
CHART_KEYWORDS = [
    "push", "fold", "preflop", "icm", "bubble", "satellite", 
    "short stack", "resteal", "shove", "ante theft", "chip & chair",
    "blind defense", "stop & go", "squeeze", "3-bet", "4-bet",
    "hyper", "50/50", "phase shift"
]

# Keywords that trigger SCENARIO engine (mental game)
SCENARIO_KEYWORDS = [
    "tilt", "mental", "psychology", "zen", "patience", "focus",
    "discipline", "pressure", "confidence", "fear", "ego",
    "stamina", "cooler", "variance", "autopilot", "result",
    "bankroll mind", "table image", "winners tilt", "study"
]


def slugify(name: str) -> str:
    """Convert game name to URL-safe slug."""
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


def determine_engine(game: Dict) -> str:
    """
    Auto-assign engine type based on game name, category, and focus.
    
    Rules:
    1. PSYCHOLOGY category -> SCENARIO
    2. Name/focus contains CHART_KEYWORDS -> CHART
    3. Name/focus contains SCENARIO_KEYWORDS -> SCENARIO
    4. All others (postflop, cash, advanced) -> PIO
    """
    name_lower = game["name"].lower()
    focus_lower = game["focus"].lower()
    category = game["category"]
    combined = f"{name_lower} {focus_lower}"
    
    # Rule 1: Psychology category = SCENARIO
    if category == "PSYCHOLOGY":
        return "SCENARIO"
    
    # Rule 2: Check for CHART keywords (preflop/ICM)
    for keyword in CHART_KEYWORDS:
        if keyword in combined:
            return "CHART"
    
    # Rule 3: Check for SCENARIO keywords (shouldn't hit often outside Psychology)
    for keyword in SCENARIO_KEYWORDS:
        if keyword in combined:
            return "SCENARIO"
    
    # Rule 4: Default to PIO (postflop solver)
    return "PIO"


def determine_config(game: Dict) -> Dict:
    """
    Auto-assign config JSON based on game characteristics.
    """
    name_lower = game["name"].lower()
    focus_lower = game["focus"].lower()
    combined = f"{name_lower} {focus_lower}"
    
    config = {
        "difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100],
        "hands_per_round": 20,
        "max_level": 10,
    }
    
    # Stack depth assignment
    if "short stack" in combined or "10-20bb" in combined or "push" in combined:
        config["stack_depth"] = 20
    elif "deep stack" in combined or "200bb" in combined:
        config["stack_depth"] = 200
    elif "40bb" in combined:
        config["stack_depth"] = 40
    else:
        config["stack_depth"] = 100  # Default
    
    # Category-specific config
    category = game["category"]
    if category == "MTT":
        config["format"] = "MTT"
        config["ante"] = True
    elif category == "CASH":
        config["format"] = "CASH"
        config["ante"] = False
    elif category == "SPINS":
        config["format"] = "SPIN"
        config["players"] = 3
    elif category == "PSYCHOLOGY":
        config["format"] = "SCENARIO"
        config["rigged_rng"] = True
    elif category == "ADVANCED":
        config["format"] = "SOLVER"
        config["show_frequencies"] = True
    
    # Difficulty-based adjustments
    difficulty = game.get("difficulty", 3)
    if difficulty >= 4:
        config["time_pressure"] = True
        config["shot_clock_seconds"] = 15
    if difficulty >= 5:
        config["shot_clock_seconds"] = 10
    
    return config


def generate_sql_insert(game: Dict, engine: str, config: Dict) -> str:
    """Generate SQL INSERT statement for a single game."""
    slug = slugify(game["name"])
    title = game["name"].replace("'", "''")  # Escape single quotes
    description = game["focus"].replace("'", "''")
    icon = game["icon"]
    category = game["category"]
    config_json = json.dumps(config).replace("'", "''")
    
    return f"""    ('{title}', '{slug}', '{engine}', '{category}', '{config_json}'::jsonb, '{description}', '{icon}')"""


def generate_full_sql() -> str:
    """Generate the complete SQL migration for all 100 games."""
    
    sql_parts = [
        "-- ════════════════════════════════════════════════════════════════════════════",
        "-- GOD MODE ENGINE — Game Registry Seed",
        "-- Auto-generated by seed_games.py",
        "-- 100 Games with auto-assigned engine types and configs",
        "-- ════════════════════════════════════════════════════════════════════════════",
        "",
        "INSERT INTO game_registry (title, slug, engine_type, category, config, description, icon_url)",
        "VALUES"
    ]
    
    insert_values = []
    engine_counts = {"PIO": 0, "CHART": 0, "SCENARIO": 0}
    
    for game in TRAINING_LIBRARY:
        engine = determine_engine(game)
        config = determine_config(game)
        engine_counts[engine] += 1
        insert_values.append(generate_sql_insert(game, engine, config))
    
    sql_parts.append(",\n".join(insert_values))
    sql_parts.append("ON CONFLICT (slug) DO UPDATE SET")
    sql_parts.append("    engine_type = EXCLUDED.engine_type,")
    sql_parts.append("    config = EXCLUDED.config,")
    sql_parts.append("    description = EXCLUDED.description,")
    sql_parts.append("    icon_url = EXCLUDED.icon_url,")
    sql_parts.append("    updated_at = NOW();")
    sql_parts.append("")
    sql_parts.append("-- ════════════════════════════════════════════════════════════════════════════")
    sql_parts.append(f"-- Engine Distribution: PIO={engine_counts['PIO']}, CHART={engine_counts['CHART']}, SCENARIO={engine_counts['SCENARIO']}")
    sql_parts.append("-- ════════════════════════════════════════════════════════════════════════════")
    
    return "\n".join(sql_parts)


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Seed God Mode game registry")
    parser.add_argument("--execute", action="store_true", help="Execute SQL against Supabase")
    parser.add_argument("--output", type=str, help="Write SQL to file")
    parser.add_argument("--stats", action="store_true", help="Show engine assignment stats")
    args = parser.parse_args()
    
    sql = generate_full_sql()
    
    if args.stats:
        # Show detailed breakdown
        print("\n🎮 GOD MODE ENGINE — Game Analysis")
        print("=" * 60)
        engine_games = {"PIO": [], "CHART": [], "SCENARIO": []}
        for game in TRAINING_LIBRARY:
            engine = determine_engine(game)
            engine_games[engine].append(game["name"])
        
        for engine, games in engine_games.items():
            print(f"\n{engine} ({len(games)} games):")
            for g in games[:5]:
                print(f"  • {g}")
            if len(games) > 5:
                print(f"  ... and {len(games) - 5} more")
        print()
        return
    
    if args.output:
        with open(args.output, "w") as f:
            f.write(sql)
        print(f"✅ SQL written to {args.output}")
        return
    
    if args.execute:
        # Execute against Supabase using environment variables
        try:
            from supabase import create_client
            
            url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
            
            if not url or not key:
                print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
                sys.exit(1)
            
            client = create_client(url, key)
            # Note: For raw SQL, use Supabase dashboard or psql
            print("⚠️  Raw SQL execution requires direct database access.")
            print("   Use Supabase Dashboard > SQL Editor, or save to file with --output")
        except ImportError:
            print("❌ supabase-py not installed. Use --output to generate SQL file.")
        return
    
    # Default: dry run (print SQL)
    print(sql)


if __name__ == "__main__":
    main()
