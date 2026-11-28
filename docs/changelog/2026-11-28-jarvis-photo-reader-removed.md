# 2026-11-28 The Jarvis Photo Reader Is Removed

Dan's call: remove the Jarvis photo reader.

- Deleted `pages/api/jarvis/vision-hand-parse.js` (screenshot-to-hand vision) and its helper `src/lib/ai/handVision.mjs`, added in #3226, plus that PR's test `__tests__/jarvis-hand-vision.test.mjs`.
- No screen called the endpoint, so nothing visible changes. It was the only thing that needed a paid vision provider (Anthropic credits or an OpenAI key), so that open item is closed.
- The other Jarvis endpoints (bankroll analysis, dealer reference, leak alert, training session, user insights) are untouched.

Hardening: `__tests__/jarvis-photo-reader-removed.test.mjs` (reachable through `_test-guards-exist`) fails if the route or helper comes back, or if any page, component or library points at `vision-hand-parse`.
