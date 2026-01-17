---
description: Viewport-based scaling template for building responsive pages
---

# Viewport Scaling Standard — Smarter.Poker

**PURPOSE**: Ensure every page looks identical across all devices (mobile to 4K) by using viewport-relative CSS units and standardized design canvases.

## 🎯 Core Principle

**All UI elements must scale with the viewport** using `clamp()`, `vh`, and `vw` units. Never use fixed pixel values except as min/max bounds in `clamp()`.

---

## 📐 Design Canvas Models

Choose ONE model per page type:

### Model A: Viewport-Based Scaling (Flexible Layouts)
**Use for**: Hubs, libraries, grids, lists, dashboards

**Pattern**:
```css
/* Cards/Elements scale with viewport */
width: clamp(140px, 17vw, 186px);
font-size: clamp(12px, 1.7vh, 18px);
padding: clamp(10px, 1.5vh, 16px);
```

**Examples**: World Hub, Training Library, Social Feed

---

### Model B: Fixed Aspect Ratio Canvas (Game Tables, Cinematics)
**Use for**: Poker tables, full-screen experiences, games

**Pattern**:
```tsx
// Container with fixed aspect ratio that scales to fit viewport
<div style={{
    position: 'relative',
    width: '100vw',
    height: `${(100 * DESIGN_HEIGHT) / DESIGN_WIDTH}vw`,
    maxHeight: '100vh',
    maxWidth: `${(100 * DESIGN_WIDTH) / DESIGN_HEIGHT}vh`,
    margin: 'auto',
}}>
    {/* All internal elements use percentages relative to canvas */}
</div>
```

**Common Canvases**:
- **Cinematic (16:9)**: 1920×1080
- **Portrait Game (3:4)**: 600×800
- **Square**: 1000×1000

**Examples**: Training game tables, Cinematic intro, Avatar selection

---

## 🔧 Scaling Utilities

Use these standardized helper functions:

### TypeScript/React Hook
```typescript
// src/utils/viewport.ts
export const useViewportScale = (designWidth = 1920, designHeight = 1080) => {
    // Convert design canvas pixels to viewport percentages
    const toVw = (px: number) => `${(px / designWidth) * 100}vw`;
    const toVh = (px: number) => `${(px / designHeight) * 100}vh`;
    
    // Responsive clamp with min/max bounds
    const clampVw = (min: number, ideal: number, max: number) => 
        `clamp(${min}px, ${(ideal / designWidth) * 100}vw, ${max}px)`;
    
    const clampVh = (min: number, ideal: number, max: number) => 
        `clamp(${min}px, ${(ideal / designHeight) * 100}vh, ${max}px)`;
    
    return { toVw, toVh, clampVw, clampVh };
};
```

### CSS Variables (Global)
```css
/* styles/globals.css */
:root {
    /* Design canvas dimensions */
    --canvas-width: 1920;
    --canvas-height: 1080;
    
    /* Viewport scaling functions */
    --scale-vw: calc(100vw / var(--canvas-width));
    --scale-vh: calc(100vh / var(--canvas-height));
}

/* Helper classes */
.viewport-text-sm { font-size: clamp(12px, 1.7vh, 18px); }
.viewport-text-md { font-size: clamp(32px, 5.9vh, 64px); }
.viewport-text-lg { font-size: clamp(80px, 13vh, 140px); }

.viewport-padding-sm { padding: clamp(10px, 1.5vh, 16px); }
.viewport-padding-md { padding: clamp(14px, 2.5vh, 24px); }
.viewport-padding-lg { padding: clamp(32px, 5vh, 48px); }
```

---

## 📋 Implementation Checklist

When building/updating a page:

### 1. Choose Design Canvas Model
- [ ] Viewport-Based (flexible grids) OR Fixed Aspect Ratio (games/cinematics)

### 2. Replace All Fixed Pixels
- [ ] Font sizes → `clamp()`
- [ ] Padding/margins → `clamp()` with vh/vw
- [ ] Element sizes → `clamp()` or percentages
- [ ] Gaps/spacing → viewport-relative

### 3. Test Breakpoints
- [ ] Mobile (375×667)
- [ ] Tablet (768×1024)
- [ ] Desktop (1920×1080)
- [ ] 4K (3840×2160)

### 4. Verify Visual Parity
- [ ] Text remains readable (12px minimum)
- [ ] Layout doesn't break
- [ ] No overflow/clipping
- [ ] Hover states work

---

## 🎨 Common Patterns

### Header Bars
```typescript
style={{
    padding: isMobile 
        ? 'clamp(10px, 1.5vh, 12px) clamp(12px, 2vh, 16px)' 
        : 'clamp(14px, 1.5vh, 16px) clamp(32px, 3.7vh, 40px)',
}}
```

### Logo
```typescript
height: isMobile ? 'clamp(32px, 6vh, 40px)' : 'clamp(48px, 5.6vh, 60px)'
```

### Card Grids
```typescript
width: clamp(140px, 17vw, 186px)  // Desktop
width: clamp(100px, 18vw, 115px)  // Mobile
```

### Icon Orbs
```typescript
size: isMobile ? 36 : Math.min(56, Math.max(48, window.innerHeight * 0.052))
```

### Text Hierarchy
```css
/* Hero Title */
font-size: clamp(80px, 13vh, 140px);

/* Page Title */
font-size: clamp(32px, 5.9vh, 64px);

/* Subtitle */
font-size: clamp(12px, 1.7vh, 18px);

/* Body Text */
font-size: clamp(14px, 2vh, 16px);

/* Small Label */
font-size: clamp(9px, 1.2vh, 10px);
```

---

## 🚨 Hard Rules

1. **NO fixed pixels** except in `clamp()` min/max bounds
2. **Always test mobile first** (375px width)
3. **Maintain aspect ratios** for images/cards using `aspect-ratio` CSS
4. **Use relative units**: vw, vh, %, rem (never px standalone)
5. **Every new page** must follow this standard

---

## 📚 Reference Examples

- **Cinematic Intro**: `/src/world/components/CinematicIntro.tsx`
- **World Hub**: `/src/world/WorldHub.tsx`
- **Training Game Table**: Uses 600×800 canvas with percentage-based positioning

---

## 🔄 Migration Guide

To update an existing page:

1. Identify all fixed pixel values
2. Categorize: text, spacing, sizes
3. Replace with appropriate `clamp()` formulas
4. Test at 375px, 1920px, 3840px
5. Commit with: `"🎨 Apply viewport scaling to [Page Name]"`
6. Deploy immediately

---

**Last Updated**: 2026-01-17 (Step 566)
**Status**: ✅ PRODUCTION STANDARD
