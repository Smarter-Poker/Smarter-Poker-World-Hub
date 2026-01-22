#!/usr/bin/env python3
"""
setup_dummy_data.py
===================
Creates dummy data files for the CHART and SCENARIO engines.
This prevents the backend from crashing when loading games that
reference data files that don't exist yet.

Creates:
- /data/charts/*.json  — Push/fold charts for CHART engine
- /data/scenarios/*.json — Mental game scenarios for SCENARIO engine

Run: python3 scripts/setup_dummy_data.py

@author Smarter.Poker Engineering
"""

import os
import json
from pathlib import Path

# ============================================================================
# PATHS
# ============================================================================

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
CHARTS_DIR = DATA_DIR / "charts"
SCENARIOS_DIR = DATA_DIR / "scenarios"

# ============================================================================
# PUSH/FOLD CHART DATA
# ============================================================================

PUSH_FOLD_BASIC = {
    "name": "Push/Fold Basic",
    "description": "Basic push/fold chart for short-stack play",
    "stack_range": [8, 15],
    "positions": ["BTN", "SB", "BB", "CO", "HJ", "LJ", "UTG"],
    "charts": {
        "BTN": {
            "15bb": {
                "AA": "PUSH", "KK": "PUSH", "QQ": "PUSH", "JJ": "PUSH", "TT": "PUSH",
                "99": "PUSH", "88": "PUSH", "77": "PUSH", "66": "PUSH", "55": "PUSH",
                "44": "PUSH", "33": "PUSH", "22": "PUSH",
                "AKs": "PUSH", "AQs": "PUSH", "AJs": "PUSH", "ATs": "PUSH", "A9s": "PUSH",
                "A8s": "PUSH", "A7s": "PUSH", "A6s": "PUSH", "A5s": "PUSH", "A4s": "PUSH",
                "A3s": "PUSH", "A2s": "PUSH",
                "AKo": "PUSH", "AQo": "PUSH", "AJo": "PUSH", "ATo": "PUSH", "A9o": "PUSH",
                "A8o": "PUSH", "A7o": "PUSH", "A6o": "PUSH", "A5o": "PUSH", "A4o": "PUSH",
                "A3o": "PUSH", "A2o": "PUSH",
                "KQs": "PUSH", "KJs": "PUSH", "KTs": "PUSH", "K9s": "PUSH", "K8s": "PUSH",
                "KQo": "PUSH", "KJo": "PUSH", "KTo": "PUSH", "K9o": "PUSH",
                "QJs": "PUSH", "QTs": "PUSH", "Q9s": "PUSH",
                "QJo": "PUSH", "QTo": "PUSH",
                "JTs": "PUSH", "J9s": "PUSH",
                "JTo": "PUSH",
                "T9s": "PUSH", "T8s": "PUSH",
                "98s": "PUSH", "97s": "PUSH",
                "87s": "PUSH", "86s": "PUSH",
                "76s": "PUSH", "75s": "PUSH",
                "65s": "PUSH", "64s": "PUSH",
                "54s": "PUSH", "53s": "PUSH",
                "43s": "PUSH",
            },
            "10bb": {
                "AA": "PUSH", "KK": "PUSH", "QQ": "PUSH", "JJ": "PUSH", "TT": "PUSH",
                "99": "PUSH", "88": "PUSH", "77": "PUSH", "66": "PUSH", "55": "PUSH",
                "44": "PUSH", "33": "PUSH", "22": "PUSH",
                "AKs": "PUSH", "AQs": "PUSH", "AJs": "PUSH", "ATs": "PUSH", "A9s": "PUSH",
                "A8s": "PUSH", "A7s": "PUSH", "A6s": "PUSH", "A5s": "PUSH", "A4s": "PUSH",
                "A3s": "PUSH", "A2s": "PUSH",
                "AKo": "PUSH", "AQo": "PUSH", "AJo": "PUSH", "ATo": "PUSH", "A9o": "PUSH",
                "A8o": "PUSH", "A7o": "PUSH", "A6o": "PUSH", "A5o": "PUSH",
                "KQs": "PUSH", "KJs": "PUSH", "KTs": "PUSH", "K9s": "PUSH",
                "KQo": "PUSH", "KJo": "PUSH", "KTo": "PUSH",
                "QJs": "PUSH", "QTs": "PUSH", "Q9s": "PUSH",
                "QJo": "PUSH",
                "JTs": "PUSH", "J9s": "PUSH",
                "T9s": "PUSH",
                "98s": "PUSH",
                "87s": "PUSH",
                "76s": "PUSH",
                "65s": "PUSH",
                "54s": "PUSH",
            },
        },
        "SB": {
            "15bb": {
                "AA": "PUSH", "KK": "PUSH", "QQ": "PUSH", "JJ": "PUSH", "TT": "PUSH",
                "99": "PUSH", "88": "PUSH", "77": "PUSH", "66": "PUSH", "55": "PUSH",
                "44": "PUSH", "33": "PUSH", "22": "PUSH",
                "AKs": "PUSH", "AQs": "PUSH", "AJs": "PUSH", "ATs": "PUSH", "A9s": "PUSH",
                "A8s": "PUSH", "A7s": "PUSH", "A6s": "PUSH", "A5s": "PUSH", "A4s": "PUSH",
                "A3s": "PUSH", "A2s": "PUSH",
                "AKo": "PUSH", "AQo": "PUSH", "AJo": "PUSH", "ATo": "PUSH", "A9o": "PUSH",
                "A8o": "PUSH", "A7o": "PUSH", "A6o": "PUSH", "A5o": "PUSH", "A4o": "PUSH",
                "A3o": "PUSH", "A2o": "PUSH",
                "KQs": "PUSH", "KJs": "PUSH", "KTs": "PUSH", "K9s": "PUSH", "K8s": "PUSH",
                "K7s": "PUSH", "K6s": "PUSH", "K5s": "PUSH", "K4s": "PUSH", "K3s": "PUSH",
                "K2s": "PUSH",
                "KQo": "PUSH", "KJo": "PUSH", "KTo": "PUSH", "K9o": "PUSH", "K8o": "PUSH",
                "K7o": "PUSH", "K6o": "PUSH", "K5o": "PUSH",
                "QJs": "PUSH", "QTs": "PUSH", "Q9s": "PUSH", "Q8s": "PUSH", "Q7s": "PUSH",
                "Q6s": "PUSH", "Q5s": "PUSH", "Q4s": "PUSH",
                "QJo": "PUSH", "QTo": "PUSH", "Q9o": "PUSH", "Q8o": "PUSH",
                "JTs": "PUSH", "J9s": "PUSH", "J8s": "PUSH", "J7s": "PUSH",
                "JTo": "PUSH", "J9o": "PUSH",
                "T9s": "PUSH", "T8s": "PUSH", "T7s": "PUSH",
                "T9o": "PUSH",
                "98s": "PUSH", "97s": "PUSH", "96s": "PUSH",
                "87s": "PUSH", "86s": "PUSH", "85s": "PUSH",
                "76s": "PUSH", "75s": "PUSH", "74s": "PUSH",
                "65s": "PUSH", "64s": "PUSH", "63s": "PUSH",
                "54s": "PUSH", "53s": "PUSH", "52s": "PUSH",
                "43s": "PUSH", "42s": "PUSH",
                "32s": "PUSH",
            },
            "10bb": {
                "AA": "PUSH", "KK": "PUSH", "QQ": "PUSH", "JJ": "PUSH", "TT": "PUSH",
                "99": "PUSH", "88": "PUSH", "77": "PUSH", "66": "PUSH", "55": "PUSH",
                "44": "PUSH", "33": "PUSH", "22": "PUSH",
                "AKs": "PUSH", "AQs": "PUSH", "AJs": "PUSH", "ATs": "PUSH", "A9s": "PUSH",
                "A8s": "PUSH", "A7s": "PUSH", "A6s": "PUSH", "A5s": "PUSH", "A4s": "PUSH",
                "A3s": "PUSH", "A2s": "PUSH",
                "AKo": "PUSH", "AQo": "PUSH", "AJo": "PUSH", "ATo": "PUSH", "A9o": "PUSH",
                "A8o": "PUSH", "A7o": "PUSH", "A6o": "PUSH", "A5o": "PUSH", "A4o": "PUSH",
                "A3o": "PUSH", "A2o": "PUSH",
                "KQs": "PUSH", "KJs": "PUSH", "KTs": "PUSH", "K9s": "PUSH", "K8s": "PUSH",
                "KQo": "PUSH", "KJo": "PUSH", "KTo": "PUSH", "K9o": "PUSH",
                "QJs": "PUSH", "QTs": "PUSH", "Q9s": "PUSH", "Q8s": "PUSH",
                "QJo": "PUSH", "QTo": "PUSH",
                "JTs": "PUSH", "J9s": "PUSH", "J8s": "PUSH",
                "JTo": "PUSH",
                "T9s": "PUSH", "T8s": "PUSH",
                "98s": "PUSH", "97s": "PUSH",
                "87s": "PUSH", "86s": "PUSH",
                "76s": "PUSH", "75s": "PUSH",
                "65s": "PUSH", "64s": "PUSH",
                "54s": "PUSH", "53s": "PUSH",
                "43s": "PUSH",
            },
        },
        "CO": {
            "15bb": {
                "AA": "PUSH", "KK": "PUSH", "QQ": "PUSH", "JJ": "PUSH", "TT": "PUSH",
                "99": "PUSH", "88": "PUSH", "77": "PUSH", "66": "PUSH", "55": "PUSH",
                "44": "PUSH", "33": "PUSH", "22": "PUSH",
                "AKs": "PUSH", "AQs": "PUSH", "AJs": "PUSH", "ATs": "PUSH", "A9s": "PUSH",
                "A8s": "PUSH", "A7s": "PUSH", "A6s": "PUSH", "A5s": "PUSH", "A4s": "PUSH",
                "A3s": "PUSH", "A2s": "PUSH",
                "AKo": "PUSH", "AQo": "PUSH", "AJo": "PUSH", "ATo": "PUSH", "A9o": "PUSH",
                "A8o": "PUSH", "A7o": "PUSH",
                "KQs": "PUSH", "KJs": "PUSH", "KTs": "PUSH", "K9s": "PUSH",
                "KQo": "PUSH", "KJo": "PUSH",
                "QJs": "PUSH", "QTs": "PUSH",
                "QJo": "PUSH",
                "JTs": "PUSH",
                "T9s": "PUSH",
                "98s": "PUSH",
                "87s": "PUSH",
                "76s": "PUSH",
            },
            "10bb": {
                "AA": "PUSH", "KK": "PUSH", "QQ": "PUSH", "JJ": "PUSH", "TT": "PUSH",
                "99": "PUSH", "88": "PUSH", "77": "PUSH", "66": "PUSH", "55": "PUSH",
                "44": "PUSH", "33": "PUSH", "22": "PUSH",
                "AKs": "PUSH", "AQs": "PUSH", "AJs": "PUSH", "ATs": "PUSH", "A9s": "PUSH",
                "A8s": "PUSH", "A7s": "PUSH", "A6s": "PUSH", "A5s": "PUSH",
                "AKo": "PUSH", "AQo": "PUSH", "AJo": "PUSH", "ATo": "PUSH",
                "KQs": "PUSH", "KJs": "PUSH", "KTs": "PUSH",
                "KQo": "PUSH",
                "QJs": "PUSH", "QTs": "PUSH",
                "JTs": "PUSH",
                "T9s": "PUSH",
            },
        },
    },
    "default_action": "FOLD",
}

