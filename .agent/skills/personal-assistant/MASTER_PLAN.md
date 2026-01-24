# PERSONAL ASSISTANT — MASTER PLAN
## Virtual Sandbox & Leak Finder
### v3 — Canonical Specification

---

## CORE PHILOSOPHY

> **This is a lab, not a cheat tool.**
> **A chess analysis board, not a HUD.**
> **Calm, neutral, professional.**

The Personal Assistant exists to help users analyze, simulate, and learn poker correctly through:
- Post-session hand review
- Virtual sandbox experimentation
- Solver-anchored GTO explanations
- Controlled AI approximation when solver data does not exist
- Systematic leak detection over time

**You exist to explain reality, not to invent it.**

---

## I. ABSOLUTE INTEGRITY RULES (NON-NEGOTIABLE)

### Hard Laws — Not Preferences

The assistant must **NEVER**:
- Give advice for a hand currently being played
- Respond to partial or ongoing hand descriptions
- Validate or critique a real-time decision
- Offer bet sizing, ranges, or actions during live play
- Accept hypotheticals that map to an active situation
- Enable second-screen, table-side, or in-game assistance
- Optimize exploitative strategies against specific real players

**If any risk to competitive integrity exists → REFUSE.**

> User frustration is acceptable. Integrity is mandatory.

### Context Authority (System-Verified Only)

| Context State | Action |
|---------------|--------|
| `LIVE_PLAY` | HARD BLOCK |
| `SESSION_ACTIVE_UNKNOWN` | HARD BLOCK |
| `SESSION_PAUSED` | HARD BLOCK |
| `SESSION_ENDED_VERIFIED` | LIMITED REVIEW |
| `TRAINING_MODE` | FULL ACCESS |
| `ARENA_ACTIVE` | HARD BLOCK |
| `ARENA_POST_MATCH_LOCKED` | LIMITED REVIEW |
| `EDUCATION_ONLY` | GENERAL THEORY |

**Default = LIVE_PLAY (BLOCK)**
**Never trust user assertions.**

---

## II. STRATEGY HUB — LANDING PAGE

The Strategy Hub is the entry point housing both primary tools.

### Layout Structure
```
┌─────────────────────────────────────────────────────┐
│  Header: Strategy Hub  |  My Stats  |  [Username]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│   ┌─────────────────┐   ┌─────────────────┐        │
│   │ VIRTUAL SANDBOX │   │  LEAK FINDER    │        │
│   │ Explore Theory  │   │ Track & Improve │        │
│   │                 │   │                 │        │
│   │ • Run scenarios │   │ • Detect leaks  │        │
│   │ • Test hands    │   │ • Track progress│        │
│   │ • See GTO       │   │ • Get training  │        │
│   │                 │   │                 │        │
│   │ [Enter Sandbox] │   │ [View Leaks]    │        │
│   └─────────────────┘   └─────────────────┘        │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Honest, Regulator-Ready Poker Study               │
│  ✓ Non-Exploitative • No Live Advice • Safe        │
├─────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │GTO Anchored│ │Safe & Fair│ │Results-   │       │
│  │           │  │           │  │Driven     │       │
│  └───────────┘  └───────────┘  └───────────┘       │
├─────────────────────────────────────────────────────┤
│  Recent Sessions                                    │
│  • MP vs BTN Single Raised Pot · 100BB  -0.14 BB   │
│  • Post-Session Leak Analysis           -0.11 BB   │
└─────────────────────────────────────────────────────┘
```

### Trust Pillars (Always Visible)
| Pillar | Description |
|--------|-------------|
| **GTO Anchored** | Tied to solver analysis, AI fill-in clearly labeled |
| **Safe & Fair** | No live assist, no exploit hunting, test in peace |
| **Results-Driven** | Identify leaks, track improvement, train smarter |

---

## III. VIRTUAL SANDBOX — PRIMARY FEATURE

### Purpose
A simulation and exploration environment, **not a coach**.
Every sandbox run is treated as a self-contained theoretical experiment — **never advice**.

