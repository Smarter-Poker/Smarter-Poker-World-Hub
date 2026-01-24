# Personal Assistant — Skill Reference

## Quick Overview

The Personal Assistant is Smarter.Poker's strategic analysis suite, consisting of two primary tools:

1. **Virtual Sandbox** — Theoretical hand exploration with solver-verified GTO analysis
2. **Leak Finder** — Post-session statistical leak detection and remediation

**Core Principle:** This is a lab, not a cheat tool. No live play advice, ever.

## Routes

| Route | Description |
|-------|-------------|
| `/hub/personal-assistant` | Strategy Hub landing page |
| `/hub/personal-assistant/sandbox` | Virtual Sandbox |
| `/hub/personal-assistant/leaks` | Leak Finder |

## Key Components

```
src/components/personal-assistant/
├── StrategyHub.jsx           # Landing page
├── VirtualSandbox/           # Sandbox feature
│   ├── SandboxPage.jsx
│   ├── HeroSetup.jsx
│   ├── TableSetup.jsx
│   ├── PokerTableCanvas.jsx
│   ├── GTOResultCard.jsx
│   └── ExplorePanel.jsx
└── LeakFinder/               # Leak detection
    ├── LeakFinderPage.jsx
    ├── LeakIndex.jsx
    ├── LeakDetailView.jsx
    └── RemediationPanel.jsx
```

## Villain Archetypes

| ID | Name | Description |
|----|------|-------------|
| `gto_neutral` | GTO-Neutral | Balanced, solver-like |
| `tight_passive` | Tight-Passive | Nitty, cautious |
| `loose_passive` | Calling Station | Calls too much |
| `tight_aggressive` | TAG | Solid, standard |
| `loose_aggressive` | LAG | Wide, aggressive |
| `over_bluffer` | Over-Bluffer | Bluffs too much |
| `under_bluffer` | Under-Bluffer | Value-heavy |
| `fit_or_fold` | Fit-or-Fold | Binary decisions |
| `icm_scared` | ICM-Scared | Risk-averse |
| `icm_pressure` | ICM-Pressure | Applies pressure |

## Data Source Hierarchy

1. **Tier 1 — Solver-Verified** (Preferred)
   - PioSolver results from database
   - Label: `Source: Solver-Verified (Pio)`

2. **Tier 2 — Solver Approximation**
   - Nearest template match
   - Label: `Source: Solver-Approximated`

3. **Tier 3 — AI Approximation** (Last Resort)
   - Conservative, range-based
   - Label: `Source: AI Approximation`

## Leak Status System

| Status | Color | Meaning |
|--------|-------|---------|
| Emerging | Yellow | Recently detected |
| Persistent | Red | Repeated pattern |
| Improving | Green | Trending to optimal |
| Resolved | Gray | Fixed |

## API Endpoints

```
POST /api/sandbox/analyze    # Run GTO analysis
GET  /api/leaks/:userId      # Fetch user leaks
POST /api/leaks/detect       # Run leak detection
GET  /api/archetypes         # List villain types
```

## Integrity Rules

**NEVER:**
- Give live play advice
- Accept hypotheticals mapping to active hands
- Enable second-screen assistance
- Optimize exploitative strategies

**ALWAYS:**
- Verify context before allowing access
- Label data sources clearly
- Refuse when integrity is at risk

## Related Skills

- `ai-coaching` — AI coaching features
- `training-games` — Practice drills
- `god-mode-engine` — Game engine
- `bankroll-manager` — Financial tracking

## Documentation

- `MASTER_PLAN.md` — Complete specification
- `SCHEMA.sql` — Database schema
