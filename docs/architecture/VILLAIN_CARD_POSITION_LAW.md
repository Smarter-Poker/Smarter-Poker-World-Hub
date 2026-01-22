# VILLAIN CARD POSITION LAW
## Immutable Standard - Locked 2026-01-18

> [!CAUTION]
> **THESE POSITIONS ARE PERMANENT AND IMMUTABLE**
> 
> These villain card positions were manually locked by the user and represent the SINGLE SOURCE OF TRUTH for all opponent card positioning in the training game system. **THESE POSITIONS CAN NEVER BE CHANGED.**

## The Law

**ANY card dealt to ANY villain in ANY game MUST use EXACTLY these positions. No exceptions.**

## Locked Positions

All positions are in pixels, measured from the viewport. These coordinates are FINAL and PERMANENT.

### Villain 1 (Bottom-Right)
```css
left: 760px;
top: 926px;
```

### Villain 2 (Middle-Right)
```css
left: 779px;
top: 694px;
```

### Villain 3 (Upper-Right)
```css
left: 778px;
top: 478px;
```

### Villain 4 (Top-Right)
```css
left: 663px;
top: 282px;
```

### Villain 5 (Top-Left)
```css
left: 289px;
top: 281px;
```

### Villain 6 (Upper-Left)
```css
left: 170px;
top: 474px;
```

### Villain 7 (Middle-Left)
```css
left: 172px;
top: 696px;
```

### Villain 8 (Bottom-Left)
```css
left: 193px;
top: 922px;
```

### Hero (Bottom-Center) - LOCKED POSITION
```css
left: 574px;
top: 983px;
```
**Hero cards are in a LOCKED POSITION and must remain exactly here.**

## Card Specifications

- **Size**: 34px × 47px (60% of hero card size)
- **Rotation**: First card -8deg, second card +8deg
- **Overlap**: Second card margin-left: -18px
- **Card Back**: Black/gold ornate pattern

## Implementation Reference

These positions are locked into the golden template at:
`/Users/smarter.poker/Documents/hub-vanguard/templates/training_game_template.html`

## Enforcement

**This is a HARD LAW.** Any code that positions villain cards MUST use these exact coordinates. No dynamic positioning, no calculations, no adjustments. These positions are PERMANENT.