PUSH_FOLD_ADVANCED = {
    "name": "Push/Fold Advanced",
    "description": "Advanced push/fold with ICM considerations",
    "stack_range": [5, 25],
    "positions": ["BTN", "SB", "BB", "CO", "HJ", "LJ", "UTG"],
    "icm_spots": {
        "bubble": {
            "BTN": {
                "AA": "PUSH", "KK": "PUSH", "QQ": "PUSH", "JJ": "PUSH", "TT": "PUSH",
                "99": "PUSH", "88": "PUSH", "77": "PUSH",
                "AKs": "PUSH", "AQs": "PUSH", "AJs": "PUSH",
                "AKo": "PUSH", "AQo": "PUSH",
            },
        },
        "final_table": {
            "BTN": {
                "AA": "PUSH", "KK": "PUSH", "QQ": "PUSH", "JJ": "PUSH", "TT": "PUSH",
                "99": "PUSH", "88": "PUSH", "77": "PUSH", "66": "PUSH", "55": "PUSH",
                "AKs": "PUSH", "AQs": "PUSH", "AJs": "PUSH", "ATs": "PUSH",
                "AKo": "PUSH", "AQo": "PUSH", "AJo": "PUSH",
            },
        },
    },
    "default_action": "FOLD",
}

BB_DEFENSE = {
    "name": "BB Defense vs BTN",
    "description": "Big blind defense ranges against button opens",
    "vs_positions": ["BTN", "SB", "CO"],
    "charts": {
        "vs_BTN_2.5x": {
            "call": [
                "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
                "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
                "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o",
                "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s",
                "KQo", "KJo", "KTo", "K9o",
                "QJs", "QTs", "Q9s", "Q8s", "Q7s",
                "QJo", "QTo",
                "JTs", "J9s", "J8s", "J7s",
                "JTo",
                "T9s", "T8s", "T7s",
                "98s", "97s", "96s",
                "87s", "86s", "85s",
                "76s", "75s",
                "65s", "64s",
                "54s", "53s",
                "43s",
            ],
            "3bet": [
                "AA", "KK", "QQ", "JJ", "TT",
                "AKs", "AQs",
                "AKo",
            ],
        },
    },
    "default_action": "FOLD",
}

