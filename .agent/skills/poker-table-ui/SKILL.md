---
name: Poker Table UI
description: Build pixel-perfect poker table interfaces following the Golden Template standard
---

# Poker Table UI Skill

## Overview
Build poker table interfaces that match the Golden Template visual standard for the Smarter.Poker ecosystem.

## Design Standards

### Canvas Size
- **Design canvas**: 600x800 (3:4 portrait)
- **Racetrack geometry**: 305x460 inner table
- **Scaling**: Fixed-aspect responsive scaling

### Color Palette
```css
/* Table felt */
--felt-green: linear-gradient(135deg, #1a4d33 0%, #0d3621 100%);

/* Rail/border */
--rail-gold: linear-gradient(90deg, #8B6914 0%, #C9A227 50%, #8B6914 100%);

/* Neon accents */
--neon-cyan: #00f5ff;
--neon-gold: #ffd700;
--neon-pink: #ff69b4;

/* Card backs */
--card-back: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
```

### Avatar Positions (9-max fanned layout)
```javascript
const SEAT_POSITIONS = {
  0: { x: 152, y: 400 },  // Hero (bottom center)
  1: { x: 50, y: 330 },   // Left bottom
  2: { x: 20, y: 200 },   // Left middle
  3: { x: 50, y: 90 },    // Left top
  4: { x: 120, y: 30 },   // Top left
  5: { x: 185, y: 20 },   // Top center
  6: { x: 250, y: 30 },   // Top right
  7: { x: 290, y: 90 },   // Right top
  8: { x: 280, y: 200 },  // Right middle
};
```

## Component Structure

### Required Components
1. **Table felt** - Gradient background with racetrack shape
2. **Rail** - Gold gradient border with shadow
3. **Seats** - Avatar + name + stack display
4. **Community cards** - 5-card board area
5. **Pot display** - Center pot amount
6. **Action buttons** - Fold/Check/Call/Raise
7. **Dealer button** - Position indicator

### Avatar Display
```jsx
<div className="seat">
  <img src={player.avatar_url} className="avatar" />
  <span className="player-name">{player.name}</span>
  <span className="stack">${player.stack}</span>
</div>
```

## Animation Standards

### Card Dealing
- Duration: 300ms per card
- Easing: cubic-bezier(0.25, 0.8, 0.25, 1)
- Stagger: 100ms between cards

### Chip Movement
- Duration: 400ms
- Easing: ease-out
- Use CSS transforms for performance

### Action Timer
- Full ring: 30-45 seconds
- Visual countdown with color change (green → yellow → red)

## Files to Reference
- `/src/components/PokerTable.jsx`
- `/public/images/training/` - Asset directory
- `/src/games/` - Game logic

## Best Practices
1. Always use the 3:4 portrait canvas
2. Test on mobile (375px width minimum)
3. Use inline styles for mission-critical positioning
4. Preload avatar images for smooth rendering
