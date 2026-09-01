# 2026-09-01 - The header's background, and the disc covering the ring

Dan, 2026-09-01: "on mobile, the global header needs the background removed on
all pages inside smarter.poker, club arena, and club commander. the profile
image needs to be fixed on most of them as well."

Two defects, both present identically in the two approved-header
implementations this repo ships:

- `src/components/ui/UniversalHeader.js` (`.approved-global-header`) - every
  smarter.poker Hub page;
- `vendor/commander-shared/src/components/commander/shared/CommanderLayout.jsx`
  (`.cmd-approved-header`) - Club Commander.

The Club Arena copy is fixed in the same-named branch of
`Smarter-Poker-Club-Arena` (PR #2515).

## 1. The background

Both headers carried `background: #000`.

The approved artwork (`public/images/global-header/global-header-desktop.png`)
is opaque across its entire 1648x168 canvas, so this fill could never be seen
*behind* the header. It was only ever visible where the artwork is **not**:

- the `padding-top: env(safe-area-inset-top, 0px)` band the same rule adds;
- the `max(env(safe-area-inset-top, 0px), 24px)` band the
  standalone/fullscreen media query forces on an installed PWA;
- the `env(safe-area-inset-left/right)` gutters `__art` insets by.

All three are phones. On a desktop every one of them is zero, which is why this
never showed on a laptop. So the rule's only observable effect was an opaque
black block above and beside the header on mobile - the block Dan asked to have
removed. Both are `background: transparent` now.

## 2. The profile image

Measured off the artwork these headers actually render, from the source file
rather than by eye. In its 1648x168 coordinate system the profile ornament is a
circle:

| Feature | Measurement |
| --- | --- |
| centre | (1159.75, 80.5) |
| outer diameter (chrome ring) | 94 units |
| chrome band thickness | ~6 units |
| aperture (dark well inside the ring) | 81 units |

Against that, both files shipped:

- `__profile` painting an **opaque black disc 117.8 units across** (`width:
  7.15%` of the plane with `aspect-ratio: 1`, `background: #000`,
  `border-radius: 50%`). That is wider than the entire ornament, so the approved
  chrome ring and its blue outer glow were painted out. What reached the screen
  was a flat black circle, not a framed portrait.
- `__avatar-slot` at `width: 72%` centred `50% / 50%` of that button -
  **84.8 units sitting 3.6 units low**. Wider than the 81-unit aperture and
  nearly as wide as the ring's outer edge, so the photo covered the chrome band
  on three sides and hung past it at the bottom.

Now: `__profile` paints nothing (it is a hit region, like every other control in
these files), and the slot is the measured aperture - `width: 68.7%` centred at
`50.7% / 46.9%` of the button, which is 80.95 units centred at (1159.78, 80.46).
`aspect-ratio: 1` keeps it a true circle at every width because the button is
already square in pixels. The approved ring and glow frame the photo again.

`object-fit: cover` was already correct in both files and is unchanged.

Unlike Club Arena, neither of these headers compresses the artwork at desktop
widths - both keep `aspect-ratio: 1648 / 168` with `object-fit: contain` at
every width - so the ornament is a true circle everywhere and one geometry is
correct for all breakpoints. No desktop exception was needed here.

## Scope notes

- `smarter-poker-commander` (the standalone repo) has **no** global header:
  no `GlobalHeader`/`UniversalHeader` component and no reference to any
  `images/global-header/` asset. Each page renders its own local
  `<header className="bg-[#242526] ...">`. The header Dan describes does not
  exist there, so there was nothing to change in that repo.
- The canonical `commander-shared` package does not yet carry this header
  (`cmd-approved-header__avatar-slot` does not appear in its
  `CommanderLayout.jsx`); the vendored copy in this repo is ahead of it and is
  what actually ships. Flagged so a future `commander-shared` sync does not
  regress this.

## Tests

`__tests__/global-header-approved.test.mjs` pinned the old geometry for both
files, so it is updated in this same commit:

- new: both headers declare `background: transparent` and neither `__profile`
  declares `background: #000`;
- rewritten: the aperture geometry (`46.9% / 50.7% / 68.7%`) for both.

## Verification

- `node --test __tests__/global-header-approved.test.mjs` - 7/7 passing
- `node --test __tests__/hamburger-never-regresses.test.mjs __tests__/world-command-menu-law.test.mjs` - 12/12 passing
- `npx next build` - passing
