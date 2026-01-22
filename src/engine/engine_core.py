"""
God Mode Engine — Core Backend Logic
=====================================
The heart of the 100-game poker training RPG.

This module provides:
- GameEngine class for fetching hands and evaluating actions
- Suit isomorphism ("The Magic Trick") for infinite content from finite files
- Active villain resolution using weighted RNG
- HP loss calculation with indifference rule support

Tables Used:
- game_registry: 100 games with engine_type routing
- solved_spots_gold: PioSolver hand data
- user_hand_history: Tracks seen hands (file_id + variant_hash)

Author: Smarter.Poker Engineering
"""

import random
import re
import json
import hashlib
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum


# ============================================================================
# DATA STRUCTURES
# ============================================================================

class EngineType(Enum):
    """The 3 engines that power God Mode."""
    PIO = "PIO"           # Postflop solver queries
    CHART = "CHART"       # Static preflop/ICM charts
    SCENARIO = "SCENARIO" # Mental game scripted drills


@dataclass
class HandResult:
    """Result from fetching a new hand."""
    engine_type: EngineType
    file_id: str
    variant_hash: str
    hand_data: Dict[str, Any]
    config: Dict[str, Any]
    
    
@dataclass
class ChartInstruction:
    """Instruction for CHART engine frontend."""
    chart_type: str  # e.g., "push_fold", "3bet_range"
    hero_position: str
    stack_bb: int
    villain_position: Optional[str] = None
    extra_params: Optional[Dict] = None


@dataclass
class ScenarioInstruction:
    """Instruction for SCENARIO engine frontend."""
    scenario_id: str
    script_name: str
    rigged_outcome: Optional[str] = None  # e.g., "bad_beat", "cooler"
    

@dataclass
class VillainAction:
    """Result of villain action resolution."""
    action: str  # "CHECK", "BET", "CALL", "RAISE", "FOLD"
    sizing: Optional[float] = None  # Bet/raise size as % of pot
    frequency: float = 0.0  # How often solver does this
    next_node: Optional[Dict] = None  # Next position in game tree


@dataclass
class HPResult:
    """Result of HP loss calculation."""
    is_correct: bool
    is_indifferent: bool  # Mixed strategy with similar EVs
    user_ev: float
    max_ev: float
    ev_loss: float
    hp_damage: int  # 0-25 points of health bar damage
    feedback: str


# ============================================================================
# SUIT ISOMORPHISM — THE MAGIC TRICK
# ============================================================================

# All 24 possible suit permutations (4! = 24)
SUITS = ['s', 'h', 'd', 'c']

# Rank regex for card detection
CARD_PATTERN = re.compile(r'([AKQJT98765432])([shdc])')


def generate_suit_map() -> Tuple[Dict[str, str], str]:
    """
    Generate a random suit mapping for isomorphism.
    
    Returns:
        Tuple of (suit_map dict, variant_hash string)
        
    Example:
        {"s": "h", "h": "d", "d": "c", "c": "s"} -> "s=h,h=d,d=c,c=s"
    """
    shuffled = SUITS.copy()
    random.shuffle(shuffled)
    
    suit_map = {original: new for original, new in zip(SUITS, shuffled)}
    variant_hash = ",".join(f"{k}={v}" for k, v in sorted(suit_map.items()))
    
    return suit_map, variant_hash


def apply_suit_rotation(card: str, suit_map: Dict[str, str]) -> str:
    """
    Apply suit rotation to a single card.
    
    Args:
        card: Card string like "As", "Td", "7c"
        suit_map: Mapping from original suits to rotated suits
        
    Returns:
        Rotated card string
    """
    if len(card) < 2:
        return card
        
    rank = card[:-1]  # Handle "10" as rank if needed
    suit = card[-1].lower()
    
    if suit in suit_map:
        return rank + suit_map[suit]
    return card


