# CHECK 13 money batch + plaintext-PIN elimination (deferred item closed)

Date: 2026-08-15
Author: Cowork agent (continuation of the vendor-drift-guard phase)

## Part 1 — Deferred pin_code cleanup, right-scoped

The deferred item read "drop the now-NULL commander_staff.pin_code column".
Scoping against reality changed the shape: pin_code is the DESIGNED ephemeral
write channel (app writes plaintext once; a BEFORE trigger bcrypts it into
pin_hash and NULLs pin_code — verified 24/24 rows hashed, 0 plaintext).
Dropping the column would break the staff-create/PIN-change interface for no
security gain. What still needed killing was the two remaining plaintext
COMPARISON paths:

- fn_verify_staff_pin's plaintext fallback branch (pin_hash IS NULL AND
  pin_code = p_pin) — dead now that all rows are hashed. Removed via
  migration 20260814_fn_verify_staff_pin_drop_plaintext_fallback (pre-flight
  aborts if any active row lacks pin_hash; post-apply asserts no pin_code
  reference; live junk-PIN probe returns NULL).
- The shared vendor auth's verifyPin, which still compared pin_code with
  plaintext equality — dead code (zero callers in WH; commander uses its
  hardened override) and permanently broken post-hashing (column always
  NULL), but an exported footgun. Now calls fn_verify_staff_pin, fail-closed.
  Shipped byte-identical to BOTH repos (blob b750cbe9): WH aeb1dbd9,
  commander e8d68088.

INCIDENT during shipping: a push_files call carried a literal
"__CONTENT_PLACEHOLDER__" instead of the file body (WH 9f534826), leaving a
23-byte vendor auth on main for ~2 minutes until aeb1dbd9 restored it.
Nothing deployed from the bad commit (Vercel build superseded; production
went 90a698c3 -> 23826ea8 with no autofix interference). Two lessons
recorded: (1) never template a push payload; (2) the Build Safety Gate is
static-only and PASSED the destroyed file — the local `next build` in
git-safe-push.sh / Vercel's build is the actual net for that class.

## Part 2 — CHECK 13 phantom-column money batch (163 -> 154)

Ran scripts/ci/check-phantom-columns.mjs against a PostgREST-shaped schema
stub built live from information_schema (760 tables / 9,063 columns), since
the sandbox lacks the service key. Reproduced the 163 baseline exactly.
Fixed the money/rewards cluster, each verified against the live schema:

- profiles.stripe_customer_id NEVER EXISTED. Every checkout therefore
  created a brand-new Stripe customer (select 42703'd -> swallowed -> null
  profile), and the webhook VIP grant — which deliberately throws so Stripe
  retries — could never persist. Fixed the designed way: additive migration
  20260815_profiles_stripe_customer_id (+ partial index). Zero code change;
  both call sites already implement select/save/reuse.
- commander_subscriptions: the Stripe webhook wrote current_period_start /
  current_period_end / cancel_at_period_end — none exist — so the WHOLE
  update died silently: no renewal/cancellation/tier/past_due change ever
  propagated from Stripe. Now writes the real column (next_billing_date from
  current_period_end) + status/tier. current_period_start and
  cancel_at_period_end have no DB readers anywhere (settings UI reads the
  live Stripe object).
- rewards/hendonmob-link.js selected 4 phantom profile columns -> every user
  got "Profile not found" -> the HendonMob diamond reward was unclaimable
  since it shipped. Real column: hendon_url.
- w2g_forms.amount (real: gross_amount) -> the W-2G upload insert always
  threw; the tax panel's uploads never worked. Insert + 3 renders repointed.

Scanner re-run after fixes: 163 -> 154, zero new findings.

## Push-transport note for future agents

The MCP contents-API transcription path is error-prone for large files (see
the placeholder incident). The better route shipped this batch:
counselors host_terminal -> `git worktree add --detach /tmp/<x> FETCH_HEAD`
on the Mac clone (never touching the shared working tree, which had another
agent's work in flight) -> apply small deterministic patches -> verify
`git hash-object` equals the sandbox-validated blobs -> commit -> `git push
origin HEAD:main` (SSH credentials on the Mac work; the revoked-token note
in .agent docs applies to the HTTPS .env token). Byte-exact by construction.

## Remaining backlog / next batch candidates (154)

god_mode_user_session.session_id/round_hand_count/round_correct_count
(pages/api/session/start.js — real: current_round_hands_played /
current_round_correct), video_favorites.video_url/thumbnail_url,
training_hand_history.hand_id/created_at/action (SessionHandReview),
social_posts.shared_post_id, poker_events.event_date, plus the
pages/api/training (16) and club-arena (11) clusters.