# ============================================================================
# MENTAL GAME SCENARIO DATA
# ============================================================================

TILT_TEST = {
    "id": "tilt_test_001",
    "name": "Tilt Control Test",
    "category": "tilt",
    "difficulty": 1,
    "scenarios": [
        {
            "id": "tilt_001",
            "intro": "You just lost 3 buy-ins to coolers in the last hour. Your opponent just 4-bet shoved with 72o and hit a full house.",
            "situation_context": "Session: -5 buy-ins | Time at table: 4 hours | Your image: Tight",
            "emotional_trigger": "tilt",
            "time_limit": 15,
            "choices": [
                {
                    "id": "TILT",
                    "label": "Express Frustration",
                    "description": "Type something in chat about their play",
                    "icon": "😤",
                    "emotional_type": "impulsive",
                },
                {
                    "id": "BREATHE",
                    "label": "Take a Deep Breath",
                    "description": "Pause, breathe, and refocus on the next hand",
                    "icon": "🧘",
                    "emotional_type": "rational",
                },
                {
                    "id": "LEAVE",
                    "label": "Leave the Table",
                    "description": "Take a break to clear your head",
                    "icon": "🚪",
                    "emotional_type": "passive",
                },
                {
                    "id": "DOUBLE",
                    "label": "Move Up Stakes",
                    "description": "Play higher to win it back faster",
                    "icon": "📈",
                    "emotional_type": "aggressive",
                },
            ],
            "correct_choice": "BREATHE",
            "explanation": "After a cooler, the best response is to take a breath and refocus. Expressing frustration gives opponents information, leaving might be premature, and moving up stakes while tilted is the worst poker decision you can make.",
            "emotional_lesson": "Coolers happen to everyone. Your response to variance determines your long-term success, not the cooler itself.",
        },
        {
            "id": "tilt_002",
            "intro": "You've been card dead for 2 hours. Finally you pick up AA, but get cracked by 96s who flopped two pair.",
            "situation_context": "Session: -2 buy-ins | Table image: Nitty | Last 50 hands: 0 VPIP",
            "emotional_trigger": "tilt",
            "time_limit": 15,
            "choices": [
                {
                    "id": "LOOSEN",
                    "label": "Start Playing More Hands",
                    "description": "Loosen up to make up for being card dead",
                    "icon": "🃏",
                    "emotional_type": "impulsive",
                },
                {
                    "id": "MAINTAIN",
                    "label": "Maintain Your Strategy",
                    "description": "Stick to your ranges and wait for good spots",
                    "icon": "🎯",
                    "emotional_type": "rational",
                },
                {
                    "id": "QUIT",
                    "label": "Quit for the Day",
                    "description": "The deck is against you today",
                    "icon": "🏠",
                    "emotional_type": "passive",
                },
                {
                    "id": "REVENGE",
                    "label": "Target That Player",
                    "description": "Focus on getting your chips back from them",
                    "icon": "👊",
                    "emotional_type": "aggressive",
                },
            ],
            "correct_choice": "MAINTAIN",
            "explanation": "Being card dead doesn't change math. Your ranges are still +EV. Loosening up or targeting specific players are emotional, not strategic decisions.",
            "emotional_lesson": "Variance is a feature, not a bug. Trust your strategy even when results are bad.",
        },
        {
            "id": "tilt_003",
            "intro": "You made a hero call with bottom pair and were right! But the river gave villain a runner-runner flush.",
            "situation_context": "Pot: 200BB | Your read was perfect | Villain: Recreational player",
            "emotional_trigger": "tilt",
            "time_limit": 15,
            "choices": [
                {
                    "id": "SHOW",
                    "label": "Show Your Hand",
                    "description": "Let them see the read was perfect",
                    "icon": "👀",
                    "emotional_type": "impulsive",
                },
                {
                    "id": "FOCUS",
                    "label": "Focus on the Process",
                    "description": "Great read - that's what matters",
                    "icon": "✅",
                    "emotional_type": "rational",
                },
                {
                    "id": "BERATE",
                    "label": "Comment on Their Play",
                    "description": "They need to know that was a bad call",
                    "icon": "😠",
                    "emotional_type": "aggressive",
                },
                {
                    "id": "LEAVE",
                    "label": "Take a Short Break",
                    "description": "Walk it off before the next hand",
                    "icon": "🚶",
                    "emotional_type": "passive",
                },
            ],
            "correct_choice": "FOCUS",
            "explanation": "Your process was perfect. That's all you can control. Showing, berating, or leaving all focus on the result instead of the decision.",
            "emotional_lesson": "Process over results. You want players to make these calls against you - they'll lose in the long run.",
        },
    ],
}

