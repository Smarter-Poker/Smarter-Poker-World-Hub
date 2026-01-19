# System Patterns — Architectural Standards

**Purpose:** Define the core architectural patterns, visual standards, and coding conventions that govern the Smarter.Poker ecosystem.

---

## 🎨 Visual Design Patterns

### Glassmorphism UI
**Standard:** All major UI containers use glass-morphic design with blur effects.

```css
.glass-container {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
}
```

**Application:**
- Card containers
- Modal overlays
- Navigation bars
- Dropdown menus

### Neon Accents
**Color Palette:**
- **Cyan:** `#00d4ff` (Primary actions, highlights)
- **Purple:** `#a855f7` (Secondary actions, VIP features)
- **Gold:** `#fbbf24` (Premium features, achievements)
- **Red:** `#ef4444` (Errors, warnings)
- **Green:** `#10b981` (Success, confirmations)

**Usage:**
```css
.neon-glow {
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
  text-shadow: 0 0 10px rgba(0, 212, 255, 0.8);
}
```

### Video Game Feel
**Requirements:**
- Smooth animations (60fps target)
- Sound effects on interactions (optional, user-controlled)
- Haptic feedback on mobile (where supported)
- Loading states with personality (not just spinners)
- Micro-interactions on hover/click

**Animation Standards:**
```javascript
// Framer Motion defaults
const springConfig = {
  type: "spring",
  stiffness: 300,
  damping: 30
};

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 }
};
```

---

## 🏗️ Code Architecture Patterns

### Scorched Earth Protocol
**Rule:** Components must be self-contained and never rely on external scripts for core functionality.

**✅ Correct:**
```javascript
// Self-contained React component
function PokerGame() {
  const [gameState, setGameState] = useState(initialState);
  
  const handleAction = (action) => {
    setGameState(calculateNewState(gameState, action));
  };
  
  return <div>{/* Render based on gameState */}</div>;
}
```

**❌ Incorrect:**
```javascript
// External script dependency (FORBIDDEN)
function PokerGame() {
  useEffect(() => {
    loadExternalGameEngine(); // NO!
  }, []);
  
  return <div id="game-container"></div>;
}
```

### No 404s — Mock Assets First
**Rule:** Never ship broken UI due to missing assets. Always provide CSS/SVG fallbacks.

**✅ Correct:**
```javascript
function Avatar({ src, name }) {
  return (
    <div className="avatar">
      {src ? (
        <img src={src} alt={name} onError={(e) => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }} />
      ) : null}
      <div className="avatar-fallback" style={{ display: src ? 'none' : 'flex' }}>
        {name?.charAt(0) || '?'}
      </div>
    </div>
  );
}
```

### Batch Mapping (4x4 Grid)
**Rule:** Training games use 4x4 grid for range construction (not 13x13).

**Implementation:**
```javascript
const GRID_MAPPING = {
  'AA': [0, 0], 'AKs': [0, 1], 'AQs': [0, 2], 'AJs': [0, 3],
  'AKo': [1, 0], 'KK': [1, 1], 'KQs': [1, 2], 'KJs': [1, 3],
  // ... 16 total cells
};
```

**Rationale:** Simplified UI, faster gameplay, mobile-friendly.

---

## 🔐 Security Patterns

### RLS Enforcement
**Rule:** All Supabase tables MUST have Row Level Security policies.

**Standard Policies:**
```sql
-- Public read access
CREATE POLICY "public_read" ON table_name
  FOR SELECT USING (true);

-- Authenticated write access
CREATE POLICY "authenticated_write" ON table_name
  FOR INSERT TO authenticated
  USING (auth.uid() = user_id);

-- God mode override
CREATE POLICY "god_mode_all" ON table_name
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_god_mode = true
    )
  );
```

### No Sensitive Data in Client
**Rule:** API keys, service role keys, and secrets stay server-side only.

**✅ Correct:**
```javascript
// Server-side API route
export default async function handler(req, res) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Server-only
  );
  // ...
}
```

