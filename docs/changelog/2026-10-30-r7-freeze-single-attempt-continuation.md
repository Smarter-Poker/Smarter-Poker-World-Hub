# Preserve a committed R7 model freeze across an interrupted response

**Owner:** `scripts/horse-solver-v31/continue_r7_freeze_once.py` (new explicit controller).
**What existed:** the approved producer's generic gateway client permits three
transport attempts. One R7 freeze committed while its response was unavailable;
two further requests with the same body and different nonces overlapped the
original SQL transaction and failed the unchanged one-second lock guard.

**What changed:** an explicit finite continuation validates the original failed
claim/result, final full Linux-parity index, original manifest and all nine
unchanged producer files. A Root-authenticated fresh SQL snapshot must contain
exactly the original first context with all four expected checksum bindings;
the complete independent 107-context index map is compared before any claim.
Only the remaining106 contexts are submitted, each through the same maintained
gateway and SQL freeze function, using the existing `attempts=1` client option.
Exclusive durable claim/start/terminal records preserve unknown outcomes.
Transport failure or an unexpected receipt stops immediately; no next context
or implicit retry is allowed. Exception bodies, URLs and credentials are never
written to evidence. Complete acknowledgements still require independent SQL107
readback and the maintained authenticated freeze-authority gate before M2.

**Why:** preserve one genuine committed freeze and prevent overlapping replay,
without changing scientific provenance, approved producer bytes, models, seed,
SQL timeouts, lock guards, numerical checks or certification thresholds.

**Verification:** focused regression coverage is in the existing invoked
`test_pipeline.py` suite: exact existing receipt admission, remaining106 single
calls, wrong snapshots/index pins, and immediate stop on ambiguous transport.
This source change does not itself freeze data, open the seed, certify, promote
or load Horses. Protected checks and the explicit live operation remain separate.