FEAR_TEST = {
    "id": "fear_test_001",
    "name": "Fear Management Test",
    "category": "fear",
    "difficulty": 2,
    "scenarios": [
        {
            "id": "fear_001",
            "intro": "You're in a big pot with the nut flush draw on the turn. Villain bets 75% pot and you know shoving is +EV.",
            "situation_context": "Pot: 150BB | Your stack: 100BB | Villain covers you",
            "emotional_trigger": "fear",
            "time_limit": 15,
            "choices": [
                {
                    "id": "SHOVE",
                    "label": "Shove All-In",
                    "description": "Take the +EV play you identified",
                    "icon": "🚀",
                    "emotional_type": "rational",
                },
                {
                    "id": "CALL",
                    "label": "Just Call",
                    "description": "See the river before committing",
                    "icon": "📞",
                    "emotional_type": "passive",
                },
                {
                    "id": "FOLD",
                    "label": "Fold",
                    "description": "Too risky right now",
                    "icon": "🏃",
                    "emotional_type": "passive",
                },
                {
                    "id": "MINRAISE",
                    "label": "Min-Raise",
                    "description": "Build the pot but keep options open",
                    "icon": "📊",
                    "emotional_type": "impulsive",
                },
            ],
            "correct_choice": "SHOVE",
            "explanation": "If you've identified a +EV spot, fear shouldn't stop you. Calling or folding gives up equity. Min-raising is the worst of both worlds.",
            "emotional_lesson": "Fear is information, not instruction. Acknowledge it, then execute your strategy.",
        },
        {
            "id": "fear_002",
            "intro": "It's your first time at $5/$10. The players seem tougher than your usual $2/$5 game.",
            "situation_context": "Bankroll: 30 buy-ins for this stake | First orbit | You feel nervous",
            "emotional_trigger": "fear",
            "time_limit": 15,
            "choices": [
                {
                    "id": "TIGHT",
                    "label": "Play Extra Tight",
                    "description": "Only play premium hands until you settle in",
                    "icon": "🛡️",
                    "emotional_type": "passive",
                },
                {
                    "id": "NORMAL",
                    "label": "Play Your Normal Game",
                    "description": "Trust your skills and ranges",
                    "icon": "🎯",
                    "emotional_type": "rational",
                },
                {
                    "id": "AGGRESSIVE",
                    "label": "Show Them You Belong",
                    "description": "Play aggressively to establish presence",
                    "icon": "💪",
                    "emotional_type": "aggressive",
                },
                {
                    "id": "LEAVE",
                    "label": "Move Down",
                    "description": "Maybe you're not ready",
                    "icon": "⬇️",
                    "emotional_type": "passive",
                },
            ],
            "correct_choice": "NORMAL",
            "explanation": "If you have the bankroll and skills, play your game. Being extra tight or aggressive are fear-based adjustments. Leaving before trying isn't growth.",
            "emotional_lesson": "Growth happens outside comfort zones. Trust your preparation.",
        },
    ],
}

