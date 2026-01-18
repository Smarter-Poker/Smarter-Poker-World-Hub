# 🔒 OFFICIAL POKER TABLE UI TEMPLATE
## LOCKED: 2026-01-18 | DO NOT MODIFY

This is the **AUTHORITATIVE** baseline for **ALL** poker tables in Smarter.Poker:
- Training Games (ICM, GTO, Position, etc.)
- Diamond Arena
- Club Arena

---

## 📍 SEAT POSITIONS (9-Max)

| Seat | ID | Position | Left | Top |
|------|-----|----------|------|-----|
| 1 | hero | Center Bottom | **50%** | **88%** |
| 2 | v1 | Bottom-Left | **18%** | **75%** |
| 3 | v2 | Middle-Left | **15%** | **50%** |
| 4 | v3 | Upper-Left | **15%** | **26%** |
| 5 | v4 | Top-Left | **32%** | **5%** |
| 6 | v5 | Top-Right | **68%** | **5%** |
| 7 | v6 | Upper-Right | **85%** | **26%** |
| 8 | v7 | Middle-Right | **85%** | **50%** |
| 9 | v8 | Bottom-Right | **82%** | **75%** |

### Game Format Configurations

| Format | Players | Active Seats |
|--------|---------|--------------|
| **Heads Up** | Hero + 1 | hero, v4 (top center) |
| **3-Max** | Hero + 2 | hero, v4, v5 |
| **4-Max** | Hero + 3 | hero, v2, v4, v7 |
| **6-Max** | Hero + 5 | hero, v2, v3, v6, v7, v4 |
| **9-Max** | Hero + 8 | ALL seats active |

**Rule**: Only show seats that are active for the game format. Hide unused villain seats.

---

## 🎨 PLAYER INFO BOXES

| Property | Value |
|----------|-------|
| Width | `auto` (min-width: 70px) |
| Background | `rgba(0, 0, 0, 0.85)` |
| Border | `2px solid rgba(255, 215, 0, 0.8)` |
| Border Radius | `8px` |
| Padding | `4px 10px` |
| Margin Top | `-10px` |
| Name Font | `15px`, weight 600, white |
| Stack Font | `17px`, weight 700, gold (#FFD700) |
| White Space | `nowrap` (NEVER wraps) |

---

## ⏱️ TIMER (Shot Clock)

| Property | Value |
|----------|-------|
| Position | `absolute` |
| Left | **70px** |
| Bottom | **45px** |
| Size | `86px × 86px` |
| Background | `linear-gradient(145deg, #1a1a2e 0%, #0d0d1a 100%)` |
| Border | `4px solid #ff4444` |
| Font Size | `34px` |
| Color | `#ff4444` |

---

## 📊 QUESTION COUNTER

| Property | Value |
|----------|-------|
| Position | `absolute` |
| Right | **50px** |
| Bottom | **45px** |
| Padding | `12px 16px` |
| Border Radius | `6px` |
| Background | `rgba(0, 100, 200, 0.3)` |
| Border | `2px solid rgba(0, 150, 255, 0.5)` |
| Font Size | `14px` |

---

## 💬 QUESTION PILL BOX

| Property | Value |
|----------|-------|
| Margin | `5px 15px` |
| Width | `auto` (full stretch) |
| Padding | `8px 18px` |
| Background | `rgba(0, 0, 0, 0.75)` |
| Border | `3px solid rgba(0, 212, 255, 0.6)` |
| Border Radius | `25px` |
| Box Shadow | `0 0 25px rgba(0, 212, 255, 0.3)` |
| Text Transform | **`capitalize`** (Title Case) |
| Font Size | `22px` |
| Font Weight | `600` |
| Line Height | `1.6` |

---

## 🎯 STAGE / TABLE AREA

| Property | Value |
|----------|-------|
| Padding | `95px 10px 35px 10px` |
| Overflow | `visible` |

---

## 📱 HEADER

| Element | Position |
|---------|----------|
| Back Button | Left |
| Game Title | Center (cyan glow) |
| XP Wallet | Right cluster |
| Diamond Wallet | Right cluster |
| Profile Pic | Right cluster (36×36px) |

---

## ⚠️ MANDATORY RULES

1. **Title Case**: All question text MUST use `text-transform: capitalize`
2. **No Line Wrap**: Player names MUST use `white-space: nowrap`
3. **Auto-Width**: Player info boxes expand to fit name length
4. **Overflow Visible**: Stage, table-area, and player classes MUST have `overflow: visible`
5. **Fixed Positions**: All seat positions are LOCKED - do not adjust

---

## Source File
`training_game_template.html`