def rotate_cards_in_value(value: Any, suit_map: Dict[str, str]) -> Any:
    """
    Recursively apply suit rotation to any value that contains cards.
    
    Handles:
    - Single card strings: "As" -> "Ah"
    - Card lists: ["As", "Kd"] -> ["Ah", "Kc"]
    - Board strings: "AhKd7c" -> "AdKc7s"
    - Range strings: "AKs,QQ" (preserves 's' only when it's a suit)
    """
    if isinstance(value, str):
        # Check if it's a board string (consecutive cards without separators)
        if CARD_PATTERN.search(value):
            def replace_card(match):
                rank, suit = match.groups()
                return rank + suit_map.get(suit, suit)
            return CARD_PATTERN.sub(replace_card, value)
        return value
        
    elif isinstance(value, list):
        return [rotate_cards_in_value(item, suit_map) for item in value]
        
    elif isinstance(value, dict):
        return {k: rotate_cards_in_value(v, suit_map) for k, v in value.items()}
        
    return value


# ============================================================================
# GAME ENGINE CLASS
# ============================================================================

class GameEngine:
    """
    Core engine for the God Mode training system.
    
    Handles:
    - Fetching hands based on engine type (PIO/CHART/SCENARIO)
    - Suit isomorphism for content multiplication
    - Villain action resolution
    - HP damage calculation
    
    Usage:
        engine = GameEngine(supabase_client)
        hand = await engine.fetch_next_hand(user_id, game_id, level=3)
        villain = engine.resolve_villain_action(solver_node)
        result = engine.calculate_hp_loss("CALL", solver_node)
    """
    
    def __init__(self, supabase_client):
        """
        Initialize the engine with a Supabase client.
        
        Args:
            supabase_client: Authenticated Supabase client instance
        """
        self.supabase = supabase_client
        self._game_cache: Dict[str, Dict] = {}
        
    # ========================================================================
    # MAIN API: fetch_next_hand
    # ========================================================================
    
    async def fetch_next_hand(
        self, 
        user_id: str, 
        game_id: str, 
        current_level: int
    ) -> HandResult | ChartInstruction | ScenarioInstruction:
        """
        Fetch the next training hand for a user.
        
        This is the main router that directs to the appropriate engine.
        
        Args:
            user_id: UUID of the current user
            game_id: UUID or slug of the game from game_registry
            current_level: Current level (1-10) for difficulty scaling
            
        Returns:
            HandResult for PIO engine
            ChartInstruction for CHART engine
            ScenarioInstruction for SCENARIO engine
            
        Raises:
            ValueError: If game not found or no valid hands available
        """
        # STEP A: Get game config from registry
        game = await self._get_game_config(game_id)
        engine_type = EngineType(game['engine_type'])
        config = game.get('config', {})
        
        # STEP B: Route to appropriate engine
        if engine_type == EngineType.PIO:
            return await self._fetch_solver_hand(user_id, game_id, config, current_level)
            
        elif engine_type == EngineType.CHART:
            return self._build_chart_instruction(config, current_level)
            
        elif engine_type == EngineType.SCENARIO:
            return self._build_scenario_instruction(game_id, config, current_level)
            
        raise ValueError(f"Unknown engine type: {engine_type}")
    
    # ========================================================================
    # PIO ENGINE: Solver Hand Fetching
    # ========================================================================
    
    async def _fetch_solver_hand(
        self, 
        user_id: str,
        game_id: str,
        config: Dict,
        level: int
    ) -> HandResult:
        """
        Fetch a hand from solved_spots_gold with suit isomorphism.
        
        CRITICAL LOGIC:
        1. Query solved_spots_gold for candidates matching config
        2. For each candidate, check if user has seen ALL 24 suit variations
        3. If not all seen, pick a random unseen variation
        4. Apply suit rotation to the hand data
        5. Return the transformed hand with variant_hash
        
        This creates 24x content multiplication from the solver database.
        """
        # Build query filters from config
        filters = self._build_solver_filters(config, level)
        
        # Query candidate hands
        query = self.supabase.table('solved_spots_gold').select('*')
        
        for field, value in filters.items():
            query = query.eq(field, value)
            
        # Get batch of candidates
        result = query.limit(50).execute()
        candidates = result.data if result.data else []
        
        if not candidates:
            raise ValueError(f"No solver hands found for config: {config}")
        
        # Shuffle to randomize selection
        random.shuffle(candidates)
        
        # Find a hand with an unseen variant
        for candidate in candidates:
            file_id = candidate['id']
            
            # Check which variants user has seen for this file
            seen_variants = await self._get_seen_variants(user_id, file_id)
            
            # Generate all 24 possible variant hashes
            all_variants = self._generate_all_variant_hashes()
            unseen_variants = [v for v in all_variants if v not in seen_variants]
            
            if unseen_variants:
                # Pick a random unseen variant
                chosen_variant = random.choice(unseen_variants)
                
                # Parse the variant hash back to suit map
                suit_map = self._parse_variant_hash(chosen_variant)
                
                # Apply suit rotation to hand data
                rotated_data = self._rotate_suits(candidate, suit_map)
                
                return HandResult(
                    engine_type=EngineType.PIO,
                    file_id=file_id,
                    variant_hash=chosen_variant,
                    hand_data=rotated_data,
                    config=config
                )
        
        # All variants seen for all candidates — need more content!
        # Fallback: Return first candidate with identity rotation
        fallback = candidates[0]
        identity_map = {s: s for s in SUITS}
        identity_hash = ",".join(f"{s}={s}" for s in sorted(SUITS))
        
        return HandResult(
            engine_type=EngineType.PIO,
            file_id=fallback['id'],
            variant_hash=identity_hash,
            hand_data=fallback,
            config=config
        )
    
    async def _get_seen_variants(self, user_id: str, file_id: str) -> set:
        """
        Get all variant hashes the user has seen for a specific file.
        
        Args:
            user_id: User's UUID
            file_id: Solver file ID
            
        Returns:
            Set of variant_hash strings the user has already played
        """
        result = self.supabase.table('user_hand_history') \
            .select('variant_hash') \
            .eq('user_id', user_id) \
            .eq('file_id', file_id) \
            .execute()
            
        if result.data:
            return {row['variant_hash'] for row in result.data}
        return set()
    
    def _generate_all_variant_hashes(self) -> List[str]:
        """
        Generate all 24 possible variant hashes for suit permutations.
        
        4! = 24 permutations of [s, h, d, c]
        """
        from itertools import permutations
        
        hashes = []
        for perm in permutations(SUITS):
            suit_map = {original: new for original, new in zip(SUITS, perm)}
            variant_hash = ",".join(f"{k}={v}" for k, v in sorted(suit_map.items()))
            hashes.append(variant_hash)
            
        return hashes
    
    def _parse_variant_hash(self, variant_hash: str) -> Dict[str, str]:
        """
        Parse a variant hash string back to suit map.
        
        Args:
            variant_hash: String like "c=s,d=h,h=d,s=c"
            
        Returns:
            Dict mapping original suits to rotated suits
        """
        suit_map = {}
        for pair in variant_hash.split(','):
            original, new = pair.split('=')
            suit_map[original] = new
        return suit_map
    
    def _build_solver_filters(self, config: Dict, level: int) -> Dict:
        """
        Build query filters for solved_spots_gold based on game config.
        
        Args:
            config: Game configuration from registry
            level: Current difficulty level (affects hand complexity)
            
        Returns:
            Dict of field=value filters for the query
        """
        filters = {}
        
        # Stack depth filter
        if 'stack' in config:
            stack = config['stack']
            if stack <= 20:
                filters['stack_category'] = 'short'
            elif stack >= 150:
                filters['stack_category'] = 'deep'
            else:
                filters['stack_category'] = 'standard'
                
        # Position filter
        if 'position' in config:
            filters['hero_position'] = config['position']
            
        # Street filter (for postflop games)
        if 'street' in config:
            filters['street'] = config['street']
            
        # Spot type (c-bet, check-raise, etc.)
        if 'spot_type' in config:
            filters['spot_type'] = config['spot_type']
            
        return filters
    
    # ========================================================================
    # SUIT ISOMORPHISM: The Magic Trick
    # ========================================================================
    
    def _rotate_suits(self, hand_json: Dict, suit_map: Dict[str, str]) -> Dict:
        """
        Apply suit rotation to a hand's JSON data.
        
        THE MAGIC TRICK: This creates infinite visual content from finite files.
        The same hand (As Kd on Ah7c2s) can appear as 24 different visual
        combinations without changing the strategic meaning.
        
        Args:
            hand_json: Raw hand data from solver
            suit_map: Mapping like {"s": "h", "h": "d", "d": "c", "c": "s"}
            
        Returns:
            New dict with all card values rotated
        """
        # Deep copy to avoid mutating original
        rotated = json.loads(json.dumps(hand_json))
        
        # Fields that contain card data
        card_fields = [
            'board', 'hero_hand', 'villain_hand',
            'flop', 'turn', 'river',
            'hero_range', 'villain_range',
            'hand', 'cards'
        ]
        
        for field in card_fields:
            if field in rotated:
                rotated[field] = rotate_cards_in_value(rotated[field], suit_map)
                
        # Handle nested structures (actions, nodes, etc.)
        if 'actions' in rotated:
            rotated['actions'] = rotate_cards_in_value(rotated['actions'], suit_map)
            
        if 'tree' in rotated:
            rotated['tree'] = rotate_cards_in_value(rotated['tree'], suit_map)
            
        return rotated
    
    @staticmethod
    def rotate_suits_static(cards: str, rotation_key: int) -> str:
        """
        Static method for simple suit rotation by key (0-3).
        
        Rotation keys:
        - 0: Identity (s->s, h->h, d->d, c->c)
        - 1: Shift +1 (s->h, h->d, d->c, c->s)
        - 2: Shift +2 (s->d, h->c, d->s, c->h)
        - 3: Shift +3 (s->c, h->s, d->h, c->d)
        
        Args:
            cards: Card string like "AhKs", "Td7c"
            rotation_key: 0-3
            
        Returns:
            Rotated card string
        """
        rotations = {
            0: {'s': 's', 'h': 'h', 'd': 'd', 'c': 'c'},
            1: {'s': 'h', 'h': 'd', 'd': 'c', 'c': 's'},
            2: {'s': 'd', 'h': 'c', 'd': 's', 'c': 'h'},
            3: {'s': 'c', 'h': 's', 'd': 'h', 'c': 'd'},
        }
        
        if rotation_key not in rotations:
            raise ValueError(f"Invalid rotation key: {rotation_key}. Must be 0-3.")
            
        suit_map = rotations[rotation_key]
        return rotate_cards_in_value(cards, suit_map)
    
    # ========================================================================
    # CHART ENGINE: Static Range Instructions
    # ========================================================================
    
    def _build_chart_instruction(
        self, 
        config: Dict, 
        level: int
    ) -> ChartInstruction:
        """
        Build instruction for CHART engine frontend.
        
        Chart games use static JSON files, not solver queries.
        The frontend loads the appropriate chart UI.
        
        Args:
            config: Game configuration with chart parameters
            level: Difficulty level (affects stack depths, etc.)
            
        Returns:
            ChartInstruction for frontend to render
        """
        # Generate a random scenario based on config
        positions = ['BTN', 'CO', 'HJ', 'LJ', 'SB', 'BB']
        
        hero_pos = config.get('position', random.choice(positions))
        
        # Scale stack based on level (lower levels = more desperate stacks)
        base_stack = config.get('stack', 15)
        stack_variance = random.randint(-3, 3)
        stack_bb = max(5, min(25, base_stack + stack_variance))
        
        # Determine chart type
        chart_type = config.get('chart_type', 'push_fold')
        if 'icm' in str(config).lower():
            chart_type = 'icm_ranges'
        elif 'bubble' in str(config).lower():
            chart_type = 'bubble_pressure'
            
        # Pick villain position for 3bet/squeeze charts
        villain_pos = None
        if chart_type in ['3bet_range', 'squeeze', 'resteal']:
            available = [p for p in positions if p != hero_pos]
            villain_pos = random.choice(available)
            
        return ChartInstruction(
            chart_type=chart_type,
            hero_position=hero_pos,
            stack_bb=stack_bb,
            villain_position=villain_pos,
            extra_params={
                'level': level,
                'ante': config.get('ante', True),
                'players_remaining': config.get('players', 6)
            }
        )
    
    # ========================================================================
    # SCENARIO ENGINE: Mental Game Scripts
    # ========================================================================
    
    def _build_scenario_instruction(
        self, 
        game_id: str,
        config: Dict, 
        level: int
    ) -> ScenarioInstruction:
        """
        Build instruction for SCENARIO engine frontend.
        
        Scenario games use hardcoded scripts with "rigged" RNG
        to test mental game and psychology.
        
        Args:
            game_id: Slug of the scenario game
            config: Game configuration
            level: Difficulty level (affects rigging intensity)
            
        Returns:
            ScenarioInstruction for frontend to render
        """
        # Map game_id to scenario scripts
        scenario_map = {
            'tilt-control': 'bad_beats_sequence',
            'cooler-cage': 'cooler_hell',
            'variance-zen': 'variance_torture',
            'patience-master': 'card_dead_marathon',
            'winners-tilt': 'heater_discipline',
            'pressure-chamber': 'high_stakes_bubble',
            'ego-killer': 'humble_pie_sequence',
            'fear-eraser': 'scary_spots_drill',
        }
        
        script_name = scenario_map.get(game_id, 'generic_mental_drill')
        
        # Higher levels = more intense rigging
        rigged_outcomes = None
        if level >= 7:
            rigged_outcomes = ['cooler', 'bad_beat', 'setup_hand']
        elif level >= 4:
            rigged_outcomes = ['bad_beat', 'card_dead']
            
        rigged = random.choice(rigged_outcomes) if rigged_outcomes else None
        
        return ScenarioInstruction(
            scenario_id=game_id,
            script_name=script_name,
            rigged_outcome=rigged
        )
    
    # ========================================================================
    # VILLAIN ACTION RESOLUTION
    # ========================================================================
    
    def resolve_villain_action(self, solver_node: Dict) -> VillainAction:
        """
        Resolve villain's action using weighted random selection.
        
        The solver provides frequencies for each action. We use RNG
        weighted by those frequencies to simulate realistic villain play.
        
        Args:
            solver_node: Node with action frequencies like:
                {
                    "actions": {
                        "check": {"frequency": 0.60, "ev": 0.5, "next_node": {...}},
                        "bet_50": {"frequency": 0.25, "ev": 0.7, "next_node": {...}},
                        "bet_100": {"frequency": 0.15, "ev": 0.65, "next_node": {...}}
                    }
                }
                
        Returns:
            VillainAction with chosen action, sizing, and next node
        """
        actions = solver_node.get('actions', {})
        
        if not actions:
            # No actions available = check/call through
            return VillainAction(
                action="CHECK",
                frequency=1.0,
                next_node=solver_node.get('next_node')
            )
        
        # Build cumulative probability distribution
        cumulative = []
        running_total = 0.0
        
        for action_key, action_data in actions.items():
            freq = action_data.get('frequency', 0)
            running_total += freq
            cumulative.append((running_total, action_key, action_data))
        
        # Normalize if frequencies don't sum to 1
        if running_total > 0 and running_total != 1.0:
            cumulative = [
                (c / running_total, k, d) 
                for c, k, d in cumulative
            ]
        
        # Roll the dice
        roll = random.random()
        
        # Find the action that matches the roll
        for threshold, action_key, action_data in cumulative:
            if roll <= threshold:
                # Parse action key to extract action and sizing
                action, sizing = self._parse_action_key(action_key)
                
                return VillainAction(
                    action=action,
                    sizing=sizing,
                    frequency=action_data.get('frequency', 0),
                    next_node=action_data.get('next_node')
                )
        
        # Fallback (should never reach here)
        return VillainAction(action="CHECK", frequency=1.0)
    
    def _parse_action_key(self, action_key: str) -> Tuple[str, Optional[float]]:
        """
        Parse action key like "bet_50" to ("BET", 50.0).
        
        Common formats:
        - "check" -> ("CHECK", None)
        - "fold" -> ("FOLD", None)
        - "call" -> ("CALL", None)
        - "bet_50" -> ("BET", 50.0)
        - "raise_150" -> ("RAISE", 150.0)
        - "allin" -> ("ALLIN", None)
        """
        action_key = action_key.lower()
        
        if action_key == 'check':
            return ('CHECK', None)
        elif action_key == 'fold':
            return ('FOLD', None)
        elif action_key == 'call':
            return ('CALL', None)
        elif action_key == 'allin':
            return ('ALLIN', None)
        elif action_key.startswith('bet_'):
            sizing = float(action_key.split('_')[1])
            return ('BET', sizing)
        elif action_key.startswith('raise_'):
            sizing = float(action_key.split('_')[1])
            return ('RAISE', sizing)
        else:
            # Unknown action format
            return (action_key.upper(), None)
    
    # ========================================================================
    # HP LOSS CALCULATION
    # ========================================================================
    
    def calculate_hp_loss(
        self, 
        user_action: str, 
        solver_node: Dict,
        user_sizing: Optional[float] = None,
        pot_size: float = 100.0
    ) -> HPResult:
        """
        Calculate health bar damage based on EV loss.
        
        INDIFFERENCE RULE:
        If the solver uses a mixed strategy where multiple actions have
        similar EV (within 0.05 of each other), both are considered correct.
        This is game-theoretically correct behavior.
        
        DAMAGE SCALING:
        - 0 EV loss = 0 damage
        - Up to 5% pot loss = 1-5 damage
        - Up to 25% pot loss = 6-15 damage
        - 25%+ pot loss = 16-25 damage (max)
        
        Args:
            user_action: Action user chose ("FOLD", "CALL", "BET", etc.)
            solver_node: Solver node with action frequencies and EVs
            user_sizing: Bet sizing if applicable (% of pot)
            pot_size: Current pot size for EV normalization
            
        Returns:
            HPResult with damage amount and feedback
        """
        actions = solver_node.get('actions', {})
        
        # Find user's action in solver data
        user_action_key = self._find_matching_action(user_action, user_sizing, actions)
        user_action_data = actions.get(user_action_key, {})
        
        user_ev = user_action_data.get('ev', 0)
        user_freq = user_action_data.get('frequency', 0)
        
        # Find max EV action
        max_ev = max((a.get('ev', 0) for a in actions.values()), default=0)
        max_ev_actions = [k for k, v in actions.items() if v.get('ev', 0) == max_ev]
        
        # Calculate EV loss
        ev_loss = max(0, max_ev - user_ev)
        
        # Check for indifference (mixed strategy acceptance)
        # Actions with ≥40% frequency OR EV within 0.05 of max are acceptable
        is_indifferent = user_freq >= 0.40 or ev_loss <= 0.05
        
        # Determine correctness
        is_correct = user_action_key in max_ev_actions or is_indifferent
        
        # Calculate HP damage
        if is_correct:
            hp_damage = 0
            feedback = "✅ Correct!"
            
            if is_indifferent and user_action_key not in max_ev_actions:
                feedback = "✅ Acceptable (Mixed Strategy)"
                
        else:
            # Scale damage based on EV loss relative to pot
            ev_loss_pct = (ev_loss / pot_size) * 100 if pot_size > 0 else 0
            
            if ev_loss_pct <= 5:
                hp_damage = int(ev_loss_pct)  # 1-5 damage
            elif ev_loss_pct <= 25:
                hp_damage = 5 + int((ev_loss_pct - 5) * 0.5)  # 6-15 damage
            else:
                hp_damage = 16 + min(9, int((ev_loss_pct - 25) * 0.2))  # 16-25 damage
                
            hp_damage = min(25, max(1, hp_damage))  # Clamp to 1-25
            
            # Build feedback message
            best_action = max_ev_actions[0] if max_ev_actions else "unknown"
            feedback = f"❌ Mistake! Best: {best_action.upper()} (EV loss: {ev_loss:.2f})"
        
        return HPResult(
            is_correct=is_correct,
            is_indifferent=is_indifferent,
            user_ev=user_ev,
            max_ev=max_ev,
            ev_loss=ev_loss,
            hp_damage=hp_damage,
            feedback=feedback
        )
    
    def _find_matching_action(
        self, 
        user_action: str, 
        user_sizing: Optional[float],
        actions: Dict
    ) -> str:
        """
        Find the solver action key that matches user's action.
        
        Handles sizing matching with tolerance for bet/raise actions.
        """
        user_action = user_action.upper()
        
        # Direct matches
        simple_actions = {'CHECK', 'FOLD', 'CALL', 'ALLIN'}
        if user_action in simple_actions:
            for key in actions:
                if key.lower() == user_action.lower():
                    return key
            return user_action.lower()
        
        # Bet/Raise with sizing
        if user_action in ('BET', 'RAISE') and user_sizing is not None:
            best_match = None
            best_diff = float('inf')
            
            prefix = 'bet' if user_action == 'BET' else 'raise'
            
            for key in actions:
                if key.lower().startswith(prefix + '_'):
                    try:
                        solver_sizing = float(key.split('_')[1])
                        diff = abs(solver_sizing - user_sizing)
                        if diff < best_diff:
                            best_diff = diff
                            best_match = key
                    except (ValueError, IndexError):
                        pass
                        
            return best_match if best_match else f"{prefix}_{int(user_sizing)}"
        
        return user_action.lower()
    
    # ========================================================================
    # GAME CONFIG CACHING
    # ========================================================================
    
    async def _get_game_config(self, game_id: str) -> Dict:
        """
        Get game configuration from registry (with caching).
        
        Args:
            game_id: UUID or slug of the game
            
        Returns:
            Game configuration dict
            
        Raises:
            ValueError: If game not found
        """
        if game_id in self._game_cache:
            return self._game_cache[game_id]
        
        # Query by slug first, then by ID
        result = self.supabase.table('game_registry') \
            .select('*') \
            .eq('slug', game_id) \
            .execute()
            
        if not result.data:
            # Try by UUID
            result = self.supabase.table('game_registry') \
                .select('*') \
                .eq('id', game_id) \
                .execute()
        
        if not result.data:
            raise ValueError(f"Game not found: {game_id}")
            
        game = result.data[0]
        self._game_cache[game_id] = game
        return game


