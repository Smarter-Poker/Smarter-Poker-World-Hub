# Approved Poker Trivia Mobile Gallery

## Authority And Scope

Owner instruction in the current design conversation: "PUBLISH THIS ONE. I LIKE IT."
Approved reference: the final two-column mobile mockup generated on November 27, 2026.
The earlier instructions lock the global header and footer, require custom dimensional icons and game-specific illustrations, place Help inside the upper-right of the page banner, and remove one game from discovery.

This is a World Hub frontend delivery. It requires no engine activation, database change, financial mutation, or change to competitive release flags.

## Ownership And Candidate

- Owner: the current Poker Trivia delivery agent.
- Branch: `agent/codex/trivia-approved-two-column-8d977e2e`.
- Base: `ac828a8df719ef76493b28f6f708716ec7469072`.
- Integrated protected main before submission: `acd1363b81be71cb8f5b74762b280515c3f4fba0`, a clean fast-forward containing two concurrent, nonoverlapping deliveries.
- Worktree: `/workspace/scratch/8d977e2e1ccc/smarter-poker-trivia`.
- Publication: protected GitHub squash merge, then the existing `hub-vanguard` Vercel Git source build.

## Finite Acceptance

1. Two equal game-card columns on narrow mobile, with readable titles, undistorted artwork, reachable controls, and no horizontal overflow.
2. Twelve gallery entries in this order: 1v1 Battle, Daily Tournament, GTO Master, MTT Scenarios, Cash Game, ICM & Chip EV, Poker History, Pro Knowledge, Rules Quiz, Survival Mode, Endless Mode, Time Attack.
3. Mixed Mode disappears from discovery only. Its canonical route, records, and active-run recovery remain available.
4. Every card has its own custom illustration. Text, actions, balances, and status remain live application UI.
5. The approved chrome/black/cobalt body, custom icons, search, Daily Trivia action, Study My Misses, and existing utility destinations work.
6. The upper-right Help button opens page-specific accessible help, closes via its visible control and Escape, and returns focus.
7. Global header/footer components and assets remain unchanged. The real fixed footer clears the last action.
8. Existing authentication, account isolation, paid-mode confirmation, free autostart rules, recovery, rewards, and server-owned maintenance states remain authoritative.
9. Applicable local contracts and normal hooks pass; required current-head hosted checks pass; the protected revision is published and affected live behavior is verified.

## Policy Reading

Read repository `AGENTS.md`, `CLAUDE.md`, `AGENT-PLAYBOOK.md`, `PUBLISHING.md`, the four portable policies, `docs/SMARTERDESIGN.md`, and its skill.
Direct policy reader completed at `2026-11-27T19:22:23.203Z`, policy version `2.9`, manifest SHA-256 `e78254a8d7b401b5e9f8fdcefa1f6f36088fa1a7128e1c2d18622c2a952ac2cb`.
Fresh resumption reading completed at `2026-11-27T19:37:04.865Z` with the same version and hashes. Repository entrypoints, product instructions, publishing route, design standard, and this checkpoint were reread separately.
Portable policy SHA-256 values: Owner `f5633d1b9e2b3d3ad7f30dea9e89691ec3044e05ff68471e7d9d8de36e079256`; Operating Law `a8bc3c04dce3354ebdd51a89c0b7d715af3344edcc794d33f6b3ad64506961d5`; Hardening `d5fc451ce5caf6d6b5e64597a13883e1246581678fe53c962339d0a66136993e`; Reference Index `adce89c3f838f2f373cd504a00329d53906404d1dd42a647f672af6c16f95555`.

## Validation And Publication Evidence

Implementation includes the two-column gallery, 12 unique illustrations with responsive 576px renditions, custom dimensional body icons, live search, accessible Help, existing account-bound recovery, and server-owned game availability. Only the lobby summary removes the obsolete Mixed discovery link; the canonical game and recovery path remain intact. Global header and footer source/assets are unchanged.

Local evidence before submission:

- Focused presentation, routing, pricing, free-autostart, account-isolation, PvP and tournament containment contracts: 99 tests passed after restoring excluded canonical image files. No skipped assertions.
- The initial three failures were missing baseline images in this inherited sparse checkout. Exact HEAD blobs were restored and compared byte-for-byte. The owned worktree now includes `public/images/trivia` and `public/images/smarterdesign` in its private sparse configuration. No canonical asset bytes changed.
- AST comparison confirmed the eight existing pricing, route, recovery and rating-cache functions are unchanged from the original base.
- Module parse/binding/import verification passed for 3,729 modules after adding the new presentation files to the index. The initial untracked-file reports were resolved by normal staging.
- Next.js 16.3.3 served the changed page locally with HTTP 200. The integrated candidate passed a targeted production webpack compile using `--experimental-build-mode compile --debug-build-paths=pages/hub/trivia/index.js`. This is compile evidence, not a complete production build or live deployment.
- Local interactive browser execution is unavailable: the installed Chromium launcher has no binary, and the supported Playwright browser download returned HTTP 403. No browser result is claimed from that attempt. The existing hosted Trivia browser gate owns the added mobile interaction and screenshot evidence.
- The existing Trivia image-cache identity is updated from the complete canonical image tree so installed clients can retire stale artwork. The cache ownership and rollback behavior remain unchanged.
- Cache identity is `trivia-art-76502431e3`; intro-art and PWA rollback checks passed 11/11. The connected console frame, canonical generated-type guard, forbidden-hue, and approved-palette contracts pass. The new palette exception is limited to the approved lobby stylesheet.
- The existing `Global Footer E2E` workflow runs the Trivia performance spec for every main PR. The new signed-out interaction case checks the actual 375px gallery, all12loaded images, equal columns, overflow, search/empty/clear, Help focus/dismissal, and landscape close reachability; it attaches five mobile/desktop screenshots. All21existing performance cases remain. Browser discovery found22tests without executing a browser locally.
- Later Playwright invocations erase shared output directories. A minimal immediate `actions/upload-artifact@v4` step in that existing workflow now retains the Trivia report before the next suite. No trigger, permission, runner, release gate, or publisher changed. The directly connected footer/workflow source contracts passed25/25 and Phase11 wiring/budget contracts passed3/3.
- UI text and title-case scans passed. Final diff whitespace is clean.

Normal commit/pre-push hooks, exact-head hosted checks, protected merge, Vercel source publication, and live verification remain pending at this source checkpoint. The final provider identities and observed result will be recorded in the owning PR and delivery report.
