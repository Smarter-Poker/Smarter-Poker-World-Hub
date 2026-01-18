# 🔒 DEALER BUTTON & CHIP STACK POSITION LAW 🔒

**Status**: ETERNAL LAW  
**Established**: 2026-01-18  
**Authority**: Smarter.Poker Universal Standard  
**Method**: User-Controlled Manual Positioning

---

## Overview

This document codifies the **permanent, immutable dealer button and chip stack positions** for all 9-max poker tables across the entire Smarter.Poker ecosystem. All positions were manually positioned and verified by the user for pixel-perfect accuracy.

---

## Complete Position Table

All positions are specified as **percentage coordinates** relative to the `.table-area` container.

| Seat | Dealer Button Left | Dealer Button Top | Chip Stack Left | Chip Stack Top |
|------|-------------------|-------------------|-----------------|----------------|
| **Hero** | 50.49% | 75.74% | 47.70% | 71.82% |
| **V1** | 28.73% | 71.38% | 31.67% | 69.75% |
| **V2** | 27.26% | 55.15% | 29.61% | 54.61% |
| **V3** | 27.85% | 31.73% | 30.79% | 31.19% |
| **V4** | 35.05% | 15.28% | 33.29% | 18.01% |
| **V5** | 62.55% | 14.74% | 58.29% | 17.57% |
| **V6** | 73.14% | 31.95% | 64.61% | 31.52% |
| **V7** | 72.70% | 54.06% | 64.32% | 53.63% |
| **V8** | 71.96% | 71.60% | 64.17% | 69.10% |

---

## Individual Seat Details

### Hero
- **Dealer Button**: 50.49%, 75.74%
- **Chip Stack**: 47.70%, 71.82%

### Villain 1 (V1)
- **Dealer Button**: 28.73%, 71.38%
- **Chip Stack**: 31.67%, 69.75%

### Villain 2 (V2)
- **Dealer Button**: 27.26%, 55.15%
- **Chip Stack**: 29.61%, 54.61%

### Villain 3 (V3)
- **Dealer Button**: 27.85%, 31.73%
- **Chip Stack**: 30.79%, 31.19%

### Villain 4 (V4)
- **Dealer Button**: 35.05%, 15.28%
- **Chip Stack**: 33.29%, 18.01%

### Villain 5 (V5)
- **Dealer Button**: 62.55%, 14.74%
- **Chip Stack**: 58.29%, 17.57%

### Villain 6 (V6)
- **Dealer Button**: 73.14%, 31.95%
- **Chip Stack**: 64.61%, 31.52%

### Villain 7 (V7)
- **Dealer Button**: 72.70%, 54.06%
- **Chip Stack**: 64.32%, 53.63%

### Villain 8 (V8)
- **Dealer Button**: 71.96%, 71.60%
- **Chip Stack**: 64.17%, 69.10%

---

## JavaScript Implementation

```javascript
const DEALER_BUTTON_POSITIONS = {
  hero: { left: 50.49, top: 75.74 },
  v1: { left: 28.73, top: 71.38 },
  v2: { left: 27.26, top: 55.15 },
  v3: { left: 27.85, top: 31.73 },
  v4: { left: 35.05, top: 15.28 },
  v5: { left: 62.55, top: 14.74 },
  v6: { left: 73.14, top: 31.95 },
  v7: { left: 72.70, top: 54.06 },
  v8: { left: 71.96, top: 71.60 }
};

const CHIP_STACK_POSITIONS = {
  hero: { left: 47.70, top: 71.82 },
  v1: { left: 31.67, top: 69.75 },
  v2: { left: 29.61, top: 54.61 },
  v3: { left: 30.79, top: 31.19 },
  v4: { left: 33.29, top: 18.01 },
  v5: { left: 58.29, top: 17.57 },
  v6: { left: 64.61, top: 31.52 },
  v7: { left: 64.32, top: 53.63 },
  v8: { left: 64.17, top: 69.10 }
};

function setDealerButtonPosition(seatId, buttonElement) {
  const position = DEALER_BUTTON_POSITIONS[seatId];
  buttonElement.style.left = position.left + '%';
  buttonElement.style.top = position.top + '%';
}

function setChipStackPosition(seatId, chipElement) {
  const position = CHIP_STACK_POSITIONS[seatId];
  chipElement.style.left = position.left + '%';
  chipElement.style.top = position.top + '%';
}
```

---

## Usage Guidelines

1. **Immutability**: These positions are **ETERNAL LAW** and must never be changed without explicit authorization.
2. **User-Verified**: All positions were manually positioned and verified by the user for perfect visual alignment.
3. **Consistency**: All poker tables across Smarter.Poker (Training, Diamond Arena, Club Arena) must use these exact positions.
4. **Responsive**: Positions are percentage-based to ensure proper scaling across all device sizes.
5. **Reference**: This document is the single source of truth for dealer button and chip stack positioning.

---

## Application Scope

This law applies to:
- ✅ GTO Training Engine (Orb #4)
- ✅ Diamond Arena (Orb #3)
- ✅ Club Arena (Orb #2)
- ✅ All future poker table implementations

---

**🔒 LOCKED AS ETERNAL LAW - 2026-01-18 🔒**
