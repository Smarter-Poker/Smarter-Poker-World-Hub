# ACTIVE HAND GLOW LAW
## Immutable Standard - Locked 2026-01-18

> [!CAUTION]
> **THIS IS PERMANENT AND IMMUTABLE LAW**
> 
> All 9 card positions (8 villains + hero) MUST have a glowing halo effect when they have an active hand. Cards MUST turn grey when folded. **THIS LAW CAN NEVER BE CHANGED.**

## The Law

**ANY player with an active hand MUST display:**
1. **Glowing halo effect** around their cards
2. **Two visible cards** at their locked position
3. **Grey cards** when folded (both hero and villains)

## Visual Specifications

### Active Hand Glow
```css
/* Golden glow effect for active hands */
box-shadow: 
    0 0 20px rgba(255, 215, 0, 0.6),
    0 0 40px rgba(255, 215, 0, 0.4),
    0 0 60px rgba(255, 215, 0, 0.2);
animation: pulse-glow 2s ease-in-out infinite;
```

### Fold State
```css
/* Grey filter when folded */
filter: grayscale(100%) brightness(0.5);
opacity: 0.6;
```

## Implementation Rules

### For All 9 Positions

1. **Active State**: 
   - Cards visible at locked positions
   - Golden glowing halo effect
   - Full color and opacity

2. **Folded State**:
   - Cards turn grey (grayscale filter)
   - Reduced brightness and opacity
   - Glow effect removed

3. **No Hand State**:
   - Cards hidden
   - No glow effect

## CSS Classes Required

### Active Hand
- `.has-cards` - Applied when player has active hand
- Triggers glow effect
- Ensures cards are visible

### Folded Hand
- `.folded` - Applied when player folds
- Applies grey filter to cards
- Reduces opacity

## Enforcement

**This is a HARD LAW.** Every poker table in the Smarter.Poker ecosystem MUST implement this visual feedback system. No exceptions.

### Applies To
- Training games
- Club Arena games  
- Diamond Arena games
- All poker tables across the entire platform

## Animation Specification

```css
@keyframes pulse-glow {
    0%, 100% {
        box-shadow: 
            0 0 20px rgba(255, 215, 0, 0.6),
            0 0 40px rgba(255, 215, 0, 0.4),
            0 0 60px rgba(255, 215, 0, 0.2);
    }
    50% {
        box-shadow: 
            0 0 30px rgba(255, 215, 0, 0.8),
            0 0 60px rgba(255, 215, 0, 0.6),
            0 0 90px rgba(255, 215, 0, 0.3);
    }
}
```

## Implementation Reference

This law is locked into the golden template at:
`/Users/smarter.poker/Documents/hub-vanguard/templates/training_game_template.html`