GREED_TEST = {
    "id": "greed_test_001",
    "name": "Greed Control Test",
    "category": "greed",
    "difficulty": 2,
    "scenarios": [
        {
            "id": "greed_001",
            "intro": "You're up 5 buy-ins and running hot. You feel invincible and are considering moving up stakes.",
            "situation_context": "Session: +5 buy-ins | Time: 3 hours | Your reads have been perfect",
            "emotional_trigger": "greed",
            "time_limit": 15,
            "choices": [
                {
                    "id": "MOVEUP",
                    "label": "Move Up Stakes",
                    "description": "Ride the heater while it lasts",
                    "icon": "📈",
                    "emotional_type": "impulsive",
                },
                {
                    "id": "STAY",
                    "label": "Stay at Current Stakes",
                    "description": "Stick to your bankroll management",
                    "icon": "🎯",
                    "emotional_type": "rational",
                },
                {
                    "id": "QUIT",
                    "label": "Lock Up the Win",
                    "description": "Quit while you're ahead",
                    "icon": "🔒",
                    "emotional_type": "passive",
                },
                {
                    "id": "DOUBLE",
                    "label": "Double Your Buy-In",
                    "description": "Add to the stack you're playing",
                    "icon": "💰",
                    "emotional_type": "aggressive",
                },
            ],
            "correct_choice": "STAY",
            "explanation": "Winning sessions don't change your edge or bankroll requirements. Moving up on a heater is gambling, not poker.",
            "emotional_lesson": "Hot streaks end. Cold streaks end. Bankroll management is forever.",
        },
        {
            "id": "greed_002",
            "intro": "You have top set on a wet board. Villain is showing strength. You could check for pot control or bet big for value.",
            "situation_context": "Pot: 80BB | You have top set | Board has flush draw | Villain seems strong",
            "emotional_trigger": "greed",
            "time_limit": 15,
            "choices": [
                {
                    "id": "OVERBET",
                    "label": "Overbet the Pot",
                    "description": "Get maximum value from your monster",
                    "icon": "💎",
                    "emotional_type": "aggressive",
                },
                {
                    "id": "STANDARD",
                    "label": "Standard Value Bet",
                    "description": "Bet 60-75% pot for value",
                    "icon": "🎯",
                    "emotional_type": "rational",
                },
                {
                    "id": "CHECK",
                    "label": "Check for Pot Control",
                    "description": "Let them bluff or catch up",
                    "icon": "✋",
                    "emotional_type": "passive",
                },
                {
                    "id": "ALLIN",
                    "label": "Move All-In",
                    "description": "Don't let draws get there",
                    "icon": "🚀",
                    "emotional_type": "impulsive",
                },
            ],
            "correct_choice": "STANDARD",
            "explanation": "With top set, you want to extract value while keeping villain's range wide. Overbetting or shoving fold out too many hands.",
            "emotional_lesson": "Maximum value doesn't mean maximum bet size. Think about what hands can call.",
        },
    ],
}

