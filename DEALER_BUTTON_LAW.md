# 🔒 DEALER BUTTON POSITION LAW 🔒

**Status**: ETERNAL LAW  
**Established**: 2026-01-18  
**Authority**: Smarter.Poker Universal Standard

---

## Overview

This document codifies the **permanent, immutable dealer button positions** for all 9-max poker tables across the entire Smarter.Poker ecosystem. These positions were established through interactive positioning and are now **ETERNAL LAW** for every table interface.

---

## Dealer Button Positions (9-Max Table)

All positions are specified as **percentage coordinates** relative to the `.table-area` container for responsive scaling.

### Villain 1 (V1)
- **Left**: 75.20%
- **Top**: 78.03%

### Villain 2 (V2)
- **Left**: 28.24%
- **Top**: 52.61%

### Villain 3 (V3)
- **Left**: 37.65%
- **Top**: 15.54%

### Villain 4 (V4)
- **Left**: 37.73%
- **Top**: 16.33%

### Villain 5 (V5)
- **Left**: 72.56%
- **Top**: 29.62%

### Villain 6 (V6)
- **Left**: 72.26%
- **Top**: 51.73%

### Villain 7 (V7)
- **Left**: 72.35%
- **Top**: 52.72%

### Villain 8 (V8)
- **Left**: 71.56%
- **Top**: 72.39%

### Hero
- **Left**: 47.79%
- **Top**: 97.97%

---

## Implementation Standard

### CSS Implementation
```css
.dealer-button {
  position: absolute;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fff, #ddd);
  border: 3px solid #000;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 900;
  color: #000;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
  z-index: 100;
  transition: all 0.3s ease;
}
```

### JavaScript Implementation
```javascript
const DEALER_BUTTON_POSITIONS = {
  v1: { left: '75.20%', top: '78.03%' },
  v2: { left: '28.24%', top: '52.61%' },
  v3: { left: '37.65%', top: '15.54%' },
  v4: { left: '37.73%', top: '16.33%' },
  v5: { left: '72.56%', top: '29.62%' },
  v6: { left: '72.26%', top: '51.73%' },
  v7: { left: '72.35%', top: '52.72%' },
  v8: { left: '71.56%', top: '72.39%' },
  hero: { left: '47.79%', top: '97.97%' }
};

function setDealerButtonPosition(seatId, buttonElement) {
  const position = DEALER_BUTTON_POSITIONS[seatId];
  if (position) {
    buttonElement.style.left = position.left;
    buttonElement.style.top = position.top;
  }
}
```

---

## Usage Guidelines

1. **Immutability**: These positions are **ETERNAL LAW** and must never be changed without explicit authorization.
2. **Consistency**: All poker tables across Smarter.Poker (Training, Diamond Arena, Club Arena) must use these exact positions.
3. **Responsive**: Positions are percentage-based to ensure proper scaling across all device sizes.
4. **Reference**: This document is the single source of truth for dealer button positioning.

---

## Application Scope

This law applies to:
- ✅ GTO Training Engine (Orb #4)
- ✅ Diamond Arena (Orb #3)
- ✅ Club Arena (Orb #2)
- ✅ All future poker table implementations

---

**🔒 LOCKED AS ETERNAL LAW - 2026-01-18 🔒**
