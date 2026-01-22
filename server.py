"""
God Mode Engine — FastAPI Server
=================================
REST API server exposing GameEngine methods for the React frontend.

Endpoints:
- POST /api/session/start  — Initialize new training session
- POST /api/hand/next      — Fetch next hand with director narrative
- POST /api/hand/action    — Submit user action and get villain response

Run:
    uvicorn server:app --reload --port 8000

Author: Smarter.Poker Engineering
"""

import os
import uuid
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime

import uvicorn
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client, Client

# Import our GameEngine
from src.engine.engine_core import (
    GameEngine,
    EngineType,
    HandResult,
    ChartInstruction,
    ScenarioInstruction,
    VillainAction,
    HPResult,
    format_hand_for_display,
)


# ============================================================================
# CONFIGURATION
# ============================================================================

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY environment variables")


# ============================================================================
# FASTAPI SETUP
# ============================================================================

app = FastAPI(
    title="God Mode Engine API",
    description="REST API for the Smarter.Poker God Mode training system",
    version="1.0.0",
)

# CORS Configuration
# Allow React frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",     # Next.js dev
        "http://localhost:5173",     # Vite dev
        "https://smarter.poker",     # Production
        "*",                         # Allow all (dev mode)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# GLOBAL INSTANCES
# ============================================================================

# Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# GameEngine instance
engine = GameEngine(supabase)


# ============================================================================
# PYDANTIC MODELS (Input Validation)
# ============================================================================

class StartSessionRequest(BaseModel):
    """Request to start a new training session."""
    user_id: str = Field(..., description="UUID of the user")
    game_id: str = Field(..., description="Game slug or UUID from game_registry")


class StartSessionResponse(BaseModel):
    """Response after starting a session."""
    session_id: str
    game_id: str
    game_name: str
    engine_type: str
    current_level: int
    current_hp: int
    hands_per_round: int


class NextHandRequest(BaseModel):
    """Request for the next hand."""
    session_id: str = Field(..., description="Active session ID")
    user_id: str = Field(..., description="User ID")


class NextHandResponse(BaseModel):
    """Response with next hand data."""
    status: str  # "HAND_READY", "LEVEL_COMPLETE", "SESSION_COMPLETE"
    hand_id: Optional[str] = None
    engine_type: Optional[str] = None
    hand_data: Optional[Dict[str, Any]] = None
    narrative_summary: Optional[str] = None
    current_hp: int
    current_level: int
    hands_played: int
    hands_remaining: int


class ActionRequest(BaseModel):
    """Request to submit a user action."""
    session_id: str = Field(..., description="Active session ID")
    user_id: str = Field(..., description="User ID")
    hand_id: str = Field(..., description="Current hand ID")
    action_type: str = Field(..., description="CHECK, CALL, BET, RAISE, FOLD")
    amount: Optional[float] = Field(None, description="Bet/raise amount as % of pot")
    solver_node_id: Optional[str] = Field(None, description="Current solver node state")


class ActionResponse(BaseModel):
    """Response after submitting an action."""
    is_correct: bool
    is_indifferent: bool
    damage: int
    ev_loss: float
    feedback: str
    villain_move: Optional[str] = None
    villain_sizing: Optional[float] = None
    next_board_state: Optional[str] = None
    is_hand_over: bool
    current_hp: int
    xp_earned: int


# ============================================================================
# SESSION STORAGE (In-Memory for dev, use Redis/DB in production)
# ============================================================================

sessions: Dict[str, Dict[str, Any]] = {}


