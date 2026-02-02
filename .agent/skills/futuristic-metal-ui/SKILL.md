---
name: Futuristic Metal UI System
description: Implement the Smarter.Poker premium visual design system - Skeuomorphic Sci-Fi with industrial metal frames, neon accents, and casino vault aesthetics
---

# Futuristic Metal UI System

## Overview

This skill defines the **Futuristic Metal / Skeuomorphic Sci-Fi** design language for Smarter.Poker. This is NOT flat design, NOT glassmorphism, NOT neumorphism. This is rich, tactile, hardware-like, premium casino terminal aesthetic.

## Primary Classification

**Skeuomorphic Sci-Fi UI (Futuristic Skeuomorphism)**

### Sub-styles We Embody
1. **Skeuomorphism** - Real-world materials simulated digitally (metal, glass, screws)
2. **Sci-Fi / HUD UI** - Glowing lines, neon accents, grid patterns
3. **Industrial / Mechanical UI** - Bolts, rivets, pipes, hard edges
4. **Luxury Tech / High-Roller Casino UI** - Dark navy, cyan glow, VIP vibe

### What This is NOT ❌
- ❌ Flat design
- ❌ Neumorphism (soft shadows)
- ❌ Glassmorphism (frosted glass blur)
- ❌ Modern minimal web-app style
- ❌ Generic Bootstrap/Tailwind defaults

---

## Core Design Tokens

### Color Palette
```css
:root {
  /* Base Colors - Dark Navy / Gunmetal */
  --metal-dark: #0a0a15;
  --metal-base: #0d1117;
  --metal-mid: #1a2332;
  --metal-light: #2a3a4a;
  --metal-highlight: #3d4f5f;
  
  /* Accent Colors - Neon Cyan */
  --neon-cyan: #00D4FF;
  --neon-cyan-glow: rgba(0, 212, 255, 0.6);
  --neon-cyan-dim: rgba(0, 212, 255, 0.3);
  
  /* Secondary Accents */
  --neon-magenta: #FF00FF;
  --gold-vip: #FFD700;
  --diamond-blue: #00BFFF;
  
  /* Metal Gradients */
  --metal-gradient: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
  --frame-gradient: linear-gradient(135deg, #4a5a6a 0%, #2a3a4a 50%, #1a2a3a 100%);
  
  /* Lighting Effects */
  --glow-cyan: 0 0 10px var(--neon-cyan), 0 0 20px var(--neon-cyan-glow);
  --glow-intense: 0 0 5px var(--neon-cyan), 0 0 15px var(--neon-cyan), 0 0 30px var(--neon-cyan-glow);
}
```

### Typography
```css
/* Primary: Industrial / Military feel */
font-family: 'Orbitron', 'Rajdhani', 'Exo 2', sans-serif;

/* Sizes - Bold and readable */
--text-header: 1.5rem, font-weight: 700, letter-spacing: 0.1em, text-transform: uppercase;
--text-label: 0.875rem, font-weight: 600, letter-spacing: 0.05em, text-transform: uppercase;
--text-body: 1rem, font-weight: 400;
--text-stats: 1.25rem, font-weight: 700;
```

---

## Component Specifications

### 1. Metal Frame Container
The signature element - every major container has a machined metal frame.

```jsx
/* Structure */
<div className="metal-frame">
  <div className="frame-corner top-left" />
  <div className="frame-corner top-right" />
  <div className="frame-corner bottom-left" />
  <div className="frame-corner bottom-right" />
  <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
  <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
  <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
  <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
  <div className="neon-strip left" />
  <div className="neon-strip right" />
  {children}
</div>
```

```css
.metal-frame {
  position: relative;
  background: var(--metal-gradient);
  border: 3px solid var(--metal-highlight);
  border-radius: 12px;
  box-shadow: 
    inset 0 1px 0 rgba(255,255,255,0.1),
    inset 0 -1px 0 rgba(0,0,0,0.3),
    0 4px 20px rgba(0,0,0,0.5);
}

.frame-bolt {
  position: absolute;
  width: 12px;
  height: 12px;
  background: radial-gradient(circle, #5a6a7a 30%, #3a4a5a 70%);
  border-radius: 50%;
  border: 1px solid #2a3a4a;
  box-shadow: inset 0 1px 2px rgba(255,255,255,0.2);
}

.frame-bolt::after {
  content: '+';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 8px;
  color: #1a2a3a;
}

.neon-strip {
  position: absolute;
  width: 4px;
  top: 20%;
  bottom: 20%;
  background: var(--neon-cyan);
  box-shadow: var(--glow-cyan);
  border-radius: 2px;
}

.neon-strip.left { left: 8px; }
.neon-strip.right { right: 8px; }
```

### 2. Porthole Button (Circular)
Used for primary actions like "CREATE A CLUB", "JOIN A CLUB"