# ============================================================================
# HELPER FUNCTIONS FOR FRONTEND
# ============================================================================

def format_hand_for_display(hand_data: Dict) -> Dict:
    """
    Format hand data for frontend display.
    
    Converts internal representation to display-friendly format.
    """
    display = {
        'hero_cards': hand_data.get('hero_hand', ''),
        'villain_cards': hand_data.get('villain_hand', '??'),
        'board': hand_data.get('board', ''),
        'pot_size': hand_data.get('pot', 100),
        'hero_stack': hand_data.get('hero_stack', 100),
        'villain_stack': hand_data.get('villain_stack', 100),
        'hero_position': hand_data.get('hero_position', 'BTN'),
        'villain_position': hand_data.get('villain_position', 'BB'),
        'action_history': hand_data.get('action_history', []),
    }
    return display


def get_available_actions(solver_node: Dict) -> List[Dict]:
    """
    Get available actions for the frontend action buttons.
    
    Returns list of {action, sizing, label} dicts.
    """
    actions = solver_node.get('actions', {})
    result = []
    
    for key, data in actions.items():
        action, sizing = key.split('_') if '_' in key else (key, None)
        
        label = action.upper()
        if sizing:
            label = f"{action.upper()} {sizing}%"
            
        result.append({
            'action': action.upper(),
            'sizing': float(sizing) if sizing else None,
            'label': label,
            'frequency': data.get('frequency', 0),
            'ev': data.get('ev', 0)
        })
    
    return result
