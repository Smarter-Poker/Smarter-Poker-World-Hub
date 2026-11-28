# 2026-11-28 Club Commander player pages: every user-facing string in Title Case

Found checking `/hub/commander/notifications` live: the empty state read "No notifications yet". A sweep of `pages/hub/commander` found about 130 user-facing strings in sentence case: toasts ("Failed to start message"), empty states, inline errors, hints, dialog eyebrows and messages, placeholders and accessible names ("Close RSVP dialog").

- All of them now use the house Title Case (every word capitalised, as in "Back To Dashboard"); acronyms such as RSVP and QR are kept.
- Not UI and left unchanged: reason strings sent to the API (`p_reason`, `reason`), the Authorization header, URLs, console logging and comments.
- `__tests__/hub-commander-smarterdesign.law.test.mjs` gains a Title Case law over these pages, with the same exclusions.
- `__tests__/poker-near-me-casino-realism.test.mjs` pins the new dialog and club-code labels.
- `docs/business-hub-guide-review.json`: refreshed hash for `pages/hub/commander/index.js` (empty-state wording only).
