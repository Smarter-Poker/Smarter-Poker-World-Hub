# Training Phase 3 Hub Media, Performance, And Browse Audit

Date: 2026-08-31
Status: In Progress
Baseline production build: `deda94df`

## Scope And Visual Direction

Phase 3 optimizes the primary Training Hub without flattening or replacing its
#SmarterCasinoRealism identity. The subject is a premium poker-training command
deck; its job is to let a player find and launch the right drill quickly while
preserving the unique 3D casino artwork for all 107 games.

The existing black-navy, cyan-steel, category-accent palette; Orbitron display
type; Rajdhani utility type; rectangular metal frames; unique casino renders;
and Training Orb hero remain the visual system. The signature element is the
game-specific casino render inside the shared metallic HUD frame. Motion stays
limited to purposeful hover depth and respects reduced-motion preferences. The
approved global header is frozen and is not part of this phase's edits.

## First Media Audit And Implementation

The Hub already owned complete responsive artwork, but its primary card grid
requested the root WebP directly instead of using the 640, 960, and 1440 AVIF
and WebP source sets. The recommended-drill card had the same gap. Both now use
the shared `TrainingGameArt` responsive contract with viewport-specific `sizes`.

The Training Orb hero and shared card HUD overlay were PNG-only. Modern AVIF and
WebP variants are now wired with PNG fallback. The render, frame geometry,
blend mode, unique artwork, and global header are unchanged.

| Asset or matrix | Result |
| --- | ---: |
| Canonical games | 107 |
| Required responsive art files | 642 / 642 |
| Unique canonical renders | 107 / 107 |
| Estimated 640 AVIF savings vs root WebP | 78.7% |
| Estimated 960 AVIF savings vs root WebP | 64.8% |
| Training Orb hero PNG | 2,125,296 bytes |
| Training Orb hero AVIF | 121,603 bytes |
| Shared HUD overlay PNG | 1,037,362 bytes |
| Shared HUD overlay AVIF | 27,221 bytes |

The authoritative report is
`.agent/audits/2026-08-31-training-phase-3-hub-media.json`, generated and checked
by `scripts/training-hub-media-audit.mjs`. It fails on a missing responsive
variant, duplicated canonical artwork, stale report, direct non-responsive Hub
image use, missing modern hero/HUD delivery, or scanline regression.

## Verification To Date

- Eight focused media, casino-art, scanline, Club Arena, and inventory contracts
  pass.
- TypeScript compilation and whitespace validation pass.
- The Phase 2 authoritative inventory remains fresh: 107 games, 765 CTAs, zero
  CTA wiring gaps, and zero unassigned route-state gaps.

## Remaining Phase 3 Work

- Complete a production build and inspect desktop/mobile Hub screenshots.
- Measure actual browser transfer selection, layout shift, DOM/card density, and
  search/filter responsiveness.
- Exercise every category, representative queries, zero-result recovery, and all
  107 card launches.
- Correct any browse, responsive, visual, accessibility, or performance defect
  discovered by those runs.
- Publish through a protected PR and certify the exact production build before
  marking Phase 3 complete or beginning Phase 4.
