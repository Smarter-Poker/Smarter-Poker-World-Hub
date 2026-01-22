"""
🎮 GOD MODE ENGINE — Core Game Engine
═══════════════════════════════════════════════════════════════════════════
The brain of the training system. Handles:
- Suit Isomorphism (rotate suits so hands look unique)
- Active Villain (weighted RNG for opponent actions)
- Damage Calculation (EV loss -> health bar penalty)
═══════════════════════════════════════════════════════════════════════════
"""

import random
import hashlib
import json
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════
# CONSTANTS & ENUMS
# ═══════════════════════════════════════════════════════════════════════════

class EngineType(Enum):
    PIO = "PIO"           # Postflop solver (solved_spots_gold)
    CHART = "CHART"       # Preflop/ICM static charts
    SCENARIO = "SCENARIO" # Mental game with rigged RNG


class Action(Enum):
    FOLD = "fold"
    CHECK = "check"
    CALL = "call"
    BET = "bet"
    RAISE = "raise"
    ALLIN = "allin"


# The 4 possible suit rotation mappings (cyclic permutations)
SUIT_ROTATIONS = {
    0: {'s': 's', 'h': 'h', 'd': 'd', 'c': 'c'},  # Identity
    1: {'s': 'h', 'h': 'd', 'd': 'c', 'c': 's'},  # Rotate +1
    2: {'s': 'd', 'h': 'c', 'd': 's', 'c': 'h'},  # Rotate +2
    3: {'s': 'c', 'h': 's', 'd': 'h', 'c': 'd'},  # Rotate +3
}

# Reverse mappings for display
SUIT_SYMBOLS = {'s': '♠', 'h': '♥', 'd': '♦', 'c': '♣'}


# ═══════════════════════════════════════════════════════════════════════════
# DATA CLASSES
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class HandState:
    """Represents a poker hand state for training."""
    file_id: str                    # Source file/record ID
    variant_hash: str               # Suit rotation used (0-3)
    hero_hand: str                  # Hero's cards (post-rotation)
    board: str                      # Community cards (post-rotation)
    pot_size: float                 # Current pot
    hero_stack: float               # Hero's remaining stack
    villain_stack: float            # Villain's remaining stack
    position: str                   # Hero's position (BTN, CO, etc.)
    street: str                     # Current street (preflop, flop, turn, river)
    action_history: List[str]       # Actions so far
    solver_node: Dict[str, Any]     # GTO solution data


@dataclass
class VillainAction:
    """Result of villain's weighted random action."""
    action: Action
    sizing: Optional[float] = None  # Bet/raise size if applicable
    frequency: float = 0.0          # How often villain takes this action


@dataclass
class DamageResult:
    """Result of damage calculation."""
    is_correct: bool
    is_indifferent: bool            # True if GTO was mixed (50/50)
    ev_loss: float                  # EV difference
    chip_penalty: int               # Health bar damage (0-25)
    feedback: str                   # Explanation for user


# ═══════════════════════════════════════════════════════════════════════════
# GAME ENGINE CLASS
# ═══════════════════════════════════════════════════════════════════════════

