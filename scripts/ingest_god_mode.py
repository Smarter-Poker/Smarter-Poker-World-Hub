#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
GOD MODE OMNI-INGEST SCRIPT
═══════════════════════════════════════════════════════════════════════════
Ingests "Round Robin" solver output from Windows machine into Supabase.
Handles mixed streams of Flop/Turn/River data across all variables.

Author: Antigravity AI
Version: 1.0.0 (God Mode Protocol)
═══════════════════════════════════════════════════════════════════════════
"""

import os
import sys
import csv
import json
import hashlib
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime

# Supabase client
from supabase import create_client, Client

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

SUPABASE_URL = os.getenv('SUPABASE_URL', 'YOUR_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'YOUR_SUPABASE_KEY')

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Valid enum values (must match database schema)
VALID_STREETS = ['Flop', 'Turn', 'River']
VALID_STACKS = [20, 40, 60, 80, 100, 200]
VALID_GAME_TYPES = ['Cash', 'MTT', 'Spin']
VALID_TOPOLOGIES = ['HU', '3-Max', '6-Max', '9-Max']
VALID_MODES = ['ChipEV', 'ICM', 'PKO']

# ═══════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def extract_board_from_filename(filename: str) -> Optional[List[str]]:
    """
    Extract board cards from filename.
    Examples:
      - Board_AsKs2d.csv → ['As', 'Ks', '2d']
      - Board_AsKs2d3c.csv → ['As', 'Ks', '2d', '3c']
      - Board_AsKs2d3c7h.csv → ['As', 'Ks', '2d', '3c', '7h']
    """
    match = re.search(r'Board_([A-Z0-9a-z]+)\.csv', filename)
    if not match:
        return None
    
    board_str = match.group(1)
    # Parse cards (2 chars each: rank + suit)
    cards = []
    for i in range(0, len(board_str), 2):
        if i + 1 < len(board_str):
            cards.append(board_str[i:i+2])
    
    return cards if len(cards) in [3, 4, 5] else None


def detect_street_from_board(board: List[str]) -> str:
    """Determine street from board card count."""
    count = len(board)
    if count == 3:
        return 'Flop'
    elif count == 4:
        return 'Turn'
    elif count == 5:
        return 'River'
    else:
        raise ValueError(f"Invalid board card count: {count}")


def parse_path_variables(file_path: Path) -> Dict[str, any]:
    """
    Auto-detect variables from folder structure.
    
    Expected structure:
    /Raw/MTT/ICM/20bb/Turn/Board_AsKs2d3c.csv
    /Raw/Cash/ChipEV/100bb/Flop/Board_Ah7h2c.csv
    /Raw/Spin/ChipEV/40bb/River/Board_Kd9s3h5c2d.csv
    
    Returns dict with: game_type, mode, stack_depth, street (optional)
    """
    parts = file_path.parts
    variables = {}
    
    # Game Type
    for part in parts:
        if part in VALID_GAME_TYPES:
            variables['game_type'] = part
            break
    
    # Mode
    for part in parts:
        if part in VALID_MODES:
            variables['mode'] = part
            break
    
    # Stack Depth (extract number + 'bb')
    for part in parts:
        match = re.search(r'(\d+)bb', part, re.IGNORECASE)
        if match:
            stack = int(match.group(1))
            if stack in VALID_STACKS:
                variables['stack_depth'] = stack
                break
    
    # Street (optional - can also detect from board)
    for part in parts:
        if part in VALID_STREETS:
            variables['street'] = part
            break
    
    # Topology (default to HU if not specified, or detect from filename)
    # You can add topology detection logic here if encoded in path
    variables.setdefault('topology', 'HU')  # Default assumption
    
    return variables


def generate_scenario_hash(board: List[str], variables: Dict) -> str:
    """
    Generate unique scenario hash.
    Format: "As7d2h_BTN_vs_BB_40bb_MTT_ICM_Turn"
    """
    board_str = ''.join(board)
    position = variables.get('position', 'BTN_vs_BB')  # Default position
    stack = variables.get('stack_depth', 40)
    game_type = variables.get('game_type', 'Cash')
    mode = variables.get('mode', 'ChipEV')
    street = variables['street']
    
    hash_str = f"{board_str}_{position}_{stack}bb_{game_type}_{mode}_{street}"
    return hash_str


def calculate_ev_loss(max_ev: float, action_ev: float) -> float:
    """Calculate EV loss for an action."""
    return max(0, max_ev - action_ev)


def is_mixed_strategy(actions: Dict) -> bool:
    """Check if hand uses mixed strategy (multiple actions >5% frequency)."""
    significant_actions = [
        action for action, data in actions.items()
        if data.get('freq', 0) > 0.05
    ]
    return len(significant_actions) > 1


def process_csv_file(file_path: Path) -> Optional[Dict]:
    """
    Process a single CSV file from PioSOLVER output.
    
    Expected CSV format:
    Hand,Fold_EV,Call_EV,Raise_EV,Fold_Freq,Call_Freq,Raise_Freq,Raise_Size
    AhKd,0.0,8.2,10.5,0.0,0.0,1.0,66%
    QsJh,0.0,5.2,5.3,0.0,0.55,0.45,75%
    ...
    """
    # Extract variables from path
    variables = parse_path_variables(file_path)
    
    # Extract board from filename
    board = extract_board_from_filename(file_path.name)
    if not board:
        print(f"⚠️  Could not parse board from filename: {file_path.name}")
        return None
    
    # Detect street from board
    detected_street = detect_street_from_board(board)
    variables['street'] = variables.get('street', detected_street)
    
    # Validate required variables
    required = ['game_type', 'mode', 'stack_depth', 'street']
    if not all(k in variables for k in required):
        print(f"⚠️  Missing required variables in path: {file_path}")
        print(f"    Found: {variables}")
        return None
    
    # Generate scenario hash
    scenario_hash = generate_scenario_hash(board, variables)
    
    # Check if already processed
    existing = supabase.table('solved_spots_gold')\
        .select('id')\
        .eq('scenario_hash', scenario_hash)\
        .execute()
    
    if existing.data:
        print(f"⏭️  Skipping duplicate: {scenario_hash}")
        return None
    
    # Parse CSV and build strategy matrix
    strategy_matrix = {}
    macro_metrics = {
        'hero_range_adv': 0.0,
        'villain_range_adv': 0.0,
        'total_hero_ev': 0.0,
        'total_villain_ev': 0.0,
        'hand_count': 0
    }
    
    try:
        with open(file_path, 'r',

 encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            for row in reader:
                hand = row.get('Hand', '').strip()
                if not hand or len(hand) < 2:
                    continue
                
                # Parse action EVs
                fold_ev = float(row.get('Fold_EV', 0))
                call_ev = float(row.get('Call_EV', 0))
                raise_ev = float(row.get('Raise_EV', 0))
                
                # Parse frequencies
                fold_freq = float(row.get('Fold_Freq', 0))
                call_freq = float(row.get('Call_Freq', 0))
                raise_freq = float(row.get('Raise_Freq', 0))
                
                # Parse raise size
                raise_size = row.get('Raise_Size', '').strip()
                
                # Determine best action and max EV
                action_evs = {
                    'Fold': fold_ev,
                    'Call': call_ev,
                    'Raise': raise_ev
                }
                max_ev = max(action_evs.values())
                best_action = max(action_evs, key=action_evs.get)
                
                # Build actions dict
                actions = {
                    'Fold': {
                        'ev': fold_ev,
                        'freq': fold_freq,
                        'ev_loss': calculate_ev_loss(max_ev, fold_ev)
                    },
                    'Call': {
                        'ev': call_ev,
                        'freq': call_freq,
                        'ev_loss': calculate_ev_loss(max_ev, call_ev)
                    },
                    'Raise': {
                        'ev': raise_ev,
                        'freq': raise_freq,
                        'ev_loss': calculate_ev_loss(max_ev, raise_ev),
                        'size': raise_size
                    }
                }
                
                # Check if mixed strategy
                is_mixed = is_mixed_strategy(actions)
                
                # Build hand entry
                strategy_matrix[hand] = {
                    'best_action': 'Mixed' if is_mixed else best_action,
                    'max_ev': max_ev,
                    'ev_loss': 0,  # Best action has 0 EV loss
                    'actions': actions,
                    'is_mixed': is_mixed
                }
                
                # Update macro metrics
                macro_metrics['total_hero_ev'] += max_ev
                macro_metrics['hand_count'] += 1
        
        # Calculate range advantage
        if macro_metrics['hand_count'] > 0:
            avg_hero_ev = macro_metrics['total_hero_ev'] / macro_metrics['hand_count']
            macro_metrics['avg_hero_ev'] = avg_hero_ev
            # Range advantage is simplified here - you can enhance this
            macro_metrics['hero_range_adv'] = avg_hero_ev / 100 if avg_hero_ev > 0 else 0
        
        # Build final record
        record = {
            'scenario_hash': scenario_hash,
            'street': variables['street'],
            'stack_depth': variables['stack_depth'],
            'game_type': variables['game_type'],
            'topology': variables.get('topology', 'HU'),
            'mode': variables['mode'],
            'board_cards': board,
            'macro_metrics': macro_metrics,
            'strategy_matrix': strategy_matrix
        }
        
        return record
        
    except Exception as e:
        print(f"❌ Error processing {file_path}: {e}")
        return None


def ingest_file(file_path: Path) -> bool:
    """Ingest a single file into the database."""
    record = process_csv_file(file_path)
    if not record:
        return False
    
    try:
        result = supabase.table('solved_spots_gold').insert(record).execute()
        print(f"✅ Inserted: {record['scenario_hash']}")
        return True
    except Exception as e:
        print(f"❌ Failed to insert {record['scenario_hash']}: {e}")
        return False


def scan_directory(root_dir: Path) -> List[Path]:
    """Recursively scan directory for CSV files."""
    csv_files = []
    for path in root_dir.rglob('*.csv'):
        if path.is_file():
            csv_files.append(path)
    return csv_files


# ═══════════════════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ═══════════════════════════════════════════════════════════════════════════

def main():
    """Main ingestion loop."""
    print("═" * 80)
    print("GOD MODE OMNI-INGEST SCRIPT")
    print("═" * 80)
    
    # Get root directory from command line or use default
    if len(sys.argv) > 1:
        root_dir = Path(sys.argv[1])
    else:
        root_dir = Path('./Raw')  # Default directory
    
    if not root_dir.exists():
        print(f"❌ Directory not found: {root_dir}")
        sys.exit(1)
    
    print(f"📁 Scanning: {root_dir.absolute()}")
    
    # Find all CSV files
    csv_files = scan_directory(root_dir)
    total = len(csv_files)
    
    print(f"📊 Found {total} CSV files")
    print("─" * 80)
    
    # Process each file
    success_count = 0
    skip_count = 0
    fail_count = 0
    
    for i, file_path in enumerate(csv_files, 1):
        print(f"[{i}/{total}] Processing: {file_path.name}")
        
        result = ingest_file(file_path)
        if result:
            success_count += 1
        elif result is None:
            skip_count += 1
        else:
            fail_count += 1
        
        # Progress update every 100 files
        if i % 100 == 0:
            print(f"📈 Progress: {i}/{total} ({success_count} inserted, {skip_count} skipped, {fail_count} failed)")
    
    print("─" * 80)
    print("✅ INGESTION COMPLETE")
    print(f"   Total files: {total}")
    print(f"   ✅ Inserted: {success_count}")
    print(f"   ⏭️  Skipped: {skip_count}")
    print(f"   ❌ Failed: {fail_count}")
    print("═" * 80)


if __name__ == '__main__':
    main()
