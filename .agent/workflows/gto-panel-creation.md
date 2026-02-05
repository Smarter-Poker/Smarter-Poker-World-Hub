---
description: GTO Panel Creation - MANDATORY Manual Build Workflow
---

# GTO Panel Creation Law (MANDATORY)

> [!CAUTION]
> **YOU MUST READ THIS ENTIRE FILE BEFORE CREATING ANY GTO PANEL**
> Violation of this workflow is UNACCEPTABLE.

## 🚨 ABSOLUTE RULES

1. **NEVER run scripts** like `generate-gto-panels.js` - these are FORBIDDEN
2. **NEVER use batch automation** for panel creation
3. **ALWAYS use the `generate_image` tool** to create each panel MANUALLY
4. **ALWAYS reference the template** at `/public/images/gto-panel-template.png`
5. **ALWAYS show the user each panel** before proceeding to the next

## Template Reference

**Template Location**: `/public/images/gto-panel-template.png`

Before generating ANY panel, you MUST:
1. View the template using `view_file` to understand the exact style
2. Use the template as input to `generate_image` for style matching

## Panel Creation Steps

### Step 1: Load Template
```
view_file /public/images/gto-panel-template.png
```

### Step 2: Generate ONE Panel
Use `generate_image` with:
- **ImagePaths**: Include the template path for style reference
- **Prompt**: Describe the specific panel content (position, action, stack depth)
- **ImageName**: Use format `gto_{position}_{action}_{stack}bb`

### Step 3: Show User
Display the generated panel to the user and wait for approval before continuing.

### Step 4: Upload to Supabase
After user approval, upload to `gto-panels/panels/` bucket.

## Panel Filename Format

```
gto_{position}_{action}_{stackBb}bb.png
```

Examples:
- `gto_utg_raise_100bb.png`
- `gto_btn_raise_50bb.png`
- `gto_mp_raise_200bb.png`

## Panel Content Requirements

Each panel MUST include:
1. **Header**: Jarvis avatar, Action badge (colored), "Smarter Poker Data"
2. **Explanation**: Concise GTO reasoning
3. **GTO Approach**: Solver strategy overview
4. **EV Analysis**: Expected value with +/- indicator
5. **Alternate Plays**: EXPLOIT and SIMPLIFY coaching lines

## Action Color Palette

| Action | Color |
|--------|-------|
| RAISE | Green neon `#00FF00` |
| FOLD | Red `#FF0000` |
| CALL | Yellow/Orange `#FFD700` |
| 3-BET | Purple `#BF00FF` |
| CHECK | Gray `#808080` |
| BET | Cyan `#00D4FF` |

---

## 📝 Poker Capitalization Rule (LOCKED)

> [!IMPORTANT]
> ALL GTO panel text MUST follow these capitalization rules exactly.

### 1️⃣ Positions, Blinds, and Poker Abbreviations
Use **ALL CAPS** for standard poker abbreviations and position names.

| ✅ Correct | ❌ Incorrect |
|-----------|-------------|
| BTN | Btn, btn |
| SB | Sb, sb |
| BB | Bb, bb |
| UTG | Utg, utg |
| HJ | Hj, hj |
| CO | Co, co |
| MP | Mp, mp |
| IP / OOP | Ip, Oop |
| 3BB, 2.5BB, 100BB | 3bb, 2.5Bb |

### 2️⃣ Hyphenated Poker Terms (Big-Blind–style)
When a poker term is written in full and hyphenated:
- Capitalize BOTH words
- ALWAYS hyphenate
- NO lowercase

| ✅ Correct | ❌ Incorrect |
|-----------|-------------|
| Big-Blind | Big blind, big-blind |
| Small-Blind | Small blind, small-blind |
| Button-Straddle | Button straddle |
| Under-the-Gun | under the gun |

### 3️⃣ Numeric + Blind Usage
When a number modifies a blind unit:
- Number + ALL CAPS blind abbreviation
- NO hyphen

| ✅ Correct | ❌ Incorrect |
|-----------|-------------|
| 3BB | 3bb, 3-BB |
| 2.5BB | 2.5bb |
| 50BB stack | 50bb stack |
| Open to 2.25BB | Open to 2.25bb |

### 4️⃣ Full Blind Names in Sentences
Capitalize both words when used as a defined poker term.

**✅ Preferred:**
- "Defending the Big-Blind vs BTN open"
- "BB faces pressure from BTN"

**❌ Avoid mixing styles in the same sentence.**

---
*Law Established: February 3, 2026*
*Status: MANDATORY - No Exceptions*
