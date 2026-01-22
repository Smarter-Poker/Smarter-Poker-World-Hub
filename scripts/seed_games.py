#!/usr/bin/env python3
"""
God Mode Engine - Game Registry Seeder
Parses the 100 Game Titles and inserts into Supabase game_registry table.

Usage:
    python scripts/seed_games.py           # Run the seeder
    python scripts/seed_games.py --dry-run # Preview without inserting
    python scripts/seed_games.py --stats   # Show engine distribution stats
"""

import os
import re
import json
import argparse
from typing import Optional

# Supabase import is optional (only needed for actual insertion)
try:
    from supabase import create_client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    create_client = None

# ============================================================================
# RAW GAME DATA
# ============================================================================

RAW_INPUT = """
🏆 MTT MASTERY
Push/Fold Mastery - Short stack all-in ranges
ICM Fundamentals - Independent chip model basics
Bubble Pressure - Pre-money survival tactics
Final Table ICM - Pay jump optimization
PKO Bounty Hunter - Bounty chip calculations
Satellite Survival - Extreme ICM discipline
Deep Stack MTT - Early tournament strategy
Short Stack Ninja - 10-20BB mastery
Resteal Wars - 3-bet shove defense
Squeeze Master - Multi-way pressure plays
Ante Theft - BB ante exploitation
Big Stack Bully - Covering stack pressure
Ladder Jump - Pay jump patience
3-Max Blitz - Final 3 aggression
Heads Up Duel - 1v1 tournament finale
Chip & Chair - Micro-stack comeback
Blind Defense MTT - Tournament BB play
Button Warfare - BTN open/defend ranges
Stop & Go - Delayed shove tactics
Multi-way Bounty - PKO pot odds overlay
Check-Shove Power - Postflop aggression
Clock Management - Time bank strategy
Registration Edge - Late reg advantages
Triple Barrel - MTT bluff sequences
Level 10: MTT Champion - Full tourney simulation

💵 CASH GAME GRIND
Preflop Blueprint - 6-Max RFI ranges
C-Bet Academy - Continuation bet sizing
Defense Matrix - Facing aggression
Value Extractor - Thin value betting
Bluff Catcher - Hero call decisions
Position Power - IP vs OOP dynamics
3-Bet Pots - Elevated pot strategy
4-Bet Wars - Pre-flop escalation
Deep Stack Cash - 200BB+ strategy
Short Stack Rat - 40BB hit-and-run
Donk Defense - Facing lead bets
River Decisions - Final street mastery
Probe Betting - Taking the initiative
Check-Raise Art - Aggression tactics
Overbetting - Polarized big bets
Multi-way Pots - 3+ player dynamics
Rake Awareness - Rake-adjusted strategy
Blind vs Blind - SB vs BB warfare
Straddle Games - Extended pot dynamics
Table Selection - Finding soft spots
Mixed Strategies - Frequency execution
Texture Reading - Board analysis
Equity Denial - Protection betting
Pot Control - Medium strength hands
Level 10: Cash King - Full session grind

⚡ SPINS & SNG'S
Hyper Opener - 3-Max early game
Jackpot Pressure - High multiplier play
Button Limp - Trap strategies
SNG Endgame - Final 2 battles
Phase Shifting - Stack depth transitions
Limb Trap - Limp-call lines
50/50 Survival - Extreme ICM
Aggression Mode - Constant pressure
Chip Lead Lock - Protecting the lead
Level 10: Spin Master - Full spin simulation

🧠 MENTAL GAME
Tilt Control - Emotional regulation
Timing Discipline - Consistent action speed
Cooler Cage - Bad beat resilience
Pressure Chamber - High stakes decisions
Patience Master - Waiting for spots
Focus Flow - Concentration drills
Result Detachment - Process over outcome
Confidence Builder - Trust your reads
Fear Eraser - Bold decision making
Ego Killer - Humble learning
Session Stamina - Long session focus
Snap Decision - Instinct training
Tell Blindness - Ignoring false reads
Bankroll Mind - Money management
Winners Tilt - Staying sharp ahead
Variance Zen - Accepting swings
Study Habits - Effective learning
Table Image - Perception awareness
Autopilot Escape - Staying present
Level 10: Mind Master - Full mental game

🤖 ADVANCED THEORY
Solver Mimicry - GTO execution
Blocker Logic - Card removal effects
Node Locking - Exploitative trees
Range Construction - Building strategies
Frequency Math - Mixed strategy %
EV Calculations - Expected value math
Indifference Theory - Making villains neutral
Range Advantage - Equity distribution
Nut Advantage - Polarization spots
Board Coverage - Range composition
SPR Mastery - Stack-to-pot ratios
MDF Defender - Minimum defense
Combo Counting - Hand combinations
Bet Sizing Theory - Geometric sizing
Population Reads - Pool tendencies
Exploit Ladder - Deviation strategy
Capped Ranges - Playing condensed
Polarity Index - Range splitting
Solver Scripts - Sim interpretation
Level 10: GTO Apex - Ultimate theory test
"""

