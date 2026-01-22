# Smarter.Poker Style Guide

## Visual Design

### Glassmorphism UI
All major UI containers use glass-morphic design with blur effects.

```css
.glass-container {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
}
```

### Color Palette
- **Cyan:** `#00d4ff` - Primary actions, highlights
- **Purple:** `#a855f7` - Secondary actions, VIP features
- **Gold:** `#fbbf24` - Premium features, achievements
- **Red:** `#ef4444` - Errors, warnings
- **Green:** `#10b981` - Success, confirmations

### Animation Standards
```javascript
// Framer Motion defaults
const springConfig = {
  type: "spring",
  stiffness: 300,
  damping: 30
};
```

---

## Code Architecture

### Self-Contained Components
Components must be self-contained. No external scripts for core functionality.

```javascript
// CORRECT: Self-contained React component
function PokerGame() {
  const [gameState, setGameState] = useState(initialState);
  const handleAction = (action) => {
    setGameState(calculateNewState(gameState, action));
  };
  return <div>{/* Render based on gameState */}</div>;
}
```

### Asset Fallbacks
Never ship broken UI. Always provide CSS/SVG fallbacks for missing assets.

### Supabase Client
Use the singleton client from `@/lib/supabaseClient` - never create new instances.

---

## Security

### RLS Required
All Supabase tables must have Row Level Security policies.

### Server-Side Secrets
API keys and service role keys stay server-side only (in API routes, not client components).

---

## Responsive Patterns

- **Pattern A (Content Zoom):** For content-heavy pages
- **Pattern B (Spatial Viewport):** For immersive experiences (World Hub)
- **Pattern C (Fixed Aspect):** For game boards and video players