**❌ Incorrect:**
```javascript
// Client-side component (FORBIDDEN)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // EXPOSED!
);
```

---

## 📐 Responsive Design Patterns

### Pattern A: Content Zoom
**Use Case:** Content-heavy pages (articles, documentation)

```css
.content-zoom {
  zoom: var(--content-scale, 1);
}

@media (max-width: 768px) {
  .content-zoom {
    --content-scale: 0.85;
  }
}
```

### Pattern B: Spatial Viewport
**Use Case:** Immersive experiences (World Hub, game tables)

```css
.spatial-viewport {
  width: 100vw;
  height: 100vh;
  position: fixed;
  overflow: hidden;
}
```

### Pattern C: Fixed Aspect Ratio
**Use Case:** Game boards, video players

```css
.aspect-container {
  aspect-ratio: 16 / 9;
  max-width: 100%;
  margin: 0 auto;
}
```

---

## 🚀 Deployment Patterns

### Deployment Law
**Rule:** All development sessions MUST conclude with a deployment command.

**Standard Workflow:**
```bash
# Use the auto-publish workflow
/auto-publish
```

**Manual Alternative:**
```bash
git add .
git commit -m "feat: [description]"
git push origin main
# Vercel auto-deploys from main branch
```

### Production Parity
**Rule:** Localhost behavior must match production (no environment-specific hacks).

**✅ Correct:**
```javascript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://smarter.poker';
```

**❌ Incorrect:**
```javascript
const API_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:3000' 
  : 'https://smarter.poker'; // Creates divergence!
```

---

## 🧩 Component Patterns

### Singleton Pattern (Supabase Client)
**Rule:** Use centralized Supabase client to avoid SSO handshake failures.

**✅ Correct:**
```javascript
// Import from singleton
import { supabase } from '@/lib/supabaseClient';
```

**❌ Incorrect:**
```javascript
// Creating new instance (causes auth issues)
const supabase = createClient(url, key);
```

### State Management Hierarchy
**Preference Order:**
1. **React State** — For component-local state
2. **React Context** — For shared state across component tree
3. **Zustand** — For global state that needs persistence
4. **Supabase** — For server-synced state

**Anti-Pattern:** Don't use Zustand for everything. Keep state as local as possible.

---

## 📊 Data Patterns

### Batch Execution Protocol
**Use Case:** Inserting large datasets into Supabase when SQL Editor times out.

**Strategy:**
1. Split data into batches: 30 rows → 15 rows → 3 rows
2. Execute each batch with 5-10 second delays
3. Verify each batch via API before proceeding
4. Log successes/failures for debugging

**Implementation:**
```javascript
async function batchInsert(data, batchSize = 30) {
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await supabase.from('table').insert(batch);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
```

---

## 🎯 Testing Patterns

### Verification Checklist
Before marking any feature "complete":

- [ ] Works on mobile (iOS Safari, Android Chrome)
- [ ] Works on desktop (Chrome, Safari, Firefox)
- [ ] No console errors
- [ ] Loading states implemented
- [ ] Error states handled gracefully
- [ ] Accessibility: keyboard navigation works
- [ ] Performance: no jank, smooth 60fps
- [ ] Production deployed and verified

---

## 🧠 Agent Behavior Patterns

### Chain of Thought
**Rule:** Always explain reasoning before executing code changes.

**Template:**
```
I am analyzing [file/feature]...
I see a potential conflict with [rule/pattern]...
I will execute [strategy] because [reasoning]...
```

### Memory First
**Rule:** Before answering ANY prompt, read `.memory/active_context.md` and `.memory/project_mission.md`.

**Update Trigger:** If plans change, update memory files immediately.

### Project Isolation
**Rule:** Verify workspace context before making changes.

**Example:**
- If user mentions "Mapping" or "Venues" → Verify in `hub-vanguard` workspace
- If user mentions "Solver" or "Training" → Verify in correct orb context
- Never pollute one feature area with another's code
