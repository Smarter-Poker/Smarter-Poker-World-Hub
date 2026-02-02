---
description: All pages must use UniversalHeader - the standard Hub header with real user data
---
# 🏛️ Header Standardization Law

**MANDATORY**: Every page in `/hub` must use the `UniversalHeader` component. No custom headers allowed (except club-arena).

## The Standard

The Hub page header with:
- **← Hub** button (or **Back** for sub-pages)
- **Smarter.Poker** branding
- **💎 Diamonds** with buy button
- **XP • LV** display
- **Orb icons**: Profile, Messages, Notifications, Settings

## Implementation

```jsx
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// Main pages (direct children of /hub)
<UniversalHeader pageDepth={1} />

// Sub-pages (nested under a main page)
<UniversalHeader pageDepth={2} />
```

### pageDepth Rules
| Page Type | Example | pageDepth | Shows |
|-----------|---------|-----------|-------|
| Main page | `/hub/training` | 1 | ← Hub |
| Sub-page | `/hub/training/arena/[id]` | 2 | ← Back |

## Data Source

UniversalHeader fetches REAL user data automatically from:
- **Diamonds**: `user_diamond_balance` table via `queryDiamondBalance()`
- **XP/Level**: `profiles.xp_total` via `queryProfiles()`
- **Avatar**: `profiles.avatar_url`

## Enforcement

Before any merge:
1. Check all `/hub/*.js` files use `<UniversalHeader />`
2. Verify no custom header components
3. Confirm correct `pageDepth` value

## Exception

Only `club-arena.js` is exempt from this requirement.