# ============================================================================
# ENGINE ASSIGNMENT LOGIC
# ============================================================================

CHART_KEYWORDS = [
    "push/fold", "bubble", "satellite", "icm", "preflop", 
    "bounty", "registration", "ranges", "resteal", "squeeze",
    "ante theft", "chip & chair", "blind defense", "stop & go",
    "50/50", "short stack", "phase shifting"
]

SCENARIO_KEYWORDS = [
    "mental", "tilt", "zen", "focus", "discipline", "ego", 
    "fear", "habits", "mind", "patience", "confidence", 
    "stamina", "detachment", "blindness", "bankroll", 
    "autopilot", "cooler", "pressure chamber", "winners tilt",
    "snap decision", "table image"
]


def determine_engine_type(title: str) -> str:
    """Determine engine type based on title keywords."""
    title_lower = title.lower()
    
    # Check for SCENARIO keywords first (mental game)
    for keyword in SCENARIO_KEYWORDS:
        if keyword in title_lower:
            return "SCENARIO"
    
    # Check for CHART keywords (static ranges)
    for keyword in CHART_KEYWORDS:
        if keyword in title_lower:
            return "CHART"
    
    # Default to PIO (postflop solver)
    return "PIO"


# ============================================================================
# CONFIGURATION LOGIC
# ============================================================================

def determine_stack_depth(title: str) -> int:
    """Determine stack depth based on title keywords."""
    title_lower = title.lower()
    
    if any(kw in title_lower for kw in ["short stack", "push/fold", "10-20bb", "micro-stack"]):
        return 20
    elif any(kw in title_lower for kw in ["deep stack", "200bb"]):
        return 200
    elif "hyper" in title_lower:
        return 10
    else:
        return 100


def determine_players(title: str) -> int:
    """Determine number of players based on title keywords."""
    title_lower = title.lower()
    
    if any(kw in title_lower for kw in ["heads up", "duel", "1v1", "final 2"]):
        return 2
    elif any(kw in title_lower for kw in ["3-max", "spin", "sng"]):
        return 3
    else:
        return 6


def determine_category(title: str, section: str) -> str:
    """Determine category based on section header."""
    if "MTT" in section:
        return "MTT"
    elif "CASH" in section:
        return "CASH"
    elif "SPIN" in section or "SNG" in section:
        return "SPINS"
    elif "MENTAL" in section:
        return "PSYCHOLOGY"
    elif "ADVANCED" in section or "THEORY" in section:
        return "ADVANCED"
    return "OTHER"


def build_config(title: str, description: str) -> dict:
    """Build the config JSON for a game."""
    return {
        "stack": determine_stack_depth(title),
        "players": determine_players(title),
        "description": description,
        "difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100],
        "hands_per_round": 20,
        "max_level": 10
    }


def title_to_slug(title: str) -> str:
    """Convert title to URL-friendly slug."""
    slug = title.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)  # Remove special chars
    slug = re.sub(r'\s+', '-', slug)  # Replace spaces with hyphens
    slug = re.sub(r'-+', '-', slug)  # Remove duplicate hyphens
    return slug.strip('-')


# ============================================================================
# PARSER
# ============================================================================

def parse_games() -> list[dict]:
    """Parse the raw input and return list of game records."""
    games = []
    current_section = ""
    
    for line in RAW_INPUT.strip().split('\n'):
        line = line.strip()
        
        # Skip empty lines
        if not line:
            continue
        
        # Detect section headers (emoji lines)
        if line.startswith(('🏆', '💵', '⚡', '🧠', '🤖')):
            current_section = line
            continue
        
        # Parse game line: "Title - Description"
        if ' - ' not in line:
            continue
            
        parts = line.split(' - ', 1)
        if len(parts) != 2:
            continue
            
        title, description = parts[0].strip(), parts[1].strip()
        
        # Build game record
        game = {
            "title": title,
            "slug": title_to_slug(title),
            "engine_type": determine_engine_type(title),
            "category": determine_category(title, current_section),
            "config": build_config(title, description),
            "description": description,
            "is_active": True,
            "is_premium": False
        }
        
        games.append(game)
    
    return games


# ============================================================================
# SUPABASE OPERATIONS
# ============================================================================

def get_supabase_client():
    """Create Supabase client from environment variables."""
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    
    if not url or not key:
        raise ValueError(
            "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_KEY environment variables."
        )
    
    return create_client(url, key)


