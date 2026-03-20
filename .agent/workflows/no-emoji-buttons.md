---
description: No emojis allowed in button text - use clean text labels only
---

# No Emoji Standard

> **This rule is already enforced by CLAUDE.md Rule 8.** This workflow exists as a quick reference.

**ZERO emojis anywhere in UI code.** This is an absolute, permanent, zero-exception rule.

## Applies To
- All `.js`, `.jsx`, `.tsx` files across the entire codebase
- Button text, modal titles, tab names, toast messages, menu labels, admin panels
- Club Commander: use Lucide React icons instead (`<Check />`, `<Star />`, `<AlertTriangle />`)

## Quick Check (run before committing)
```bash
grep -rn '[😀-🫿🌀-🗿⚡-⚽✅❌⭐🔥💎🏆🎯🎲🎰🃏♠♥♦♣]' --include='*.js' --include='*.jsx' --include='*.tsx' pages/ src/
```

If any matches: replace with plain text or Lucide icons.
