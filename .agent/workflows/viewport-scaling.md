---
description: Viewport-based scaling template for building responsive pages
---
# Viewport Scaling Template

## Core Principle
**5 cards always visible at any screen size.** The entire layout scales proportionally like a photograph.

## Design Size
When building any page in hub-vanguard, design for the **same viewport** the training page uses. The CSS will automatically scale it to all devices.

## CSS Variables (Defined Globally in `src/index.css`)

### Card & Layout Sizing
```css
--vp-card-size: 17vw;      /* Card width/height - 5 fit in 100vw */
--vp-card-gap: 1.5vw;      /* Gap between cards */
--vp-lane-padding: 2vw;    /* Padding on lane sides */
--vp-section-gap: 3vw;     /* Gap between sections */
```

### Typography Scaling
```css
--vp-font-xs: clamp(6px, 1.2vw, 11px);   /* Labels, captions */
--vp-font-sm: clamp(8px, 1.4vw, 13px);   /* Small text, pills */
--vp-font-md: clamp(10px, 1.6vw, 15px);  /* Body text */
--vp-font-lg: clamp(12px, 2vw, 18px);    /* Headings */
--vp-font-xl: clamp(16px, 3vw, 28px);    /* Large numbers */
--vp-font-xxl: clamp(18px, 4vw, 36px);   /* Hero titles */
--vp-font-hero: clamp(24px, 5vw, 48px);  /* Main hero text */
```

### Spacing Scaling
```css
--vp-space-xs: 0.5vw;
--vp-space-sm: 1vw;
--vp-space-md: 2vw;
--vp-space-lg: 3vw;
--vp-space-xl: 4vw;
```

### Border Radius Scaling
```css
--vp-radius-sm: 0.5vw;
--vp-radius-md: 0.8vw;
--vp-radius-lg: 1.2vw;
--vp-radius-xl: 2vw;
```

## Global CSS Classes (Auto-Apply Scaling)

Add these classes to your elements for automatic viewport scaling:

| Class | Purpose |
|-------|---------|
| `.vp-lane-cards` | Horizontal card container with proper gaps |
| `.vp-card` | Individual card wrapper (17vw × 17vw) |
| `.vp-card-image` | Card image container |
| `.vp-card-title` | Card title text |
| `.vp-lane-title` | Lane/section heading |
| `.vp-hero-title` | Hero section title |
| `.vp-hero-subtitle` | Hero section subtitle |
| `.vp-pill` | Filter pills/buttons |
| `.vp-stat-value` | Large stat numbers |
| `.vp-stat-label` | Small stat labels |

## Usage Examples

### Card Lane
```jsx
<div className="vp-lane-cards">
  {games.map(game => (
    <div className="vp-card">
      <div className="vp-card-image">
        <img src={game.image} />
      </div>
      <h3 className="vp-card-title">{game.name}</h3>
    </div>
  ))}
</div>
```

### Inline Style with Variables
```jsx
<div style={{
  width: 'var(--vp-card-size)',
  padding: 'var(--vp-space-md)',
  fontSize: 'var(--vp-font-lg)',
  borderRadius: 'var(--vp-radius-md)'
}}>
  Content
</div>
```

## Key Rules

1. **NEVER use fixed pixel values** for widths, heights, or font sizes
2. **ALWAYS use vw units or CSS variables** from the template
3. **5 cards per row** is the standard layout
4. **Test on both mobile (393px) and desktop (1200px)** to verify scaling
5. **clamp() ensures readability** - fonts won't get too small or too large
