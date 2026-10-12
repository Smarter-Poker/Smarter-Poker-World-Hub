# Video Library Mobile Redesign, Phase 3 Of 8

Owner: Codex chat 01a13094-e335-71b2-b49e-651bc6ff67dc. Prior Claude mobile task is handed off through the owner's pasted transcript; no matching active writer/open phase PR found. Earlier Video/Reels ten-phase programme is separate and remains untouched.

Recovered baseline: b5645a336cf, including mobile layout #2319, curation #2328, watch pages #2338, casino filter #2340 and thumbnail fill #2341. Previous phases are historical claims until current live checks.

Authorization: continue the owner's mobile redesign at Phase 3. Scope: library viewer and standalone watch page; real playback timeline and session hand markers, cancellable five-second next-video countdown, Show More description, vertical short-video presentation, same-iframe mini-player. Excludes phases 4–8, catalog ingestion/rights changes, account persistence and engine/database changes. Description remains verified catalog facts; marker UI explicitly identifies session-only storage. Short videos follow the existing shelf's up-to-180-second definition.

Checkout: /Volumes/SmarterWork/agent-work/video-library-phase3-20261012
Branch: agent/codex/video-library-phase3-20261012
Evidence: /Volumes/SmarterArchives/agent-evidence/video-library-phase3-20261012
Route: protected World Hub squash merge, Vercel hub-vanguard Git build, READY and health identity plus affected live behavior. No engine dependency or hourly gate.

Policy receipt: canonical reader emitted 2026-10-12T14:47:13.863Z, version 2.9, manifest a659f31c5c1c2b0864889508079a635dd5fe2fc98decfbfc9d3f9c80dd45ec3b. Read canonical AGENTS.md, AGENT-OPERATING-LAW.md, AGENT-HARDENING-STANDARD.md, AGENT-REFERENCE-INDEX.md and MAC-STORAGE.md; root AGENTS.md, CLAUDE.md, AGENT-PLAYBOOK.md, PUBLISHING.md and applicable Video Library workflow. Older metal-frame workflow is superseded by owner's explicit frame removal in this mobile redesign. Canonical/portable parity passed. SSD is independently mounted and has space. GitHub configured authenticated access is available. No credentials read from environment files.

Acceptance: same mounted iframe through minimize/expand; modal focus and background scroll restored when minimized; strict player-window/origin message validation; bounded seek positions and duplicate marker protection; countdown stops on cancel, pause, playback error, hidden tab, video change and unmount; next video actually starts; no invented hand data; phone/desktop widths and touch targets; prior watch SEO/curation behavior retained; required checks, merge, publication and live proof.

Initial checks: locked private dependencies installed on SSD; changed JSX parsed; title case and UI text guards pass; watch-page regression 10/10; git diff whitespace passes. Remaining: behavioral tests, full checks/build, responsive browser proof, protected delivery and live verification.

## Local Qualification

- Focused curation/watch/playback and existing reliability tests: 64/64 pass on final source.
- Full library browser matrix: 25 passed, one intentional desktop skip for a phone-only geometry case. Added Phase 3 matrix: 4/4 pass after the autoplay-toggle reload was reproduced and corrected by freezing the launch preference for the current iframe.
- Standalone page with an isolated PostgREST fixture: 375/393/768/1440 widths pass hand seeking, same-iframe minimize/expand, Show More and next-video URL/player transition; measured short stage 296.875 x 527.766 (9:16).
- Search fixture repaired to include the real discovery endpoint used by search. No source behavior changed for that fixture repair.
- Initial build failed fixture storage assertions: TMPDIR must be outside the checkout so missing-parser and private-credential tests do not inherit checkout modules or mistake fixture credentials for tracked source. Corrected to a separate task-owned SSD temporary folder. Next dev's own next-env.d.ts change was restored; the production build regenerates it.
- Required repository/build qualification is running; no hosted submission or completion claimed yet.
- Full required meta-guard on the corrected external temporary path: 2,952/2,952 pass, no skips. Tests now use a temporary folder outside the repository to preserve private-credential fixture boundaries and missing-dependency isolation.
- The final playback control also cancels a pending next transition when the proposed next title changes and retains at least a 200px mini-player height. No media is downloaded or duplicated.
- Exact production-source build on committed implementation dfd060dbaa8412fe253f0da20eb81ef76213a4e4: build:vercel passed, 508/508 pages generated. Full npm build also passed. Build runs without production credentials; runtime catalog access is verified separately.
- Final production-bundle browser matrix: 25/25 executable Chromium desktop/phone checks passed (one explicitly conditional desktop skip for the phone-only geometry case). Safari/WebKit desktop/phone Phase 3 matrix passed 4/4, including seek, markers, countdown cancellation and same-iframe minimize/expand.
- All local source gates and exact candidate compilation passed. Hosted required checks, protected merge, Vercel READY, live health identity and final affected live proof remain pending.
