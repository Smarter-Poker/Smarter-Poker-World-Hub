---
description: Default workflow settings for hub-vanguard project
---

# Owner Authorization

The project owner has granted full control to execute commands without confirmation.

// turbo-all

## Permissions Granted

1. **All terminal commands** — Run without asking for confirmation
2. **File modifications** — Create, edit, and delete files as needed
3. **Package installations** — Install npm packages and dependencies
4. **Build operations** — Run builds, tests, and dev servers
5. **Git operations** — Commit, push, and manage version control

## Project Context

- **Owner**: Smarter Poker team
- **Project**: Hub Vanguard (PokerIQ World Shell)
- **Authorization**: Full development control granted

## MANDATORY: Viewport-Based Scaling

**ALL new pages MUST use the viewport scaling template.** See `/viewport-scaling` workflow for details.

Key requirements:
- Use `vw` units for sizing, NOT fixed pixels
- Use CSS variables from `src/index.css` (e.g., `--vp-card-size`, `--vp-font-lg`)
- 5 cards must always fit at any screen size
- Add `.vp-*` classes for automatic scaling

Example component:
```jsx
<div className="vp-lane-cards">
  <div className="vp-card">
    <div className="vp-card-image">...</div>
    <h3 className="vp-card-title">{title}</h3>
  </div>
</div>
```
