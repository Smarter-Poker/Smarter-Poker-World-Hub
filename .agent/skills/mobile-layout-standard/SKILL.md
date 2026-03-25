---
name: Mobile Layout Standard
description: Platform-wide mobile-first responsive layout standard derived from Social Media page. MANDATORY for all hub pages.
---

# Mobile Layout Standard — Smarter.Poker

**Authority:** Derived from `pages/hub/social-media.js` — the gold-standard mobile layout.
**Scope:** ALL hub pages must follow these patterns for consistent mobile UX.

---

## Core Architecture

### Page Container
Every hub page must use a full-bleed container that prevents horizontal overflow:

```jsx
<div style={{
    minHeight: '100vh',
    background: '#0a0e1a',  // or page-specific dark bg
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
    paddingBottom: 70,  // CRITICAL: clears the fixed bottom nav
    width: '100%',
    maxWidth: '100vw',
    overflowX: 'hidden',
    boxSizing: 'border-box'
}}>
```

> **RULE:** `paddingBottom: 70` is mandatory on the outermost content div to clear the fixed 56px bottom nav bar.

### Content Column
Feed/content areas use a max-width column centered on desktop, expanding to full width on mobile:

```jsx
<main className="page-container" style={{
    padding: 0,
    width: '100%',
    maxWidth: '100%',
    overflowX: 'hidden',
    boxSizing: 'border-box'
}}>
    <div className="feed-layout" style={{
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
        width: '100%',
        boxSizing: 'border-box'
    }}>
        <div className="feed-column" style={{ flex: 1, minWidth: 0 }}>
            {/* Main content here */}
        </div>
    </div>
</main>
```

### Desktop Max-Width
The content column is capped at **680px** on desktop (readable width):

```css
.feed-column {
    max-width: 680px;
    overflow-x: hidden;
}
```

---

## Breakpoints

| Breakpoint | What Happens |
|---|---|
| `≤ 900px` | Side panels (contacts, sidebars) are hidden |
| `≤ 768px` | Content goes edge-to-edge (padding/gap zeroed), mobile nav appears |

### Mandatory @media Rules

```css
@media (max-width: 768px) {
    .feed-column {
        max-width: 100% !important;
        width: 100% !important;
    }
    .feed-layout {
        gap: 0 !important;
        width: 100% !important;
        padding: 0 !important;
    }
    .page-container {
        padding: 0 !important;
        width: 100% !important;
        max-width: 100vw !important;
        overflow-x: hidden !important;
    }
}
@media (max-width: 900px) {
    .sidebar, .contacts-sidebar { display: none; }
}
```

> **RULE:** These `@media` rules must NEVER be removed. They are the sole mobile layout mechanism.

---

## Fixed Bottom Navigation Bar

All hub pages must account for the 56px fixed bottom nav. The pattern:

```jsx
<nav style={{
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    background: '#ffffff',
    borderTop: '1px solid #dddfe2',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'stretch',
    zIndex: 100,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)'  // iPhone notch safe area
}}>
```

### Nav Item Pattern
Each item is a flex column with SVG icon + label:

```jsx
<Link href="/hub/{page}" style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    color: '#65676b',  // inactive
    flex: 1,
    padding: '6px 4px',
    minWidth: 50
}}>
    <svg width="28" height="28" ...>{/* icon */}</svg>
    <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>{label}</span>
</Link>
```

### Auto-Hide on Scroll
The bottom nav hides when scrolling down and reappears on scroll up using `transform: translateY()`:

```jsx
transform: bottomNavVisible ? 'translateY(0)' : 'translateY(100%)',
transition: 'transform 0.3s ease',
```

---

## Sidebar → Mobile Navigation Pattern

When a page has a desktop sidebar (like Bankroll Manager), it must:

1. **Hide the sidebar** on mobile via CSS: `.sidebar { display: none !important; }`
2. **Show a horizontal pill nav** instead via CSS: `.mobile-nav { display: flex !important; }`
3. The pill nav uses scrollable horizontal pills:

```jsx
<div className="mobile-nav">
    {SECTIONS.map(section => (
        <button
            key={section.id}
            className={`mobile-nav-item${active === section.id ? ' active' : ''}`}
            onClick={() => handleNav(section.id)}
        >
            {section.label}
        </button>
    ))}
</div>
```

```css
.mobile-nav {
    display: none;  /* hidden by default (desktop) */
}
@media (max-width: 768px) {
    .sidebar { display: none !important; }
    .mobile-nav {
        display: flex !important;
        overflow-x: auto;
        gap: 6px;
        padding: 0 0 12px 0;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
    }
    .mobile-nav::-webkit-scrollbar { display: none; }
    .mobile-nav-item {
        flex-shrink: 0;
        padding: 7px 14px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04);
        color: rgba(255,255,255,0.6);
        font-size: 12px;
        white-space: nowrap;
    }
    .mobile-nav-item.active {
        background: rgba(35,116,225,0.2);
        border-color: #2374e1;
        color: #2374e1;
    }
}
```

---

## Typography & Spacing (Mobile)

| Element | Desktop | Mobile (≤768px) |
|---|---|---|
| Page title | 22-24px | 18px |
| Body text | 14-15px | 13-14px |
| Button text | 14px | 13px |
| Button padding | 10px 20px | 8px 16px |
| Content padding | 16-24px | 12px |
| Card gap | 12-16px | 8px |
| Filter grid | 4 columns | 2 columns |

---

## Touch Optimization

1. **Minimum touch target:** 44×44px for all interactive elements
2. **`touch-action: manipulation`** on buttons/filters to prevent double-tap zoom
3. **`-webkit-overflow-scrolling: touch`** on all horizontal scroll containers
4. **`scrollbar-width: none`** to hide scrollbars on mobile scroll areas
5. **Haptic feedback** via `navigator.vibrate(15)` (wrapped in try/catch)

---

## Anti-Patterns (DO NOT)

1. **DO NOT** use fixed pixel widths on content areas — always use `width: 100%` with `max-width`
2. **DO NOT** add horizontal padding on the mobile container — edge-to-edge is the standard
3. **DO NOT** use `position: fixed` on content elements that overlap the bottom nav (56px clearance required)
4. **DO NOT** hide `@media` rules inside `<style>` tags in `<Head>` or `<SEOHead>` — they get stripped during migrations. Put them in dedicated `.css` files or `<style jsx global>` blocks
5. **DO NOT** use `overflow: hidden` on the page body — it breaks scroll. Use `overflowX: hidden` only
6. **DO NOT** remove `paddingBottom: 70` from the outermost container — content will be hidden behind the bottom nav

---

## Verification Checklist

When building or modifying any hub page, verify:

- [ ] `paddingBottom: 70` on outermost content div
- [ ] `maxWidth: 100vw` + `overflowX: hidden` on page container
- [ ] Content column has `max-width` (680px or appropriate) with `100%` mobile override
- [ ] Sidebar hidden at `≤ 768px` with mobile nav alternative
- [ ] All `@media` rules preserved — never removed
- [ ] Touch targets ≥ 44px
- [ ] No horizontal scroll on mobile
- [ ] Bottom nav clearance maintained