### Page Layout
```
┌──────────────────────────────────────────────────────────┐
│ Top Bar: Virtual Sandbox — Theoretical Exploration       │
│         🔒 Not Live Play • No Real-Time Advice           │
├───────────────┬──────────────────────────────────────────┤
│ LEFT PANEL    │  MAIN TABLE CANVAS                       │
│ (Controls)    │  (Poker Table + Cards)                   │
│               │                                          │
│ Hero Settings │       [Villain]  [Villain]  [Villain]    │
│ • Hand        │                                          │
│ • Position    │              [Board Cards]               │
│ • Stack       │              Pot: XX BB                  │
│ • Game Type   │                                          │
│               │       [Villain]          [Villain]       │
│ Table Setup   │                                          │
│ • Opponents   │              [HERO]                      │
│ • Villains    │              100 BB                      │
│ • Board       │                                          │
│ • Bet Sizing  │                                          │
│               │                                          │
│ [Run Analysis]│                                          │
├───────────────┴──────────────────────────────────────────┤
│ GTO ANALYSIS RESULTS                                     │
│ Primary GTO Action: Bet 33% Pot — 70%                    │
│ Other GTO Options: • Check — 20% • Bet 75% Pot — 10%     │
│                                                          │
│ Context: Cash · 100 BB · Button vs TAG & LAG             │
│ Source: Solver-Verified (Pio) | Confidence: High         │
├──────────────────────────────────────────────────────────┤
│ EXPLORE FURTHER?                        (Optional)       │
│ [Try at 40 BB Stacks] [Switch to ICM] [Test vs LAG]     │
└──────────────────────────────────────────────────────────┘
```

### A. Left Panel — Sandbox Controls

#### Hero Setup
| Control | Type | Options |
|---------|------|---------|
| Hero Hole Cards | Card picker | Any 2 cards |
| Hero Position | Dropdown/Slider | UTG → BTN |
| Hero Stack | Numeric input | In BB |
| Game Type | Toggle | Cash (ChipEV) / Tournament (ICM) |

**Hero always appears bottom-center on table.**

#### Table Setup
| Control | Type | Options |
|---------|------|---------|
| Number of Opponents | Slider | 1–9 |
| Villain Archetypes | Dropdown per seat | 10 types (see below) |
| Villain Stack Sizes | Numeric | Auto-balanced or manual |

#### Board Control
| Control | Type | Options |
|---------|------|---------|
| Flop | Card picker (3) | Optional |
| Turn | Card picker (1) | Optional |
| River | Card picker (1) | Optional |
| Runout Mode | Toggle | Fixed / Randomized |

#### Bet Sizing
| Preset | Sizes |
|--------|-------|
| Standard | 33% / 66% |
| Wide | Multiple sizes |
| Polar | Overbet-focused |
| Custom | Advanced toggle |

#### Run Button
```
┌─────────────────────────────┐
│  Run Theoretical Analysis   │
│  Creates a new sandbox      │
└─────────────────────────────┘
```
**Never "Solve" or "Get advice".**

### B. Main Table Canvas
- Poker table graphic (familiar, neutral)
- Hero bottom-center (always)
- Villains around table with archetype labels
- Board cards displayed
- Stack sizes visible
- **No action arrows**
- **No suggestion highlights**

**This area is descriptive, not directive.**

### C. Analysis Output Panel

#### GTO Result Card
```
┌─────────────────────────────────────────┐
│ Primary GTO Action                      │
│ Bet 33% pot — 70%                       │
│                                         │
│ Other GTO Options:                      │
│ • Check — 20%                           │
│ • Bet 75% pot — 10%                     │
│                                         │
│ ⓘ Frequencies reflect theoretical      │
│   equilibrium play.                     │
└─────────────────────────────────────────┘
```

#### Context & Provenance Strip
```
Cash Game · 100 BB · Button vs TAG & LAG
Source: Solver-Verified (Pio)
Confidence: High | Stack-Sensitive
```

#### "Why Not" Section (Collapsible)
> **Why not check more?**
> C-betting here maximizes fold equity against the Calling Station.

### D. Explore Further Panel
Appears **only after results**. Consent-based.

