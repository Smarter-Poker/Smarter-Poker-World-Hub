# 🔒 CHIP STACK POSITION LAW 🔒

**Status**: ETERNAL LAW  
**Established**: 2026-01-18  
**Authority**: Smarter.Poker Universal Standard

---

## Overview

This document codifies the **permanent, immutable chip stack positions** for all 9-max poker tables across the entire Smarter.Poker ecosystem. Chip positions are calculated using a **universal offset** from each seat's dealer button position.

---

## Universal Offset Formula

**Offset from Dealer Button:**
- **Left**: -2.79%
- **Top**: -4.47%

This offset was established from the Hero position and applies universally to all seats.

---

## Chip Stack Positions (9-Max Table)

All positions are specified as **percentage coordinates** relative to the `.table-area` container.

### Hero
- **Left**: 47.65%
- **Top**: 71.06%

### Villain 1 (V1)
- **Left**: 72.41%
- **Top**: 73.56%

### Villain 2 (V2)
- **Left**: 25.45%
- **Top**: 48.14%

### Villain 3 (V3)
- **Left**: 34.86%
- **Top**: 11.07%

### Villain 4 (V4)
- **Left**: 34.94%
- **Top**: 11.86%

### Villain 5 (V5)
- **Left**: 69.77%
- **Top**: 25.15%

### Villain 6 (V6)
- **Left**: 69.47%
- **Top**: 47.26%

### Villain 7 (V7)
- **Left**: 69.56%
- **Top**: 48.25%

### Villain 8 (V8)
- **Left**: 68.77%
- **Top**: 67.92%

---

## Implementation Standard

### JavaScript Implementation
```javascript
const CHIP_OFFSET = {
  left: -2.79,
  top: -4.47
};

const DEALER_BUTTON_POSITIONS = {
  v1: { left: 75.20, top: 78.03 },
  v2: { left: 28.24, top: 52.61 },
  v3: { left: 37.65, top: 15.54 },
  v4: { left: 37.73, top: 16.33 },
  v5: { left: 72.56, top: 29.62 },
  v6: { left: 72.26, top: 51.73 },
  v7: { left: 72.35, top: 52.72 },
  v8: { left: 71.56, top: 72.39 },
  hero: { left: 50.44, top: 75.53 }
};

function calculateChipPosition(seatId) {
  const buttonPos = DEALER_BUTTON_POSITIONS[seatId];
  return {
    left: (buttonPos.left + CHIP_OFFSET.left) + '%',
    top: (buttonPos.top + CHIP_OFFSET.top) + '%'
  };
}

function setChipStackPosition(seatId, chipElement) {
  const position = calculateChipPosition(seatId);
  chipElement.style.left = position.left;
  chipElement.style.top = position.top;
}
```

---

## Usage Guidelines

1. **Immutability**: These positions are **ETERNAL LAW** and must never be changed without explicit authorization.
2. **Consistency**: All poker tables across Smarter.Poker (Training, Diamond Arena, Club Arena) must use these exact positions.
3. **Offset-Based**: Chip positions are always calculated as `button_position + offset` for consistency.
4. **Responsive**: Positions are percentage-based to ensure proper scaling across all device sizes.
5. **Reference**: This document is the single source of truth for chip stack positioning.

---

## Application Scope

This law applies to:
- ✅ GTO Training Engine (Orb #4)
- ✅ Diamond Arena (Orb #3)
- ✅ Club Arena (Orb #2)
- ✅ All future poker table implementations

---

**🔒 LOCKED AS ETERNAL LAW - 2026-01-18 🔒**
