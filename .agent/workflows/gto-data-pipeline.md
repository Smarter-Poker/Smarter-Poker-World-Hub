---
description: GTO-A Protocol v13.0 - OPERATION CLEAN SWEEP - Production Polish
---

# GTO-A PROTOCOL v13.0 (LOCKED)

> [!CAUTION]
> **CHIEF GTO ARCHITECT | OPERATION CLEAN SWEEP ACTIVE**
> Dev Note Purge + Gap Math Fix + Math Sync + Header Unification

---

## 🧹 OPERATION CLEAN SWEEP — QC PATCHES (v13.0)

### PATCH 1: PURGE DEV NOTES

> [!CAUTION]
> **CONSTRAINT**: NEVER include formatting instructions in output text.

| ❌ BANNED PHRASES | ✅ CLEAN VERSION |
|-------------------|------------------|
| "(RED color indicator)" | DELETE entirely |
| "(GREEN color)" | DELETE entirely |
| "(YELLOW color)" | DELETE entirely |
| "but very rare" | DELETE or rephrase |

**Example Fix:**
- ❌ "FOLD 5% - Never (RED color indicator but very rare)"
- ✅ "FOLD 5% - Only Against Massive Overbets"

---

### PATCH 2: GAP MATH (CORRECT DEFINITIONS)

> [!CAUTION]
> **CONSTRAINT**: Count the gaps correctly.

| Hand | Missing Ranks | Gap Count | ✅ CORRECT Label |
|------|---------------|-----------|------------------|
| 98s | None | 0 | Suited Connector |
| T8s | 9 | 1 | Suited One-Gapper |
| J8s | T, 9 | 2 | Suited Two-Gapper |
| Q8s | J, T, 9 | 3 | Suited Three-Gapper |
| **K9s** | **Q, J, T** | **3** | **Suited King-High** or **Suited Three-Gapper** |
| A9s | K, Q, J, T | 4 | Suited Ace-High |

**K9s is NOT a Two-Gapper. It is a THREE-GAPPER.**

---

### PATCH 3: MATH SYNC

> [!CAUTION]
> **CONSTRAINT**: HUD Badge % MUST equal the Solver Text %.

**Validation Check:**
```
IF Header Badge = X%
THEN GTO Approach text MUST say "Solver [Action]s X%"
AND Alternate Plays MUST sum to (100% - X%)
```

**Example:**
- Header: RAISE 85%
- Text: "Solver Raises 85%..."
- Alternates: SHOVE 10% + CALL 5% = 15% ✓ (85 + 15 = 100)

---

### PATCH 4: UNIFIED UI HEADERS

> [!CAUTION]
> **CONSTRAINT**: ALL cards use the SAME section header.

**Standard Headers (NO VARIATIONS):**
```
(i) Explanation
(target) GTO Approach
($) EV Analysis
(split) Alternate Plays
```

| ❌ BANNED | ✅ REQUIRED |
|-----------|------------|
| "2 Alternate Plays" | "Alternate Plays" |
| "2 Alternate Lines" | "Alternate Plays" |
| "Alternative Plays" | "Alternate Plays" |

---

## 🎯 OPERATION TRUTH SERUM — LOGIC PATCHES (v12.0)

### ACE RULE
IF Board contains Ace/King/Queen AND Hero's cards are lower → FORBIDDEN from "Overcards"

### CONNECTOR TAXONOMY
- Gap 0 = Connector (98s)
- Gap 1 = One-Gapper (T8s)
- Gap 2 = Two-Gapper (J8s)
- Gap 3+ = Three-Gapper or "Suited High Card"

### ACTION CONTEXT (OOP)
- Hero OOP facing bet → "CHECK-RAISE" (not generic "RAISE")
- Hero OOP leading → "LEAD" or "DONK BET"

### HAND STRENGTH
- Pocket pair below top card → "Pocket Pair (2nd Pair Value)" (NOT "Middle Pair")

### UI SIGNAL DISCIPLINE
- RAISE/BET/3-BET = GREEN
- CALL/TRAP = YELLOW
- SHOVE/FOLD = RED

---

## ⬛ PROTOCOL OBSIDIAN — SILENT EXECUTION (v11.0)

- Perform rank checks internally (NO debug output)
- Vertical Stack Layout ONLY
- "Set Mine" BANNED post-flop
- Logic Sanity: FOLD reason ≠ "Must Call"

---

## OUTPUT STRUCTURE (4 BLOCKS - LOCKED HEADERS)

### Block 1: Explanation
```
[Position] Holds [Hand]. [Stage] With [Stack]. On [Board], 
This Functions As [PRECISE Classification]. We [Action] To [Goal].
```

### Block 2: GTO Approach
```
Solver [Action]s [X]% With [Class] To [Reason].
```
*X% MUST match the Header Badge*

### Block 3: EV Analysis
```
+X.XXBB (Context)
```

### Block 4: Alternate Plays (LOCKED HEADER)
```
• [Action] [Y]% - [Reason]
• [Action] [Z]% - [Reason] OR TIP - [Coaching]
```
*Y% + Z% + Header% = 100%*
*NO DEV NOTES IN OUTPUT*

---

## IMAGE GENERATION PROMPT (v13.0)

```
Create futuristic metal poker GTO panel. Dark navy metallic frame, cyan glow.
VERTICAL STACK LAYOUT ONLY.

HEADER: Jarvis avatar left, "[ACTION]" badge center with "[X]%" badge.
- RAISE/3-BET = GREEN badge
- CALL = YELLOW badge
- FOLD = RED badge
- SHOVE = GREEN badge (but alternate plays list SHOVE in red text)

4 CONTENT SECTIONS with LOCKED HEADERS:
1. "Explanation" - Use PRECISE classifications
   - K9s = "Suited King-High" or "Suited Three-Gapper" (NOT Two-Gapper)
   - KQs on A-J-4 = "Gutshot" (NOT "Overcards")
   
2. "GTO Approach" - Solver [Action]s [X]% (MUST MATCH HEADER BADGE)

3. "EV Analysis" - Standard format

4. "Alternate Plays" (USE EXACTLY THIS HEADER - NOT "2 Alternate Lines")
   • [Action A] [Y]% - [Clean reason, NO dev notes]
   • [Action B] [Z]% - [Clean reason] OR TIP - [Coaching]

BANNED:
- "(RED color indicator)" or any color instructions in text
- "2 Alternate Plays" or "2 Alternate Lines" headers
- Mismatched percentages (badge vs text)
- K9s labeled as "Two-Gapper" (it's THREE-Gapper)
- Internal formatting notes in output
```

---

## BACKGROUND REMOVAL

```bash
magick input.png -fuzz 20% -transparent "#0a1628" -transparent "#091424" -transparent "#0b1a2e" -transparent "#101828" output.png
```

---

*GTO-A Protocol v13.0 — OPERATION CLEAN SWEEP*
*Installed: February 4, 2026*
*Status: PRODUCTION POLISH | Counter: 01/10*

**DEV NOTES**: Purged from output
**GAP MATH**: K9s = Three-Gapper (Q,J,T missing)
**MATH SYNC**: Badge% = Text%
**HEADERS**: "Alternate Plays" (unified)

**ACKNOWLEDGED. EXECUTING.**
