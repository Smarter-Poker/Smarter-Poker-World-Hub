---
description: Metal frame styling requirement for Video Library video cards
---

# Metal Frame Requirement for Video Library

All video cards, buttons, and UI elements in the Video Library must use the **metal frame styling** - a futuristic chrome border effect.

## Metal Frame Asset Location
- **Image**: `/public/images/metal-frame.png`
- **CSS Classes**: Defined in `pages/hub/video-library.js` (in the `<style>` block within `<Head>`)

## CSS Classes to Use

### `.metal-frame` (for large elements like video cards)
```css
.metal-frame {
    position: relative;
    background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
    border-radius: 16px;
    overflow: hidden;
}
/* Uses ::before for chrome gradient border */
/* Uses ::after for top highlight effect */
```

### `.metal-frame-sm` (for smaller elements like buttons)
```css
.metal-frame-sm {
    position: relative;
    background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
    border-radius: 10px;
    overflow: hidden;
}
/* Uses ::before for chrome gradient border */
```

### `.video-card-metal` (hover effects for video cards)
```css
.video-card-metal {
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.video-card-metal:hover {
    transform: translateY(-6px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 30px rgba(100, 140, 180, 0.15);
}
```

## Implementation Steps for New Videos

1. When adding new video cards to the Video Library grid, use:
   ```jsx
   <div className="metal-frame video-card-metal" style={{ cursor: 'pointer' }}>
       {/* Video thumbnail and content */}
   </div>
   ```

2. For Continue Watching cards:
   ```jsx
   <div className="metal-frame video-card-metal" style={{ minWidth: 240, cursor: 'pointer', flexShrink: 0 }}>
       {/* Card content */}
   </div>
   ```

3. For toggle buttons:
   ```jsx
   <button className="metal-frame-sm" style={{ ... }}>
       Button Text
   </button>
   ```

## Chrome Border Effect
The metal frame creates a gradient chrome border using CSS pseudo-elements:
- Gradient colors: `rgba(180, 190, 200, 0.9)` to `rgba(80, 90, 100, 0.4)` 
- Border thickness: 3px for large frames, 2px for small frames
- Includes a subtle top highlight for added depth

## Important
- Do NOT use inline border styles when using metal-frame classes
- The metal frame classes handle background, border-radius, and overflow automatically
- Always pair `.metal-frame` with `.video-card-metal` for proper hover effects on cards