class GameEngine:
    """
    Core engine for God Mode training system.
    
    Handles the 3-engine architecture:
    - ENGINE A (PIO): Postflop solver with isomorphism
    - ENGINE B (CHART): Static preflop/ICM charts
    - ENGINE C (SCENARIO): Scripted mental game scenarios
    """
    
    def __init__(self, supabase_client=None):
        """
        Initialize the game engine.
        
        Args:
            supabase_client: Supabase client for database access
        """
        self.supabase = supabase_client
        self._chart_cache: Dict[str, Any] = {}
        self._scenario_cache: Dict[str, Any] = {}
    
    # ═══════════════════════════════════════════════════════════════════════
    # SUIT ISOMORPHISM — The "Suit Spinner"
    # ═══════════════════════════════════════════════════════════════════════
    
    @staticmethod
    def rotate_suits(cards: str, rotation_key: int) -> str:
        """
        Apply suit rotation to a card string.
        
        Args:
            cards: Card string like "AhKd" or "Qh7h2c"
            rotation_key: Rotation index (0-3)
            
        Returns:
            Rotated card string (e.g., "AdKc" if rotation=1)
        """
        if rotation_key not in SUIT_ROTATIONS:
            raise ValueError(f"Invalid rotation key: {rotation_key}. Must be 0-3.")
        
        suit_map = SUIT_ROTATIONS[rotation_key]
        result = []
        
        i = 0
        while i < len(cards):
            # Get rank (could be 2-9, T, J, Q, K, A)
            rank = cards[i]
            i += 1
            
            # Get suit
            if i < len(cards) and cards[i] in 'shdc':
                suit = cards[i]
                result.append(rank + suit_map[suit])
                i += 1
            else:
                result.append(rank)
        
        return ''.join(result)
    
    @staticmethod
    def rotate_hand_state(hand_data: Dict[str, Any], rotation_key: int) -> Dict[str, Any]:
        """
        Apply suit rotation to an entire hand state.
        
        Args:
            hand_data: Raw hand data from solver
            rotation_key: Rotation index (0-3)
            
        Returns:
            Hand data with all cards rotated
        """
        rotated = hand_data.copy()
        
        # Rotate hero hand
        if 'hero_hand' in rotated:
            rotated['hero_hand'] = GameEngine.rotate_suits(rotated['hero_hand'], rotation_key)
        
        # Rotate board
        if 'board' in rotated:
            rotated['board'] = GameEngine.rotate_suits(rotated['board'], rotation_key)
        
        # Rotate any villain hands in the solution
        if 'villain_range' in rotated and isinstance(rotated['villain_range'], list):
            rotated['villain_range'] = [
                GameEngine.rotate_suits(h, rotation_key) for h in rotated['villain_range']
            ]
        
        return rotated
    
    @staticmethod
    def generate_variant_hash(file_id: str, rotation_key: int) -> str:
        """
        Generate a unique hash for this file + rotation combination.
        
        Args:
            file_id: Source file/record ID
            rotation_key: Rotation index (0-3)
            
        Returns:
            Hash string for uniqueness checking
        """
        return str(rotation_key)  # Simple: just use the rotation key
    
    # ═══════════════════════════════════════════════════════════════════════
    # HAND FETCHING — Main Entry Point
    # ═══════════════════════════════════════════════════════════════════════
    
    async def fetch_hand(self, user_id: str, game_id: str) -> Optional[HandState]:
        """
        Fetch a training hand for the user.
        
        CRITICAL LOGIC:
        1. Look up game config to determine engine type
        2. Fetch candidate hand from appropriate source
        3. Apply suit rotation (isomorphism)
        4. Verify user hasn't seen this exact rotation
        5. Return the hand state
        
        Args:
            user_id: User's UUID
            game_id: Game's UUID
            
        Returns:
            HandState ready for training, or None if no hands available
        """
        # 1. Get game config
        game_config = await self._get_game_config(game_id)
        if not game_config:
            raise ValueError(f"Game not found: {game_id}")
        
        engine_type = EngineType(game_config['engine_type'])
        
        # 2. Get user's seen hands for this game
        seen_variants = await self._get_user_seen_variants(user_id, game_id)
        
        # 3. Fetch hand based on engine type
        if engine_type == EngineType.PIO:
            return await self._fetch_pio_hand(user_id, game_id, game_config, seen_variants)
        elif engine_type == EngineType.CHART:
            return await self._fetch_chart_hand(user_id, game_id, game_config, seen_variants)
        elif engine_type == EngineType.SCENARIO:
            return await self._fetch_scenario_hand(user_id, game_id, game_config, seen_variants)
        else:
            raise ValueError(f"Unknown engine type: {engine_type}")
    
    async def _fetch_pio_hand(
        self, 
        user_id: str, 
        game_id: str, 
        config: Dict, 
        seen_variants: set
    ) -> Optional[HandState]:
        """
        Fetch a hand from PioSolver data (solved_spots_gold).
        
        Implements:
        - Random hand selection from solver database
        - Suit isomorphism to ensure visual uniqueness
        - Variant checking against user history
        """
        # Query solved_spots_gold for matching hands
        query = self.supabase.table('solved_spots_gold').select('*')
        
        # Apply game-specific filters
        if 'stack_depth' in config.get('config', {}):
            stack = config['config']['stack_depth']
            query = query.gte('effective_stack', stack - 10).lte('effective_stack', stack + 10)
        
        if 'street_filter' in config.get('config', {}):
            query = query.eq('street', config['config']['street_filter'])
        
        # Fetch candidates
        response = query.limit(100).execute()
        candidates = response.data if response.data else []
        
        if not candidates:
            return None
        
        # Shuffle and find a hand + rotation not yet seen
        random.shuffle(candidates)
        
        for candidate in candidates:
            file_id = candidate['id']
            
            # Try each rotation
            for rotation_key in random.sample([0, 1, 2, 3], 4):
                variant_hash = self.generate_variant_hash(file_id, rotation_key)
                
                # Check if user has seen this exact rotation
                if (file_id, variant_hash) not in seen_variants:
                    # Apply rotation
                    rotated_data = self.rotate_hand_state(candidate, rotation_key)
                    
                    return HandState(
                        file_id=file_id,
                        variant_hash=variant_hash,
                        hero_hand=rotated_data.get('hero_hand', ''),
                        board=rotated_data.get('board', ''),
                        pot_size=rotated_data.get('pot_size', 0),
                        hero_stack=rotated_data.get('hero_stack', 0),
                        villain_stack=rotated_data.get('villain_stack', 0),
                        position=rotated_data.get('position', ''),
                        street=rotated_data.get('street', ''),
                        action_history=rotated_data.get('action_history', []),
                        solver_node=rotated_data.get('solver_node', {})
                    )
        
        # All hands exhausted for this user!
        return None
    
    async def _fetch_chart_hand(
        self, 
        user_id: str, 
        game_id: str, 
        config: Dict, 
        seen_variants: set
    ) -> Optional[HandState]:
        """Fetch a hand from static preflop/ICM charts."""
        # Load chart data (cached)
        chart_key = config.get('config', {}).get('chart_key', 'default')
        
        if chart_key not in self._chart_cache:
            # Load from JSON file or database
            self._chart_cache[chart_key] = await self._load_chart(chart_key)
        
        chart_data = self._chart_cache[chart_key]
        
        # Generate a random preflop scenario
        # For charts, we don't need solver data - just the situation
        hands = list(chart_data.get('ranges', {}).keys())
        random.shuffle(hands)
        
        for hand in hands:
            file_id = f"chart_{chart_key}_{hand}"
            variant_hash = "0"  # Charts don't need rotation
            
            if (file_id, variant_hash) not in seen_variants:
                return HandState(
                    file_id=file_id,
                    variant_hash=variant_hash,
                    hero_hand=hand,
                    board="",  # Preflop
                    pot_size=chart_data.get('pot_size', 2.5),
                    hero_stack=config.get('config', {}).get('stack_depth', 20),
                    villain_stack=config.get('config', {}).get('stack_depth', 20),
                    position=random.choice(['BTN', 'CO', 'HJ', 'LJ', 'SB', 'BB']),
                    street='preflop',
                    action_history=[],
                    solver_node={'action': chart_data['ranges'].get(hand, 'fold')}
                )
        
        return None
    
    async def _fetch_scenario_hand(
        self, 
        user_id: str, 
        game_id: str, 
        config: Dict, 
        seen_variants: set
    ) -> Optional[HandState]:
        """Fetch a scripted mental game scenario."""
        scenario_type = config.get('config', {}).get('scenario_type', 'bad_beat')
        
        # Scripted scenarios for mental game training
        scenarios = self._get_scenarios(scenario_type)
        random.shuffle(scenarios)
        
        for scenario in scenarios:
            file_id = scenario['id']
            variant_hash = "0"
            
            if (file_id, variant_hash) not in seen_variants:
                return HandState(
                    file_id=file_id,
                    variant_hash=variant_hash,
                    hero_hand=scenario['hero_hand'],
                    board=scenario['board'],
                    pot_size=scenario['pot_size'],
                    hero_stack=scenario['hero_stack'],
                    villain_stack=scenario['villain_stack'],
                    position=scenario['position'],
                    street=scenario['street'],
                    action_history=scenario.get('action_history', []),
                    solver_node=scenario.get('solver_node', {})
                )
        
        return None
    
    # ═══════════════════════════════════════════════════════════════════════
    # ACTIVE VILLAIN — Weighted RNG for Opponent Actions
    # ═══════════════════════════════════════════════════════════════════════
    
    @staticmethod
    def resolve_villain_action(solver_node: Dict[str, Any]) -> VillainAction:
        """
        Determine villain's action using weighted random selection.
        
        Input: Solver frequencies like:
        {
            "actions": {
                "check": {"frequency": 0.6, "ev": 0.5},
                "bet_50": {"frequency": 0.25, "ev": 0.7},
                "bet_100": {"frequency": 0.15, "ev": 0.65}
            }
        }
        
        Logic: Use random.random() to pick action based on frequencies.
        
        Args:
            solver_node: GTO solution with action frequencies
            
        Returns:
            VillainAction with the chosen action
        """
        actions = solver_node.get('actions', {})
        
        if not actions:
            # Default to check if no actions specified
            return VillainAction(action=Action.CHECK, frequency=1.0)
        
        # Build cumulative probability distribution
        cumulative = []
        running_total = 0.0
        
        for action_key, action_data in actions.items():
            freq = action_data.get('frequency', 0)
            running_total += freq
            cumulative.append((running_total, action_key, action_data))
        
        # Normalize if frequencies don't sum to 1
        if running_total > 0:
            cumulative = [(c / running_total, k, d) for c, k, d in cumulative]
        
        # Roll the dice
        roll = random.random()
        
        for threshold, action_key, action_data in cumulative:
            if roll <= threshold:
                # Parse action type and sizing
                action, sizing = GameEngine._parse_action_key(action_key)
                
                return VillainAction(
                    action=action,
                    sizing=sizing,
                    frequency=action_data.get('frequency', 0)
                )
        
        # Fallback (shouldn't happen with normalized probabilities)
        return VillainAction(action=Action.CHECK, frequency=1.0)
    
    @staticmethod
    def _parse_action_key(action_key: str) -> Tuple[Action, Optional[float]]:
        """Parse action key like 'bet_50' into (Action.BET, 50)."""
        action_key = action_key.lower()
        
        if action_key == 'check':
            return Action.CHECK, None
        elif action_key == 'fold':
            return Action.FOLD, None
        elif action_key == 'call':
            return Action.CALL, None
        elif action_key.startswith('bet_'):
            try:
                sizing = float(action_key.split('_')[1])
                return Action.BET, sizing
            except (IndexError, ValueError):
                return Action.BET, None
        elif action_key.startswith('raise_'):
            try:
                sizing = float(action_key.split('_')[1])
                return Action.RAISE, sizing
            except (IndexError, ValueError):
                return Action.RAISE, None
        elif action_key in ('allin', 'all_in', 'all-in'):
            return Action.ALLIN, None
        else:
            # Try to match action name
            for action in Action:
                if action.value in action_key:
                    return action, None
            return Action.CHECK, None
    
    # ═══════════════════════════════════════════════════════════════════════
    # DAMAGE CALCULATION — EV Loss to Health Bar Penalty
    # ═══════════════════════════════════════════════════════════════════════
    
    @staticmethod
    def calculate_damage(
        user_action: str, 
        user_sizing: Optional[float],
        solver_node: Dict[str, Any],
        pot_size: float = 100.0
    ) -> DamageResult:
        """
        Calculate health bar damage based on EV loss.
        
        INDIFFERENCE RULE: If GTO strategy is mixed (50/50), 
        accept BOTH answers as correct.
        
        Args:
            user_action: User's chosen action ("fold", "call", "raise", etc.)
            user_sizing: User's bet/raise sizing if applicable
            solver_node: GTO solution data
            pot_size: Current pot size for scaling
            
        Returns:
            DamageResult with correctness, EV loss, and chip penalty
        """
        actions = solver_node.get('actions', {})
        
        # Find the user's action in solver data
        user_action_key = GameEngine._find_matching_action(user_action, user_sizing, actions)
        user_action_data = actions.get(user_action_key, {})
        
        # Get user's EV and frequency
        user_ev = user_action_data.get('ev', 0)
        user_freq = user_action_data.get('frequency', 0)
        
        # Find max EV action
        max_ev = max((a.get('ev', 0) for a in actions.values()), default=0)
        max_ev_actions = [k for k, v in actions.items() if v.get('ev', 0) == max_ev]
        
        # Calculate EV loss
        ev_loss = max(0, max_ev - user_ev)
        
        # Check for indifference (mixed strategy where user's action is significant)
        is_indifferent = user_freq >= 0.40  # 40% or more = acceptable
        
        # Determine correctness
        # Correct if: user picked max EV action OR action is indifferent
        is_correct = (user_action_key in max_ev_actions) or is_indifferent
        
        # Calculate chip penalty (0-25 based on EV loss relative to pot)
        if is_correct:
            chip_penalty = 0
            feedback = "✓ Correct! " + (
                "GTO play." if user_action_key in max_ev_actions 
                else f"Mixed strategy - {user_freq:.0%} frequency is acceptable."
            )
        else:
            # Scale EV loss to chip penalty
            # EV loss of 10% pot = ~2.5 chips, 100% pot = 25 chips
            relative_loss = ev_loss / pot_size if pot_size > 0 else 0
            chip_penalty = min(25, max(1, int(relative_loss * 25)))
            
            # Generate feedback
            best_action = max_ev_actions[0] if max_ev_actions else "unknown"
            feedback = f"✗ {best_action.upper()} was {max_ev:.2f} EV. You lost {ev_loss:.2f} EV (-{chip_penalty} chips)"
        
        return DamageResult(
            is_correct=is_correct,
            is_indifferent=is_indifferent,
            ev_loss=ev_loss,
            chip_penalty=chip_penalty,
            feedback=feedback
        )
    
    @staticmethod
    def _find_matching_action(
        user_action: str, 
        user_sizing: Optional[float], 
        actions: Dict[str, Any]
    ) -> str:
        """Find the solver action key that matches user's action."""
        user_action = user_action.lower()
        
        # Direct match
        if user_action in actions:
            return user_action
        
        # Match with sizing
        if user_sizing is not None:
            sized_key = f"{user_action}_{int(user_sizing)}"
            if sized_key in actions:
                return sized_key
            
            # Find closest sizing
            for key in actions:
                if key.startswith(user_action):
                    return key
        
        # Partial match
        for key in actions:
            if user_action in key:
                return key
        
        # No match - return user action anyway for EV=0 default
        return user_action
    
    # ═══════════════════════════════════════════════════════════════════════
    # HELPER METHODS
    # ═══════════════════════════════════════════════════════════════════════
    
    async def _get_game_config(self, game_id: str) -> Optional[Dict]:
        """Fetch game configuration from database."""
        if not self.supabase:
            return None
        
        response = self.supabase.table('game_registry').select('*').eq('id', game_id).single().execute()
        return response.data if response.data else None
    
    async def _get_user_seen_variants(self, user_id: str, game_id: str) -> set:
        """Get set of (file_id, variant_hash) tuples user has already seen."""
        if not self.supabase:
            return set()
        
        response = (
            self.supabase
            .table('god_mode_hand_history')
            .select('source_file_id, variant_hash')
            .eq('user_id', user_id)
            .eq('game_id', game_id)
            .execute()
        )
        
        return {(r['source_file_id'], r['variant_hash']) for r in (response.data or [])}
    
    async def _load_chart(self, chart_key: str) -> Dict:
        """Load chart data from file or database."""
        # TODO: Implement chart loading from charts.json
        return {
            'ranges': {
                'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise',
                'AKs': 'raise', 'AQs': 'raise', 'AKo': 'raise',
                # ... more hands
            },
            'pot_size': 2.5
        }
    
    def _get_scenarios(self, scenario_type: str) -> List[Dict]:
        """Get scripted scenarios for mental game training."""
        # Bad beat scenarios to test tilt control
        if scenario_type == 'bad_beat':
            return [
                {
                    'id': 'bb_001',
                    'hero_hand': 'AhAs',
                    'board': 'Ad7c2s8h9h',
                    'pot_size': 200,
                    'hero_stack': 0,  # All-in
                    'villain_stack': 0,
                    'position': 'BTN',
                    'street': 'river',
                    'description': 'You had set of Aces. Villain hit runner-runner flush.',
                    'solver_node': {'correct_response': 'stay_calm'}
                },
                {
                    'id': 'bb_002',
                    'hero_hand': 'KhKd',
                    'board': 'Kc4s2d5c7c',
                    'pot_size': 150,
                    'hero_stack': 0,
                    'villain_stack': 0,
                    'position': 'CO',
                    'street': 'river',
                    'description': 'Your set of Kings lost to a backdoor flush.',
                    'solver_node': {'correct_response': 'stay_calm'}
                },
                # Add more scenarios...
            ]
        
        return []