def upsert_games(games: list[dict], dry_run: bool = False) -> dict:
    """Upsert games into game_registry table."""
    if dry_run:
        print("\n🔍 DRY RUN - No data will be inserted\n")
        for i, game in enumerate(games, 1):
            print(f"{i:3}. [{game['engine_type']:8}] {game['title']}")
        return {"inserted": 0, "total": len(games)}
    
    client = get_supabase_client()
    
    # Upsert each game (on conflict, update)
    inserted = 0
    for game in games:
        try:
            result = client.table("game_registry").upsert(
                game,
                on_conflict="slug"
            ).execute()
            inserted += 1
            print(f"✅ {game['title']}")
        except Exception as e:
            print(f"❌ {game['title']}: {e}")
    
    return {"inserted": inserted, "total": len(games)}


def show_stats(games: list[dict]):
    """Display engine distribution statistics."""
    stats = {"PIO": 0, "CHART": 0, "SCENARIO": 0}
    categories = {}
    
    for game in games:
        stats[game["engine_type"]] += 1
        cat = game["category"]
        categories[cat] = categories.get(cat, 0) + 1
    
    print("\n" + "=" * 50)
    print("📊 ENGINE DISTRIBUTION")
    print("=" * 50)
    for engine, count in sorted(stats.items(), key=lambda x: -x[1]):
        bar = "█" * count
        print(f"  {engine:10} {count:3} {bar}")
    print(f"  {'TOTAL':10} {sum(stats.values()):3}")
    
    print("\n" + "=" * 50)
    print("📂 CATEGORY BREAKDOWN")
    print("=" * 50)
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat:12} {count:3}")
    print()


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Seed game_registry table with 100 games")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting")
    parser.add_argument("--stats", action="store_true", help="Show engine distribution stats")
    parser.add_argument("--output", type=str, help="Output SQL file instead of inserting")
    args = parser.parse_args()
    
    print("\n🎮 GOD MODE ENGINE - Game Seeder")
    print("=" * 50)
    
    # Parse games
    games = parse_games()
    print(f"📋 Parsed {len(games)} games from raw input\n")
    
    # Show stats
    if args.stats:
        show_stats(games)
        return
    
    # Output SQL file
    if args.output:
        generate_sql(games, args.output)
        return
    
    # Upsert to database
    result = upsert_games(games, dry_run=args.dry_run)
    
    print("\n" + "=" * 50)
    print(f"✅ Inserted {result['inserted']}/{result['total']} games")
    show_stats(games)


def generate_sql(games: list[dict], output_path: str):
    """Generate SQL INSERT statements for the games."""
    lines = [
        "-- ════════════════════════════════════════════════════════════════════════════",
        "-- GOD MODE ENGINE — Game Registry Seed",
        "-- Auto-generated by seed_games.py",
        f"-- {len(games)} Games with auto-assigned engine types and configs",
        "-- ════════════════════════════════════════════════════════════════════════════",
        "",
        "INSERT INTO game_registry (title, slug, engine_type, category, config, description)",
        "VALUES"
    ]
    
    values = []
    for game in games:
        config_json = json.dumps(game["config"]).replace("'", "''")
        title = game["title"].replace("'", "''")
        desc = game["description"].replace("'", "''")
        slug = game["slug"]
        engine = game["engine_type"]
        category = game["category"]
        
        values.append(
            f"    ('{title}', '{slug}', '{engine}', '{category}', "
            f"'{config_json}'::jsonb, '{desc}')"
        )
    
    lines.append(",\n".join(values))
    lines.append("ON CONFLICT (slug) DO UPDATE SET")
    lines.append("    engine_type = EXCLUDED.engine_type,")
    lines.append("    config = EXCLUDED.config,")
    lines.append("    description = EXCLUDED.description,")
    lines.append("    updated_at = NOW();")
    
    # Add stats comment
    stats = {"PIO": 0, "CHART": 0, "SCENARIO": 0}
    for game in games:
        stats[game["engine_type"]] += 1
    
    lines.append("")
    lines.append("-- ════════════════════════════════════════════════════════════════════════════")
    lines.append(f"-- Engine Distribution: PIO={stats['PIO']}, CHART={stats['CHART']}, SCENARIO={stats['SCENARIO']}")
    lines.append("-- ════════════════════════════════════════════════════════════════════════════")
    
    with open(output_path, 'w') as f:
        f.write("\n".join(lines))
    
    print(f"📄 Generated SQL file: {output_path}")
    print(f"   PIO={stats['PIO']}, CHART={stats['CHART']}, SCENARIO={stats['SCENARIO']}")


if __name__ == "__main__":
    main()