```css
.porthole-button {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: var(--metal-gradient);
  border: 4px solid var(--metal-highlight);
  box-shadow: 
    inset 0 2px 4px rgba(255,255,255,0.1),
    inset 0 -2px 4px rgba(0,0,0,0.3),
    0 4px 15px rgba(0,0,0,0.4);
  cursor: pointer;
  transition: all 0.3s ease;
}

.porthole-button:hover {
  border-color: var(--neon-cyan);
  box-shadow: 
    inset 0 2px 4px rgba(255,255,255,0.1),
    var(--glow-cyan);
}

.porthole-button::before {
  /* Inner ring */
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  border: 2px solid var(--metal-light);
}
```

### 3. Metal Input Field
Inset, beveled input with industrial feel

```css
.metal-input {
  background: linear-gradient(180deg, #0a0a15 0%, #1a2332 100%);
  border: 2px solid var(--metal-highlight);
  border-radius: 8px;
  padding: 12px 16px;
  color: white;
  font-family: 'Rajdhani', sans-serif;
  font-size: 1rem;
  box-shadow: 
    inset 0 2px 4px rgba(0,0,0,0.5),
    inset 0 -1px 0 rgba(255,255,255,0.05);
}

.metal-input:focus {
  border-color: var(--neon-cyan);
  box-shadow: 
    inset 0 2px 4px rgba(0,0,0,0.5),
    0 0 10px var(--neon-cyan-glow);
  outline: none;
}
```

### 4. Hexagonal Badge / Button
For action buttons like "CREATE", "NEXT", "SUBMIT"

```css
.hex-button {
  position: relative;
  padding: 12px 32px;
  background: var(--metal-gradient);
  border: 2px solid var(--metal-highlight);
  clip-path: polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%);
  color: white;
  font-family: 'Orbitron', sans-serif;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s ease;
}

.hex-button:hover {
  background: linear-gradient(180deg, var(--neon-cyan-dim) 0%, var(--metal-mid) 100%);
  box-shadow: var(--glow-cyan);
}
```

### 5. Stats Panel
Metal plating with segmented displays

```css
.stats-panel {
  display: flex;
  background: var(--metal-gradient);
  border: 2px solid var(--metal-highlight);
  border-radius: 8px;
  overflow: hidden;
}

.stat-segment {
  flex: 1;
  padding: 12px 16px;
  text-align: center;
  border-right: 1px solid var(--metal-highlight);
}

.stat-segment:last-child {
  border-right: none;
}

.stat-label {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.6);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--neon-cyan);
  text-shadow: 0 0 10px var(--neon-cyan-glow);
}
```

### 6. Pipe Connector
Visual element connecting UI components

```css
.pipe-connector {
  position: relative;
  height: 8px;
  background: linear-gradient(90deg, 
    var(--metal-highlight) 0%, 
    var(--metal-light) 50%, 
    var(--metal-highlight) 100%
  );
  border-radius: 4px;
  box-shadow: 
    inset 0 1px 2px rgba(255,255,255,0.2),
    inset 0 -1px 2px rgba(0,0,0,0.3);
}

.pipe-joint {
  position: absolute;
  width: 16px;
  height: 16px;
  background: var(--metal-light);
  border: 2px solid var(--metal-highlight);
  border-radius: 50%;
  top: 50%;
  transform: translateY(-50%);
}
```

---

## Animation Guidelines

### Approved Animations
1. **Glow Pulse** - Neon elements pulse subtly
2. **Metal Shine** - Highlight sweeps across surfaces on hover
3. **Hydraulic Movement** - Elements slide with mechanical feel (ease-out with slight bounce)
4. **HUD Flicker** - Data displays flicker briefly on update

### Animation Code
```css
@keyframes neon-pulse {
  0%, 100% { opacity: 1; box-shadow: var(--glow-cyan); }
  50% { opacity: 0.8; box-shadow: var(--glow-intense); }
}

@keyframes metal-shine {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.neon-animated {
  animation: neon-pulse 2s ease-in-out infinite;
}

.metal-shine-hover:hover {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255,255,255,0.1) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: metal-shine 0.5s ease-out;
}
```

---

## Reference Images

The following reference images define the target aesthetic:
- Navigation bars with porthole buttons and pipe connectors
- Modal frames with corner bolts and neon accent strips
- Search bars with circular avatar holders and glowing rings
- Club cards with metal frames, screws, and stats panels

---

## Validation Checklist

Before completing any UI component, verify:

- [ ] Uses dark navy/gunmetal base colors (#0a0a15 to #2a3a4a)
- [ ] Has visible metal frame elements (bolts, rivets, or screws)
- [ ] Includes neon cyan accent lighting where appropriate
- [ ] Uses industrial typography (Orbitron, Rajdhani, or Exo 2)
- [ ] Has proper depth via shadows and bevels
- [ ] Feels like a casino terminal / vault interface
- [ ] Does NOT look like a generic modern web app
- [ ] Does NOT use flat or minimal styling