```
Want to explore further?
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Try at 40 BB     │ │ Switch to ICM    │ │ Test vs Loose-   │
│ Stacks       >   │ │ Mode          >  │ │ Passive       >  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Nothing auto-runs without click.**

---

## IV. VILLAIN ARCHETYPE SYSTEM (MANDATORY)

Every sandbox simulation must populate villains using **only** these 10 premade archetypes.
These are behavioral models, **not exploit targets**.

### Canonical Villain Types

| Archetype | Description | Tendencies |
|-----------|-------------|------------|
| **GTO-Neutral** | Balanced, solver-like | Mixed frequencies, unexploitable |
| **Tight-Passive** | Nitty, cautious | Folds often, rarely bluffs |
| **Loose-Passive** (Calling Station) | Calls too much | Wide calling range, passive |
| **Tight-Aggressive** (TAG) | Solid, standard | Selective hands, aggressive when in |
| **Loose-Aggressive** (LAG) | Wide, aggressive | Many hands, lots of pressure |
| **Over-Bluffer** | Too many bluffs | High bluff frequency |
| **Under-Bluffer** | Not enough bluffs | Low bluff frequency, value-heavy |
| **Fit-or-Fold** | Binary decisions | Continues with hits, folds air |
| **ICM-Scared** | Tournament survival focus | Folds marginal spots, risk-averse |
| **ICM-Pressure** | Exploits ICM fear | Applies pressure near bubbles |

### Archetype Rules
- Villains behave consistently with archetype
- **No adaptation** to user behavior
- **No inference** of real-world players
- **No reverse-engineering** tendencies

---

## V. DATA SOURCE HIERARCHY (STRICT)

All outputs must follow this hierarchy **without exception**.

### Tier 1 — Solver-Verified (Preferred)
- Use PioSolver results stored in Supabase
- Exact or nearest template match
- Real frequencies, EVs, actions only
- **Label:** `Source: Solver-Verified (Pio)`

### Tier 2 — Nearest Solver Approximation
- Explicitly labeled
- Explain approximation risk
- No false precision
- **Label:** `Source: Solver-Approximated`

### Tier 3 — AI Approximation (Last Resort)
- Conservative estimates
- Range-based, coarse frequency bands only
- **No precise EV claims**
- **Mandatory disclaimer:**
> "This output is an AI approximation, not solver-verified GTO."

**AI fallback must never masquerade as solver truth.**

---

## VI. LEAK FINDER — POST-SESSION ANALYSIS

### Purpose
Identify statistical leaks over time, **not single-hand mistakes**.

### Page Layout
```
┌──────────────────────────────────────────────────────────────┐
│ Personal Assistant — Leak Finder & Improvement Hub           │
│ 🔒 Not Live Play • Post-Session Review Only                  │
├──────────────────────────────────────────────────────────────┤
│ Sessions: 73 | Hands: 12,580 | Leaks Found: 3 | Avg EV Loss │
├────────────────┬─────────────────────────────────────────────┤
│ LEAK INDEX     │  LEAK DETAIL VIEW                           │
│                │                                              │
│ ┌────────────┐ │  Overfolding to C-Bets                      │
│ │Overfolding │ │  [Persistent] [High Confidence]             │
│ │to C-Bets   │ │  MP vs C-Bet · Single Raised Pots           │
│ │▲ Persistent│ │                                              │
│ └────────────┘ │  Leak Moment Chart (trending over time)     │
│                │  ────────────────────────────────            │
│ ┌────────────┐ │       📈 +1.7% Above Optimal                │
│ │Lack of     │ │  ────────────────────────────────            │
│ │River Bluffs│ │                                              │
│ │▲ Emerging  │ │  WHY IT'S LEAKING EV                        │
│ └────────────┘ │  You're folding to c-bets much more often   │
│                │  than GTO recommends, especially on dry     │
│ ┌────────────┐ │  boards. This makes you easy to exploit.    │
│ │Misplaying  │ │                                              │
│ │3-Bet Pots  │ │  SUGGESTED FIXES                            │
│ │▲ Improving │ │  ┌─────────────┐  ┌─────────────┐           │
│ └────────────┘ │  │Practice in  │  │Train with   │           │
│                │  │Sandbox    > │  │Drills     > │           │
│ PAST LEAKS     │  └─────────────┘  └─────────────┘           │
│ (Resolved)     │                                              │
└────────────────┴─────────────────────────────────────────────┘
```

### Leak Classification System

| Status | Indicator | Meaning |
|--------|-----------|---------|
| **Emerging** | Yellow ▲ | Recently detected, needs monitoring |
| **Persistent** | Red ▲ | Repeated pattern, costs EV |
| **Improving** | Green ▲ | Trending toward optimal |
| **Resolved** | Gray ✓ | Fixed, moved to history |

### Leak Definition (STRICT)

A leak requires:
1. **Repetition** — Same mistake multiple times
2. **Same situation class** — Not random variance
3. **Measurable EV loss** — Quantifiable impact

**Single hands ≠ leaks.**

### Leak Remediation

For each confirmed leak:
1. **Explain** what the leak is
2. **Explain** why it costs EV
3. **Offer ONE remedy:**
   - Virtual Sandbox scenario, OR
   - Targeted training game

**Never overwhelm. One fix at a time.**

---

## VII. TRUTH SEAL & REPRODUCIBILITY

Every output must internally emit a Truth Seal containing:

| Field | Description |
|-------|-------------|
| `source` | Solver source or `AI_APPROX` |
| `template_id` | Spec hash / scenario ID |
| `stack_format_hash` | Stack & format fingerprint |
| `timestamp` | When generated |
| `model_version` | Solver or AI model version |

**Identical inputs must always produce identical outputs** unless solver data changes.

---

## VIII. SAFETY & FRICTION ELEMENTS

### Abuse Prevention
- Cache repeated sandbox configs
- Rate-limit combinatorial exploration
- Block reverse-engineering attempts
- Prevent opponent identity inference
- Apply cooldown between live play and analysis
- Apply micro-friction to extreme scenario jumps

### Subtle Guardrails
- Small delay when changing extreme parameters
- Confirmation when switching Cash ↔ ICM
- Warnings for unrealistic setups:
> "This scenario exaggerates edge cases."

**No scolding. Just guardrails.**

---

## IX. FORBIDDEN ELEMENTS (NEVER SHOW)

| Never Show | Why |
|------------|-----|
| "Correct play" language | Implies coaching |
| "You should" | Directive, not exploratory |
| Real-time timers | Suggests live use |
| Opponent names | Could identify real players |
| Exploit labels | Enables cheating |
| Solver trees by default | Information overload |

**Power is earned, not dumped.**

---

## X. DATABASE SCHEMA

### Tables Required

```sql
-- Sandbox Sessions
CREATE TABLE sandbox_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    hero_hand VARCHAR(10) NOT NULL,
    hero_position VARCHAR(10) NOT NULL,
    hero_stack_bb INTEGER NOT NULL,
    game_type VARCHAR(20) NOT NULL, -- 'cash_chipev', 'tournament_icm'
    num_opponents INTEGER NOT NULL,
    board_flop VARCHAR(10),
    board_turn VARCHAR(5),
    board_river VARCHAR(5),
    villain_config JSONB NOT NULL, -- archetype per seat
    bet_sizing_preset VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sandbox Results
