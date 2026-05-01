# ⛔ NO XP LAW — Platform Absolute

## Status: MANDATORY — ZERO TOLERANCE

XP has been permanently removed from the Smarter.Poker database. The `xp_total` column is gone from the `profiles` table. It was deleted months ago as a hard product decision.

## The Rule

**NEVER add XP back — anywhere:**
- No database columns (`xp_total`, `xp_amount`, or any `xp_*`)
- No API routes returning XP values
- No frontend components displaying XP
- No SQL migrations adding XP columns
- No comments or documentation treating XP as a live feature

## Use Diamonds Instead

ALL progression, rewards, and gamification on Smarter.Poker runs through 💎 **Diamonds**:

| Need | Solution |
|---|---|
| Award user currency | `add_diamonds_to_balance()` RPC |
| Read balance | `profiles.diamonds` |
| Track transactions | `diamond_transactions` table |
| Streak rewards | `share_streak_rewards` table |
| Multiplier bonuses | `profiles.diamond_multiplier` |

## Enforcement

Any code PR, migration, or component referencing XP as a live feature must be immediately rejected and rewritten using the Diamond system.
