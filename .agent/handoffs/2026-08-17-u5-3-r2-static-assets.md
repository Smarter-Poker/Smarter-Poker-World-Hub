# HANDOFF — Phase U5.3: move Club Arena static media to Cloudflare R2

**Status:** Code side COMPLETE (CA commit 45f2228ce). Blocked ONLY on
Cloudflare credentials — creating the bucket/token is a human/credentialed
step (WH RULE 0 exception; RULE 12 forbids agents creating new infra).

## What is already done
- `club-arena/src/utils/mediaBase.ts` — MEDIA_BASE indirection. With
  `VITE_MEDIA_BASE` unset, every media URL is byte-identical to before.
- All 22 large-media call sites (cards/, images/, club-logos/, videos/)
  resolve through it. `sw-bus.js` + code-split chunks stay same-origin.

## Human step (Dan, ~5 min in the Cloudflare dashboard)
1. Cloudflare → R2 → Create bucket: `smarter-poker-static` (location: ENAM).
2. Bucket → Settings → Public access → Connect custom domain:
   `static.smarter.poker` (DNS is already on Cloudflare if smarter.poker is;
   otherwise use the r2.dev public URL it gives you).
3. R2 → Manage API Tokens → Create token: "ca-static-upload",
   Object Read & Write, scoped to that bucket.
4. Put the three values in `~/Documents/club-arena/.env`:
   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...
   and the public base as R2_PUBLIC_BASE=https://static.smarter.poker

## Agent steps after credentials exist (any agent can run these)
1. Upload (aws CLI is S3-compatible with R2):
   cd ~/Documents/Smarter-Poker-World-Hub/public/hub/club-arena
   AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY \
   aws s3 sync . s3://smarter-poker-static/club-arena/ \
     --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com \
     --exclude "*" --include "cards/*" --include "images/*" \
     --include "club-logos/*" --include "videos/*" --include "game-card-icons/*"
2. Set `VITE_MEDIA_BASE=$R2_PUBLIC_BASE/club-arena/` in
   `~/Documents/club-arena/.env` AND export it inside
   `WH scripts/sync-club-arena.sh` before the vite build.
3. Deploy: `bash scripts/sync-club-arena.sh "feat(ca): U5.3 - media served from R2"`.
4. Verify: curl -sI $R2_PUBLIC_BASE/club-arena/cards/4color/spades_a.png → 200;
   load a table, Network tab shows cards from static.smarter.poker; Vercel
   deploy size drops ~60MB.
5. AFTER one clean week: delete cards/images/club-logos/videos from WH
   `public/hub/club-arena/` and shrink sync-club-arena.sh's preserved-dirs
   list accordingly (keep assets/).

Gate U5: R2 URLs return 200; bundle ≤ 5MB already enforced by
club-arena-budget.yml; deploys remain single-script.