# ═══════════════════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def test_suit_rotation():
    """Test the suit rotation functionality."""
    print("🎴 Testing Suit Rotation (Isomorphism)\n")
    
    test_cases = [
        ("AhKs", "Hero Hand"),
        ("Qh7h2c", "Flop"),
        ("AhKsQh7h2c", "Full Board"),
    ]
    
    for cards, label in test_cases:
        print(f"{label}: {cards}")
        for rotation in range(4):
            rotated = GameEngine.rotate_suits(cards, rotation)
            print(f"  Rotation {rotation}: {rotated}")
        print()


def test_villain_action():
    """Test the villain action resolver."""
    print("🎭 Testing Active Villain\n")
    
    solver_node = {
        'actions': {
            'check': {'frequency': 0.60, 'ev': 0.5},
            'bet_50': {'frequency': 0.25, 'ev': 0.7},
            'bet_100': {'frequency': 0.15, 'ev': 0.65}
        }
    }
    
    results = {'check': 0, 'bet_50': 0, 'bet_100': 0}
    trials = 10000
    
    for _ in range(trials):
        action = GameEngine.resolve_villain_action(solver_node)
        key = f"{action.action.value}_{int(action.sizing)}" if action.sizing else action.action.value
        if key in results:
            results[key] += 1
    
    print(f"After {trials} trials:")
    for action, count in results.items():
        pct = count / trials * 100
        print(f"  {action}: {pct:.1f}%")


def test_damage_calculation():
    """Test the damage calculation system."""
    print("\n💔 Testing Damage Calculation\n")
    
    solver_node = {
        'actions': {
            'fold': {'frequency': 0.0, 'ev': 0.0},
            'call': {'frequency': 0.55, 'ev': 12.5},
            'raise': {'frequency': 0.45, 'ev': 12.3}
        }
    }
    
    test_actions = ['call', 'raise', 'fold']
    
    for action in test_actions:
        result = GameEngine.calculate_damage(action, None, solver_node, pot_size=50)
        print(f"User action: {action}")
        print(f"  Correct: {result.is_correct}, Indifferent: {result.is_indifferent}")
        print(f"  EV Loss: {result.ev_loss:.2f}, Chip Penalty: {result.chip_penalty}")
        print(f"  Feedback: {result.feedback}\n")


if __name__ == '__main__':
    test_suit_rotation()
    test_villain_action()
    test_damage_calculation()
