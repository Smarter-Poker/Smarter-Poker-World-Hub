# System Patterns - Training Hub Vanguard

**Version:** 2.0 (Anti Gravity Intelligence Patch)  
**Purpose:** Architectural patterns and design principles that MUST be followed

---

## UI/UX Patterns

### Visual Identity
- **Glassmorphism:** Translucent backgrounds with blur effects
- **Neon Accents:** Glowing borders and shadows (cyan, gold, orange)
- **Video Game Feel:** AAA-quality animations and interactions
- **Dark Mode First:** All interfaces designed for dark backgrounds

### Animation Standards
- **Framer Motion:** Primary animation library
- **Micro-interactions:** Hover, tap, and focus states on all interactive elements
- **Smooth Transitions:** 300-500ms duration, easeInOut curves
- **Scale Effects:** 1.05x on hover, 0.95x on tap

### Typography
- **Primary Font:** Inter (system fallback: -apple-system, sans-serif)
- **Monospace:** Orbitron (for scores, timers, stats)
- **Hierarchy:** Clear visual hierarchy with size and weight

---

## Code Patterns

### 1. Scorched Earth Protocol (STRICT)

**Rule:** All UI components must be 100% self-contained React components.

**Forbidden:**
- ❌ External HTML templates
- ❌ Iframe-based game logic
- ❌ Script tags for UI rendering
- ❌ Direct DOM manipulation

**Required:**
- ✅ React State drives all visuals
- ✅ Props for data flow
- ✅ Hooks for side effects
- ✅ CSS-in-JS or Tailwind for styling

**Example:**
```typescript
// ❌ BAD: External template
<iframe src="/templates/game.html" />

// ✅ GOOD: Self-contained React
<UniversalTrainingTable 
    question={question}
    onAnswer={handleAnswer}
/>
```

### 2. Visual Anchor Pattern

**Rule:** Critical UI elements must have FIXED positioning to prevent layout shifts.

**Training Table Anchors:**
```css
/* Hero (Player) */
position: absolute;
bottom: -10%;
left: 50%;
transform: translateX(-50%);

/* Villain (Opponent) */
position: absolute;
top: -10%;
left: 50%;
transform: translateX(-50%);

/* Board (Center) */
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
```

**Testing:** Always verify positioning after ANY changes to table components.

### 3. Asset Fallback Pattern

**Rule:** Never ship broken UI due to missing assets.

**Implementation:**
```typescript
// ❌ BAD: Direct image reference
<img src="/images/clinic-icon.png" />

// ✅ GOOD: CSS fallback
{icon ? (
    <img src={icon} onError={(e) => e.target.style.display = 'none'} />
) : (
    <div style={{ /* CSS-generated icon */ }}>
        {emoji}
    </div>
)}
```

**Mock Assets:**
- Audio: Silent WAV files (replace before production)
- Images: SVG placeholders with text labels
- Icons: Emoji fallbacks

### 4. State Management Pattern

**Rule:** Use the right tool for the right scope.

| Scope | Tool | Example |
|-------|------|---------|
| Component | `useState` | Card visibility, animations |
| Shared UI | `Zustand` | Filter state, modal visibility |
| Server Data | `Supabase` | User progress, XP logs |
| URL State | `useRouter` | Game ID, clinic ID |

### 5. Error Handling Pattern

**Rule:** Fail gracefully, log verbosely.

```typescript
try {
    const { data, error } = await supabase.from('table').insert(...)
    if (error) throw error;
    console.log('[SUCCESS] Operation completed');
} catch (err) {
    console.error('[ERROR] Operation failed:', err);
    // Show user-friendly message
    // Continue with degraded functionality
}
```

---

## Testing Patterns

### Visual Regression Testing
1. **Positioning Check:** Verify Hero/Villain/Board anchors
2. **Animation Check:** Confirm smooth card dealing
3. **Interaction Check:** Test all action buttons
4. **Responsive Check:** Test on mobile, tablet, desktop

### Functional Testing
1. **Leak Detection:** Make 3+ mistakes, verify intercept shows
2. **XP Logging:** Make correct move, check Supabase logs
3. **Database:** Verify RLS policies allow user access
4. **Navigation:** Test routing between hub → game → clinic

### Browser Testing
Use the browser_subagent to:
- Navigate to training hub
- Click game card
- Play through a hand
- Verify console has no errors
- Check database for new records

---

## Database Patterns

### Table Naming
- Lowercase with underscores: `user_leaks`, `xp_logs`
- Plural for collections: `training_clinics`

### RLS Policies
```sql
-- Users can only see their own data
CREATE POLICY "Users view own data"
    ON table_name FOR SELECT
    USING (auth.uid() = user_id);
```

### Timestamps
- Always include `created_at` and `updated_at`
- Use `TIMESTAMPTZ` for timezone awareness

---

## Project Isolation Pattern

**Rule:** Keep codebases separate to prevent cross-contamination.

| Project | Directory | Purpose |
|---------|-----------|---------|
| Training Hub | `hub-vanguard` | GTO training engine |
| Maps/Discovery | `smarter-poker-maps` | Venue finder |
| Social Engine | `hub-vanguard/social` | Community features |

**If user mentions "Maps" or "Poker Near Me":**
1. STOP current work
2. Verify you're in the correct window
3. Remind user to switch if needed

---

## Deployment Patterns

### Git Workflow
```bash
git add -A
git commit -m "Feature: Description"
git push origin main
```

### Commit Messages
- **Feature:** New functionality
- **Bug Fix:** Fixes a bug
- **Refactor:** Code improvement (no behavior change)
- **Docs:** Documentation only

### Environment Variables
- Store in `.env.local` (never commit)
- Access via `process.env.NEXT_PUBLIC_*`
- Validate on component mount

---

**Last Updated:** 2026-01-19  
**Enforcement:** STRICT - Violations require explicit override