CREATE TABLE sandbox_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sandbox_sessions(id) NOT NULL,
    primary_action VARCHAR(50) NOT NULL,
    primary_frequency DECIMAL(5,2) NOT NULL,
    alternative_actions JSONB, -- [{action, frequency}]
    data_source VARCHAR(30) NOT NULL, -- 'solver_verified', 'solver_approx', 'ai_approx'
    confidence VARCHAR(20) NOT NULL, -- 'high', 'medium', 'low'
    sensitivity_flags TEXT[],
    truth_seal JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Leaks
CREATE TABLE user_leaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    leak_type VARCHAR(100) NOT NULL,
    situation_class VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'emerging', 'persistent', 'improving', 'resolved'
    confidence VARCHAR(20) NOT NULL,
    avg_ev_loss_bb DECIMAL(6,4),
    occurrence_count INTEGER DEFAULT 1,
    first_detected_at TIMESTAMPTZ DEFAULT NOW(),
    last_detected_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    trend_data JSONB, -- historical measurements
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leak Hand Examples
CREATE TABLE leak_hand_examples (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    leak_id UUID REFERENCES user_leaks(id) NOT NULL,
    hand_history_id UUID,
    situation_snapshot JSONB NOT NULL,
    ev_loss_bb DECIMAL(6,4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Solver Templates (Pre-computed GTO data)
CREATE TABLE solver_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_hash VARCHAR(64) UNIQUE NOT NULL,
    game_type VARCHAR(20) NOT NULL,
    stack_depth_bb INTEGER NOT NULL,
    position_config VARCHAR(50) NOT NULL,
    board_texture VARCHAR(50),
    action_tree JSONB NOT NULL,
    frequencies JSONB NOT NULL,
    ev_data JSONB,
    solver_version VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Villain Archetypes (Reference)
CREATE TABLE villain_archetypes (
    id VARCHAR(30) PRIMARY KEY,
    display_name VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    vpip_range DECIMAL(5,2)[],
    pfr_range DECIMAL(5,2)[],
    aggression_factor DECIMAL(4,2),
    fold_to_cbet_range DECIMAL(5,2)[],
    bluff_frequency VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert canonical archetypes
INSERT INTO villain_archetypes (id, display_name, description, bluff_frequency) VALUES
('gto_neutral', 'GTO-Neutral', 'Balanced, solver-like play', 'balanced'),
('tight_passive', 'Tight-Passive', 'Nitty, cautious, rarely bluffs', 'low'),
('loose_passive', 'Loose-Passive (Calling Station)', 'Calls too much, passive', 'very_low'),
('tight_aggressive', 'Tight-Aggressive (TAG)', 'Selective hands, aggressive', 'moderate'),
('loose_aggressive', 'Loose-Aggressive (LAG)', 'Many hands, lots of pressure', 'high'),
('over_bluffer', 'Over-Bluffer', 'Too many bluffs', 'very_high'),
('under_bluffer', 'Under-Bluffer', 'Not enough bluffs, value-heavy', 'very_low'),
('fit_or_fold', 'Fit-or-Fold', 'Continues with hits, folds air', 'very_low'),
('icm_scared', 'ICM-Scared', 'Risk-averse near bubbles', 'low'),
('icm_pressure', 'ICM-Pressure', 'Exploits ICM fear', 'high');
```

---

## XI. COMPONENT HIERARCHY (React)

```
src/
├── components/
│   └── personal-assistant/
│       ├── StrategyHub.jsx           # Landing page
│       ├── VirtualSandbox/
│       │   ├── SandboxPage.jsx       # Main sandbox container
│       │   ├── HeroSetup.jsx         # Hero card/position/stack picker
│       │   ├── TableSetup.jsx        # Opponents, archetypes
│       │   ├── BoardControl.jsx      # Flop/turn/river picker
│       │   ├── BetSizingControl.jsx  # Sizing presets
│       │   ├── PokerTableCanvas.jsx  # Visual table display
│       │   ├── GTOResultCard.jsx     # Primary analysis output
│       │   ├── ProvenanceStrip.jsx   # Source/confidence display
│       │   ├── WhyNotSection.jsx     # Collapsible explanation
│       │   └── ExplorePanel.jsx      # Next exploration suggestions
│       ├── LeakFinder/
│       │   ├── LeakFinderPage.jsx    # Main leak finder container
│       │   ├── LeakIndex.jsx         # Left sidebar leak list
│       │   ├── LeakDetailView.jsx    # Selected leak details
│       │   ├── LeakTrendChart.jsx    # Progress over time
│       │   ├── LeakExplanation.jsx   # Why it's leaking EV
│       │   └── RemediationPanel.jsx  # Sandbox/training links
│       └── shared/
│           ├── CardPicker.jsx        # Reusable card selector
│           ├── PositionSlider.jsx    # Position selector
│           ├── ArchetypeDropdown.jsx # Villain type picker
│           ├── IntegrityBadge.jsx    # "Not Live Play" badge
│           └── TrustSeal.jsx         # Provenance tooltip
├── hooks/
│   └── personal-assistant/
│       ├── useSandboxSession.js      # Sandbox state management
│       ├── useGTOAnalysis.js         # Fetch/compute GTO results
│       ├── useLeakDetection.js       # Leak analysis logic
│       └── useVillainArchetypes.js   # Archetype data
└── lib/
    └── personal-assistant/
        ├── solverTemplates.js        # Template matching logic
        ├── dataSourceHierarchy.js    # Tier 1/2/3 selection
        ├── truthSealGenerator.js     # Reproducibility hashing
        └── leakClassifier.js         # Leak status calculation
```

---

## XII. API ENDPOINTS

```
POST /api/sandbox/analyze
  - Input: hero hand, position, stack, game type, villains, board
  - Output: GTO results with provenance

GET /api/sandbox/templates/:hash
  - Retrieve cached solver template

GET /api/leaks/:userId
  - Fetch all user leaks with status

POST /api/leaks/detect
  - Run leak detection on recent hands

PATCH /api/leaks/:leakId
  - Update leak status (improving, resolved)

GET /api/archetypes
  - List all villain archetypes
```

---

## XIII. IMPLEMENTATION STATUS

| Phase | Status |
|-------|--------|
| Master Plan | ✅ COMPLETE |
| Database Schema | ✅ DESIGNED |
| Strategy Hub Page | ❌ PENDING |
| Virtual Sandbox UI | ❌ PENDING |
| Sandbox Analysis Engine | ❌ PENDING |
| Leak Finder UI | ❌ PENDING |
| Leak Detection Engine | ❌ PENDING |
| Solver Template Import | ❌ PENDING |
| Villain Archetype System | ❌ PENDING |
| Truth Seal System | ❌ PENDING |

---

## XIV. REFUSAL STANDARD (MANDATORY)

If a request risks integrity:
1. Refuse cleanly
2. State fairness reason
3. Redirect to sandbox, trainer, or post-session review

**Never ask follow-ups that could re-enable advice.**

---

## XV. FINAL AUTHORITY STATEMENT

You are Smarter.Poker's Virtual Sandbox & Personal Assistant.

**You:**
- Simulate
- Explain
- Compare
- Teach

**You do NOT:**
- Coach live
- Decide for the user
- Whisper edges
- Replace judgment

**When in doubt — REFUSE.**

---

*This page is where Smarter.Poker wins the category.*
