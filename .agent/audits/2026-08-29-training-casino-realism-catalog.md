# Training Catalog #SmarterCasinoRealism Audit — 2026-08-29

## Scope

- 107 canonical games across MTT (27), Cash (25), Spins (10), Psychology (20), and Advanced (25).
- Shared journey surfaces: Training Hub card, category card, session setup, campaign/level selector, and live arena.
- Desktop and 390px phone compositions.
- The global header is outside the redesign scope and remains unchanged.

## Delivered

- Generated 107 bespoke cinematic WebP renders in `public/images/training/casino-realism/`; filenames match canonical game IDs.
- Replaced the legacy reused-image map with a catalog-derived one-to-one asset contract.
- Rebuilt the shared category card as a straight-edged gunmetal casino console with rendered artwork, dimensional rails, progress instrumentation, and a clear launch state.
- Rebuilt category pages as image-led casino command decks with responsive mobile composition.
- Propagated each game's artwork into its shared setup and level-selection pages.
- Kept the arena background out of the artwork propagation layer so gameplay continues to use the Club Arena table skin, cards, avatars, hero placement, and manual verdict flow.
- Added a permanent build gate that fails on a missing asset, duplicate render, shared-surface bypass, or Club Arena skin regression.

## Verification

| Check | Result |
|---|---|
| Canonical game count | 107 |
| Rendered WebP count | 107 |
| Duplicate image hashes | 0 |
| One-by-one browser card clicks | 107 / 107 |
| Unique card artwork URLs | 107 / 107 |
| Mobile horizontal overflow | 0px |
| Card corner geometry | 0px radius; no clip path |
| Question-option integrity | Pass: four meaningful choices except literal Yes/No or Push/Fold |
| Feedback progression | Pass: verdict remains until explicit Next action |
| Optimized Next.js build | Pass |

## Generated-Art Method

The built-in image-generation mode produced the source renders. Prompts described each poker concept as a distinct physical casino machine—ICM scales, bounty vaults, range chambers, stack/pot ratio gears, minimum-defense shields, sizing pistons, population scanners, and equilibrium systems—inside a black-first chrome and gunmetal environment with controlled electric-blue energy. Prompts prohibited text, logos, flat vectors, generic SaaS gradients, rounded glass cards, and glow overload.

Source renders are retained under:

`/Users/smarter.poker/.codex/generated_images/01a04158-a7b7-7a61-ba57-a409f628621d`

Production assets are retained under:

`/Users/smarter.poker/Documents/.agent-trees/Smarter-Poker-World-Hub/codex-mobile-phase6/public/images/training/casino-realism`

