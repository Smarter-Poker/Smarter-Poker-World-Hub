# Handoff — Antigravity: regenerate the 76 table bust avatars at 2x

**Raised by:** Cowork, 2026-08-20, closing out the seat-avatar work.
**Why Antigravity:** Antigravity generated this art originally. Regenerating it
is image generation, not code, and it is the one part of this job no amount of
CSS or build tooling can do. Everything else in this thread is already shipped.

---

## The problem, measured

`/avatars/table/*` is **125 x 170**. After the seat work landed today the hero
draws that art at roughly **119 CSS px wide**, which on a retina screen is
~238 device pixels coming out of a 125-pixel-wide source — a **1.9x upscale**.
Villains sit at ~1.4x. That is why library avatars read soft next to uploaded
photos, which come from Supabase's image transform at the size they are drawn.

Everything cheap has already been done:

| Shipped today | Effect |
|---|---|
| `ee41188fa` (WH) | lossless WebP beside every PNG — 2115 KB -> 1270 KB, pixel-identical |
| `b9b620dd8` (CA) | the rewrite now asks for `.webp` |
| `69cacaef7` (WH) | `/avatars/` had **no** cache policy at all; now 30d + 1d stale |

What is left cannot be squeezed out of encoding. It needs more pixels.

---

## What to produce

**Preferred: character-only art, no baked nameplate.**

The current assets have a gold nameplate painted into the bottom of the PNG.
The client throws it away — `SeatSlot.css` clips `inset(0 0 26.5% 0)` — because
the seat has a real name box underneath. That clip is measured, load-bearing,
and has already caused one visible bug (a gold sliver that survived a 24.5%
clip; it is 26.47% exactly, the plate starts at row 125 of 170).

The character region is therefore **exactly 125 x 125** — a clean square — and
the plate is the 125 x 45 strip below it. So:

| Deliverable | Size | Notes |
|---|---|---|
| `/avatars/table/<name>.webp` | **125 x 125** | character only, no plate |
| `/avatars/table/<name>@2x.webp` | **250 x 250** | same composition, 2x |

Both must be the *same composition* — the 2x is a higher-resolution render of
the 1x, not a re-pose, or `srcset` will visibly snap between them.

**Fallback if character-only is not practical:** deliver a faithful 2x of what
exists today — **250 x 340**, plate included, plate occupying exactly the
bottom 26.47% (rows 251-340). Do not change the ratio; the clip is a fixed
percentage and any drift puts a gold line back above every name box.

### Hard constraints — the CSS depends on all of these

1. **Transparent background.** The art floats on the felt. No matte, no card,
   no frame, no drop shadow baked in (the client adds its own).
2. **Subject bottom-anchored.** The character's lowest ink must reach the
   bottom edge of the character region. The seat sits the art *on* the name
   box by pinning that edge; art floating inside its own canvas floats on the
   table. Current assets satisfy this — keep it.
3. **Horizontally centred ink.** See the re-centring list below.
4. **One file per existing name.** Same 76 stems, so nothing else has to change.
5. **WebP, lossless if the budget allows.** For reference: at 1x, lossless is
   40% smaller than PNG; lossy q95 is 70% smaller but moves 0.6% of pixels by
   more than 16 levels, all of it on high-contrast edges (jerseys, helmets,
   manes). At 2x, downscaled on screen, q90-95 is a reasonable trade — judge it
   against a budget of **~350 KB total for the 2x set**, which keeps a nine-seat
   retina table under today's PNG weight.

### Also worth fixing while regenerating: 11 off-centre assets

The seat element now centres to 0.0px at every breakpoint — verified. What is
left is the *ink* inside the canvas. Measured across all 76 (character region
only, alpha > 60): median bias is -0.4%, so there is no systematic direction;
these 11 are individually off by more than 4% of width:

```
free_musician        -8.4%      free_pirate          -4.4%
free_business        -7.2%      free_wizard          -4.4%
free_fox             -5.6%      vip_football         -4.4%
vip_artist           -5.6%      vip_mummy            -4.4%
vip_secret_agent     -4.8%      free_rabbit          +4.4%
                                vip_business_cat     +6.8%
```

(negative = ink sits left of centre). `free_business` is the one in most of the
screenshots this week — at hero size its art reads ~8px left of its name box
purely because of this. No CSS can correct it; only the art can.

`SAMPLE_viking.png` is 78 x 125 and has no `free/`/`vip/` source. It looks like
a leftover — confirm before regenerating, or drop it.

---

## When the art lands, the code side is small

1. Drop the two `@2x` lines into `SeatSlot.tsx`:
   ```tsx
   srcSet={`${avatarUrl} 1x, ${avatarUrl.replace(/\.webp$/, '@2x.webp')} 2x`}
   ```
2. **If** character-only art was delivered, delete the clip in `SeatSlot.css`:
   ```css
   .seat__avatar--bust .seat__avatar-img[src*='/avatars/table/'] {
     clip-path: inset(0 0 26.5% 0);
     --sp-bust-clip: 26.5%;
   }
   ```
   The transform above it already reads `--sp-bust-clip: 0%` by default and
   needs no other change — that was the point of publishing the clip as a
   token. Removing this rule retires the whole class of "gold sliver" bug.
3. Ship the assets to World Hub **first**, confirm HTTP 200, *then* ship the
   Club Arena change. The two repos deploy on independent pipelines; doing it
   in one step opens a window where the client asks for a file that has not
   deployed and every seat falls back to a monogram. Both halves of today's
   WebP change were sequenced exactly this way.

## Do not

- Do not change the aspect ratio, the bottom anchoring, or the plate fraction
  without changing `SeatSlot.css` in the same deploy.
- Do not delete the PNGs yet. They are the rollback for today's WebP flip.
- Do not add a `_comment` key to a `vercel.json` headers entry — Vercel's
  schema rejects unknown properties and the deployment fails. (Caught before
  it shipped today.)

## Verifying it worked

```bash
# every asset present and served
for f in $(ls public/avatars/table/*@2x.webp | xargs -n1 basename); do
  curl -s -o /dev/null -w "%{http_code} $f\n" "https://smarter.poker/avatars/table/$f"
done | grep -v '^200' || echo "all 200"

# 2x is a faithful scale of 1x, not a re-pose
python3 - <<'PY'
from PIL import Image; import numpy as np, glob
for f in sorted(glob.glob('public/avatars/table/*@2x.webp'))[:10]:
    one = Image.open(f.replace('@2x','')).convert('RGBA')
    two = Image.open(f).convert('RGBA').resize(one.size, Image.LANCZOS)
    bg  = Image.new('RGBA', one.size, (40,44,60,255))
    a = np.asarray(Image.alpha_composite(bg,one).convert('RGB'), dtype=np.int16)
    b = np.asarray(Image.alpha_composite(bg,two).convert('RGB'), dtype=np.int16)
    print(f.split('/')[-1], 'mean delta', round(float(np.abs(a-b).mean()),1))
PY
```
Mean delta should be small (single digits). A large number means the 2x is a
different render, not a higher-resolution one, and `srcset` will pop.