PATIENCE_TEST = {
    "id": "patience_test_001",
    "name": "Patience Test",
    "category": "impatience",
    "difficulty": 1,
    "scenarios": [
        {
            "id": "patience_001",
            "intro": "You've folded 25 hands in a row. Finally you pick up KQo in middle position.",
            "situation_context": "Last 25 hands: 0 VPIP | Table image: Ultra tight | Position: MP",
            "emotional_trigger": "impatience",
            "time_limit": 15,
            "choices": [
                {
                    "id": "RAISE",
                    "label": "Open Raise",
                    "description": "Finally a playable hand, let's go",
                    "icon": "🎰",
                    "emotional_type": "impulsive",
                },
                {
                    "id": "FOLD",
                    "label": "Fold",
                    "description": "KQo in MP isn't that strong",
                    "icon": "❌",
                    "emotional_type": "rational",
                },
                {
                    "id": "LIMP",
                    "label": "Limp In",
                    "description": "See a flop cheaply",
                    "icon": "👀",
                    "emotional_type": "passive",
                },
                {
                    "id": "3X",
                    "label": "Make It 3x",
                    "description": "Standard open raise",
                    "icon": "📊",
                    "emotional_type": "rational",
                },
            ],
            "correct_choice": "FOLD",
            "explanation": "KQo in middle position is a marginal hand. Being card dead doesn't make it better. Your tight image also means you'll get less action from worse hands.",
            "emotional_lesson": "Hand selection doesn't change based on how long you've been folding. Stay disciplined.",
        },
    ],
}