def get_session(session_id: str) -> Dict[str, Any]:
    """Get session by ID or raise 404."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return sessions[session_id]


# ============================================================================
# ENDPOINT: POST /api/session/start
# ============================================================================

@app.post("/api/session/start", response_model=StartSessionResponse)
async def start_session(request: StartSessionRequest):
    """
    Start a new training session.
    
    - Resets user's level to 1 and health to 100
    - Creates a new session ID
    - Returns session configuration
    """
    user_id = request.user_id
    game_id = request.game_id
    
    # Get game config from registry
    try:
        game = await engine._get_game_config(game_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    # Create or reset user session in database
    session_data = {
        "user_id": user_id,
        "game_id": game["id"],
        "current_level": 1,
        "health_chips": 100,
        "hands_played": 0,
        "correct_answers": 0,
        "started_at": datetime.utcnow().isoformat(),
    }
    
    # Upsert to god_mode_user_session
    result = supabase.table("god_mode_user_session").upsert(
        session_data,
        on_conflict="user_id,game_id"
    ).execute()
    
    # Generate session ID
    session_id = str(uuid.uuid4())
    
    # Store in memory
    config = game.get("config", {})
    sessions[session_id] = {
        "user_id": user_id,
        "game_id": game["id"],
        "game_slug": game["slug"],
        "game_name": game["title"],
        "engine_type": game["engine_type"],
        "current_level": 1,
        "current_hp": 100,
        "hands_played": 0,
        "correct_answers": 0,
        "hands_per_round": config.get("hands_per_round", 20),
        "current_hand": None,
        "current_hand_id": None,
        "current_solver_node": None,
    }
    
    return StartSessionResponse(
        session_id=session_id,
        game_id=game["id"],
        game_name=game["title"],
        engine_type=game["engine_type"],
        current_level=1,
        current_hp=100,
        hands_per_round=config.get("hands_per_round", 20),
    )


# ============================================================================
# ENDPOINT: POST /api/hand/next
# ============================================================================

@app.post("/api/hand/next", response_model=NextHandResponse)
async def get_next_hand(request: NextHandRequest):
    """
    Fetch the next hand for the session.
    
    - Calls engine.fetch_next_hand()
    - Handles level completion
    - Generates narrative summary for Director Mode
    """
    session = get_session(request.session_id)
    
    # Check if round is complete
    hands_per_round = session["hands_per_round"]
    if session["hands_played"] >= hands_per_round:
        # Calculate if passed
        accuracy = (session["correct_answers"] / session["hands_played"]) * 100
        thresholds = [85, 87, 89, 91, 93, 95, 97, 98, 99, 100]
        level = session["current_level"]
        passed = accuracy >= thresholds[level - 1] if level <= 10 else accuracy >= 100
        
        if passed and level < 10:
            # Level up!
            session["current_level"] = level + 1
            session["hands_played"] = 0
            session["correct_answers"] = 0
            session["current_hp"] = 100  # Reset HP for new level
            
            return NextHandResponse(
                status="LEVEL_COMPLETE",
                current_hp=session["current_hp"],
                current_level=session["current_level"],
                hands_played=0,
                hands_remaining=hands_per_round,
            )
        else:
            return NextHandResponse(
                status="SESSION_COMPLETE",
                current_hp=session["current_hp"],
                current_level=session["current_level"],
                hands_played=session["hands_played"],
                hands_remaining=0,
            )
    
    # Check if HP is depleted
    if session["current_hp"] <= 0:
        return NextHandResponse(
            status="SESSION_COMPLETE",
            current_hp=0,
            current_level=session["current_level"],
            hands_played=session["hands_played"],
            hands_remaining=hands_per_round - session["hands_played"],
        )
    
    # Fetch next hand from engine
    try:
        hand_result = await engine.fetch_next_hand(
            user_id=request.user_id,
            game_id=session["game_slug"],
            current_level=session["current_level"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch hand: {str(e)}")
    
    # Generate hand ID
    hand_id = str(uuid.uuid4())
    
    # Build response based on engine type
    if isinstance(hand_result, HandResult):
        # PIO Engine
        hand_data = format_hand_for_display(hand_result.hand_data)
        narrative = build_narrative_summary(hand_result.hand_data)
        
        # Store current state
        session["current_hand"] = hand_result
        session["current_hand_id"] = hand_id
        session["current_solver_node"] = hand_result.hand_data.get("solver_node", {})
        
        return NextHandResponse(
            status="HAND_READY",
            hand_id=hand_id,
            engine_type="PIO",
            hand_data=hand_data,
            narrative_summary=narrative,
            current_hp=session["current_hp"],
            current_level=session["current_level"],
            hands_played=session["hands_played"],
            hands_remaining=hands_per_round - session["hands_played"],
        )
        
    elif isinstance(hand_result, ChartInstruction):
        # CHART Engine
        session["current_hand"] = hand_result
        session["current_hand_id"] = hand_id
        
        return NextHandResponse(
            status="HAND_READY",
            hand_id=hand_id,
            engine_type="CHART",
            hand_data={
                "chart_type": hand_result.chart_type,
                "hero_position": hand_result.hero_position,
                "stack_bb": hand_result.stack_bb,
                "villain_position": hand_result.villain_position,
                "extra_params": hand_result.extra_params,
            },
            narrative_summary=f"Hero is {hand_result.hero_position} with {hand_result.stack_bb} BB...",
            current_hp=session["current_hp"],
            current_level=session["current_level"],
            hands_played=session["hands_played"],
            hands_remaining=hands_per_round - session["hands_played"],
        )
        
    elif isinstance(hand_result, ScenarioInstruction):
        # SCENARIO Engine
        session["current_hand"] = hand_result
        session["current_hand_id"] = hand_id
        
        return NextHandResponse(
            status="HAND_READY",
            hand_id=hand_id,
            engine_type="SCENARIO",
            hand_data={
                "scenario_id": hand_result.scenario_id,
                "script_name": hand_result.script_name,
                "rigged_outcome": hand_result.rigged_outcome,
            },
            narrative_summary="A challenging situation arises...",
            current_hp=session["current_hp"],
            current_level=session["current_level"],
            hands_played=session["hands_played"],
            hands_remaining=hands_per_round - session["hands_played"],
        )
    
    raise HTTPException(status_code=500, detail="Unknown hand result type")


def build_narrative_summary(hand_data: Dict[str, Any]) -> str:
    """
    Build the narrative summary for Director Mode.
    
    Example: "Hero (BTN) Raises 2.2bb... Villain (BB) Calls..."
    """
    lines = []
    
    action_history = hand_data.get("action_history", [])
    hero_pos = hand_data.get("hero_position", "BTN")
    villain_pos = hand_data.get("villain_position", "BB")
    
    for action in action_history:
        player = action.get("player", "hero")
        action_type = action.get("action", "")
        amount = action.get("amount")
        
        pos = hero_pos if player == "hero" else villain_pos
        player_name = "Hero" if player == "hero" else "Villain"
        
        if action_type == "raises":
            lines.append(f"{player_name} ({pos}) Raises to {amount}bb...")
        elif action_type == "calls":
            lines.append(f"{player_name} ({pos}) Calls...")
        elif action_type == "checks":
            lines.append(f"{player_name} ({pos}) Checks...")
        elif action_type == "bets":
            lines.append(f"{player_name} ({pos}) Bets {amount}bb...")
        elif action_type == "folds":
            lines.append(f"{player_name} ({pos}) Folds...")
    
    # Add board if present
    board = hand_data.get("board", "")
    if board and len(board) >= 6:
        flop = board[:6]
        lines.append(f"Flop: {flop}")
    
    return "\n".join(lines) if lines else "Action begins..."


# ============================================================================
# ENDPOINT: POST /api/hand/action (THE GAME LOOP)
# ============================================================================

@app.post("/api/hand/action", response_model=ActionResponse)
async def submit_action(request: ActionRequest):
    """
    Submit a user action and get the result.
    
    THE GAME LOOP:
    1. Grade user action (calculate HP loss)
    2. Resolve villain action (if hand continues)
    3. Save to hand history
    4. Return result
    """
    session = get_session(request.session_id)
    
    # Validate hand ID
    if session["current_hand_id"] != request.hand_id:
        raise HTTPException(status_code=400, detail="Invalid hand ID")
    
    current_hand = session["current_hand"]
    solver_node = session.get("current_solver_node", {})
    
    # ========================================================================
    # PHASE 1: Grade User Action
    # ========================================================================
    
    hp_result = engine.calculate_hp_loss(
        user_action=request.action_type,
        solver_node=solver_node,
        user_sizing=request.amount,
        pot_size=current_hand.hand_data.get("pot", 100) if isinstance(current_hand, HandResult) else 100,
    )
    
    # Apply damage
    new_hp = session["current_hp"] - hp_result.hp_damage
    session["current_hp"] = max(0, new_hp)
    
    # Track correct answers
    if hp_result.is_correct:
        session["correct_answers"] += 1
    
    # XP earned (10 per correct, 0 per mistake)
    xp_earned = 10 if hp_result.is_correct else 0
    
    # ========================================================================
    # PHASE 2: Villain AI (if hand not over)
    # ========================================================================
    
    villain_move = None
    villain_sizing = None
    next_board_state = None
    is_hand_over = False
    
    # Check if user folded
    if request.action_type.upper() == "FOLD":
        is_hand_over = True
    else:
        # Determine if hand continues
        # For simplicity, hands are over after one user action in this version
        # In full implementation, check action tree depth
        is_hand_over = True  # Simplified: one action per hand
        
        # If hand were to continue, resolve villain action:
        # villain_action = engine.resolve_villain_action(solver_node)
        # villain_move = villain_action.action
        # villain_sizing = villain_action.sizing
        # 
        # # Deal next card if applicable
        # if villain_action.next_node:
        #     session["current_solver_node"] = villain_action.next_node
        #     # Get new card from next node
        #     next_board_state = villain_action.next_node.get("new_card")
        #     is_hand_over = False
    
    # ========================================================================
    # PHASE 3: Save to Hand History
    # ========================================================================
    
    if isinstance(current_hand, HandResult):
        history_record = {
            "user_id": request.user_id,
            "game_id": session["game_id"],
            "file_id": current_hand.file_id,
            "variant_hash": current_hand.variant_hash,
            "user_action": request.action_type,
            "user_sizing": request.amount,
            "is_correct": hp_result.is_correct,
            "ev_loss": hp_result.ev_loss,
            "hp_damage": hp_result.hp_damage,
            "level": session["current_level"],
            "played_at": datetime.utcnow().isoformat(),
        }
        
        try:
            supabase.table("god_mode_hand_history").insert(history_record).execute()
        except Exception as e:
            # Log but don't fail the request
            print(f"Failed to save hand history: {e}")
    
    # Increment hands played
    session["hands_played"] += 1
    
    # ========================================================================
    # Return Result
    # ========================================================================
    
    return ActionResponse(
        is_correct=hp_result.is_correct,
        is_indifferent=hp_result.is_indifferent,
        damage=hp_result.hp_damage,
        ev_loss=hp_result.ev_loss,
        feedback=hp_result.feedback,
        villain_move=villain_move,
        villain_sizing=villain_sizing,
        next_board_state=next_board_state,
        is_hand_over=is_hand_over,
        current_hp=session["current_hp"],
        xp_earned=xp_earned,
    )


# ============================================================================
# HEALTH CHECK ENDPOINT
# ============================================================================

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "engine": "God Mode Engine",
        "timestamp": datetime.utcnow().isoformat(),
    }


# ============================================================================
# GAME REGISTRY ENDPOINT
# ============================================================================

@app.get("/api/games")
async def list_games():
    """List all available games from game_registry."""
    result = supabase.table("game_registry") \
        .select("id, title, slug, engine_type, category, config, description") \
        .eq("is_active", True) \
        .order("category") \
        .execute()
    
    return {"games": result.data if result.data else []}


@app.get("/api/games/{game_slug}")
async def get_game(game_slug: str):
    """Get a specific game by slug."""
    result = supabase.table("game_registry") \
        .select("*") \
        .eq("slug", game_slug) \
        .single() \
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Game not found")
    
    return result.data


# ============================================================================
# LEADERBOARD ENDPOINT
# ============================================================================

@app.get("/api/leaderboard/{game_slug}")
async def get_leaderboard(game_slug: str, limit: int = 10):
    """Get leaderboard for a specific game."""
    result = supabase.table("god_mode_leaderboard") \
        .select("*, profiles(username, avatar_url)") \
        .eq("game_slug", game_slug) \
        .order("best_accuracy", desc=True) \
        .limit(limit) \
        .execute()
    
    return {"leaderboard": result.data if result.data else []}


# ============================================================================
# RUN SERVER
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
