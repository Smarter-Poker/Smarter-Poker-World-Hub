# 2026-11-27 Jarvis hand vision runs on Claude

- `/api/jarvis/vision-hand-parse` now reads screenshots with Claude (`claude-sonnet-5-5`, ANTHROPIC_API_KEY) and falls back to OpenAI only when no Anthropic key is configured. The production OpenAI key was revoked (401), which left the endpoint unusable.
- The reply parser now actually strips ```json fences and surrounding prose (the old regex was double-escaped and never matched).
- Provider selection, request building and parsing live in `src/lib/ai/handVision.mjs` with `__tests__/jarvis-hand-vision.test.mjs`.
- Note: no UI currently calls this endpoint; the revoked OpenAI key affected no live user feature.
- Live check 2026-11-27: the request reached Claude and was refused for low Anthropic credit balance, so the endpoint works once that account has credits.