# ============================================================================
# FILE CREATION FUNCTIONS
# ============================================================================

def create_directories():
    """Create the required directories if they don't exist."""
    print("📁 Creating directories...")
    CHARTS_DIR.mkdir(parents=True, exist_ok=True)
    SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"   ✓ {CHARTS_DIR}")
    print(f"   ✓ {SCENARIOS_DIR}")

def write_json(path: Path, data: dict, name: str):
    """Write a JSON file with pretty formatting."""
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"   ✓ {name}: {path.name}")

def create_chart_files():
    """Create all push/fold chart files."""
    print("\n📊 Creating chart files...")
    write_json(CHARTS_DIR / "push_fold_basic.json", PUSH_FOLD_BASIC, "Push/Fold Basic")
    write_json(CHARTS_DIR / "push_fold_advanced.json", PUSH_FOLD_ADVANCED, "Push/Fold Advanced")
    write_json(CHARTS_DIR / "bb_defense.json", BB_DEFENSE, "BB Defense")

def create_scenario_files():
    """Create all mental game scenario files."""
    print("\n🧠 Creating scenario files...")
    write_json(SCENARIOS_DIR / "tilt_test.json", TILT_TEST, "Tilt Control")
    write_json(SCENARIOS_DIR / "fear_test.json", FEAR_TEST, "Fear Management")
    write_json(SCENARIOS_DIR / "greed_test.json", GREED_TEST, "Greed Control")
    write_json(SCENARIOS_DIR / "patience_test.json", PATIENCE_TEST, "Patience Test")

def main():
    """Main entry point."""
    print("=" * 60)
    print("🎮 SMARTER.POKER - Dummy Data Setup")
    print("=" * 60)

    create_directories()
    create_chart_files()
    create_scenario_files()

    print("\n" + "=" * 60)
    print("✅ Setup complete!")
    print(f"   Charts: {len(list(CHARTS_DIR.glob('*.json')))} files")
    print(f"   Scenarios: {len(list(SCENARIOS_DIR.glob('*.json')))} files")
    print("=" * 60)

if __name__ == "__main__":
    main()
