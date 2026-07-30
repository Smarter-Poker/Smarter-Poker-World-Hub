#!/usr/bin/env python3
"""Build table-reference.html to match .agent/design/training-table-template.png exactly.

All geometry is expressed in TEMPLATE PIXELS (source image is 873 x 1224).
CSS converts them with --u = one template pixel, so the whole screen scales
proportionally and matches the reference at any size.
"""
import json
import os
import sys

# Two source modes for the portrait cut-outs.
#
#   default (--inline)  : base64 data URLs read from portraits_webp.json, produced
#                         by cutout.py. Self-contained -- one file you can open
#                         anywhere -- but ~298 KB, which is over the push ceiling.
#   --assets            : plain <img src="/avatars/portrait/{art}.webp"> paths, so
#                         the HTML drops to ~15 KB and is committable as text. The
#                         .webp binaries are generated locally by cutout.py; they
#                         are NOT in this file.
ARTS = ['wolf', 'spartan', 'ninja', 'pharaoh', 'wizard', 'pirate',
        'viking', 'cowboy', 'fox']
HERE = os.path.dirname(os.path.abspath(__file__))
# scripts/table-reference/ -> repo root is two levels up. Overridable so the
# cloud sandbox (where this file does not sit inside the repo) can still run it.
ROOT = os.environ.get('REPO_ROOT') or os.path.abspath(os.path.join(HERE, '..', '..'))

ASSET_MODE = '--assets' in sys.argv
ASSET_BASE = os.environ.get('PORTRAIT_BASE', '/avatars/portrait')
JSON_PATH = os.environ.get('PORTRAIT_JSON', os.path.join(HERE, 'portraits_webp.json'))

if ASSET_MODE:
    AV = {a: f'{ASSET_BASE}/{a}.webp' for a in ARTS}
    _default_out = os.path.join(ROOT, 'public/hub/training/table-reference.html')
else:
    AV = json.load(open(JSON_PATH))
    _default_out = os.path.join(HERE, 'table-reference.html')

OUT = os.environ.get('TABLE_OUT', _default_out)

# seat: (id, name, bb, portrait, plate-centre-x, plate-centre-y, portrait-h, overlap, x-nudge)
# plate centres measured from training-table-template.png (stage coords = full y - 152)
# overlap = template px the artwork extends BELOW the plate's bottom edge
# x-nudge  = template px to shift the artwork horizontally relative to the plate.
#            Needed because these cut-outs are bbox-cropped to the silhouette, so a
#            shield / shoulder / staff pulls the subject's head off the plate centre;
#            the template's source art is framed on the head instead. Values come
#            from the red/cyan alignment overlay, per avatar.
SEATS = [
    # ph / po / ax come from fitart.py: masked normalized cross-correlation of each
    # cut-out (its own alpha is the mask) against the template. Seven of eight
    # villains fit at corr 0.80-0.98 and agree tightly -- ph 122-133, po -33..-44,
    # ax -11..+4 -- so the template's art is a small bust that tucks BEHIND the
    # plate, not a large portrait hanging below it. The previous ph 160-190 / po +21
    # was wrong on both counts.
    ('v4', 'Villain 4', 41, 'wolf',    317, 149, 126, -34,  -4),   # corr 0.873
    ('v5', 'Villain 5', 38, 'spartan', 562, 149, 131, -34,  -6),   # corr 0.888
    ('v3', 'Villain 3', 55, 'ninja',   203, 345, 127, -37,   1),   # corr 0.796
    ('v6', 'Villain 6', 62, 'pharaoh', 677, 345, 122, -44,   4),   # corr 0.978
    ('v2', 'Villain 2', 28, 'wizard',  203, 564, 132, -37, -11),   # corr 0.816
    ('v7', 'Villain 7', 29, 'pirate',  677, 564, 125, -42,  -2),   # corr 0.950
    # viking would not fit (corr 0.38 constrained, 0.27 unconstrained): the
    # template's own viking asset still carries a white patch of un-removed
    # background under the beard that my cut-out correctly deletes, so the masked
    # pixels disagree. Consensus of the seven good fits used instead.
    ('v1', 'Villain 1', 32, 'viking',  223, 794, 130, -36,   0),   # consensus
    ('v8', 'Villain 8', 51, 'cowboy',  658, 790, 133, -33,  -8),   # corr 0.798
]

def seat_html(sid, name, bb, art, cx, cy, ph, po, ax):
    return f'''  <div class="seat" style="--cx:{cx};--cy:{cy};--ph:{ph};--po:{po};--ax:{ax}">
    <img class="portrait" src="{AV[art]}" alt="{name}">
    <div class="plate"><span class="pname">{name}</span><span class="pbb">{bb} BB</span></div>
  </div>'''

def card(rank, suit, cls):
    return f'''<div class="card {cls}"><span class="c-corner">{rank}<i>{suit}</i></span>'''\
           f'''<span class="c-rank">{rank}</span><span class="c-suit">{suit}</span></div>'''

HTML = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>GTO Trainer - Table Reference</title>
<style>
/* ===== scale unit: 1 template pixel. Source template is 873 x 1224. ===== */
:root{{
  --u: min(calc(100vw / 873), calc(100dvh / 1224), 1.6px);
  --gold:      #e8b53c;
  --gold-lit:  #ffd94a;
  --gold-dim:  #b8862a;
  --cyan:      #35c8f0;
  --cyan-dim:  #1c6c86;
  --blue-txt:  #6ea8ff;
  --felt-hi:   #34302d;
  --felt-lo:   #171412;
  --rail:      #100f0d;
  --plate-bg:  #171614;
  --btn-a:     #4f63e2;
  --btn-b:     #3241b4;
  font-family: "Inter", -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
}}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{background:#000;height:100%;overflow:hidden}}
body{{display:flex;align-items:center;justify-content:center}}

.app{{
  position:relative;
  width:calc(873 * var(--u));
  height:calc(1224 * var(--u));
  background:#000;
  overflow:hidden;
  -webkit-font-smoothing:antialiased;
}}

/* ============================ HEADER ============================ */
.hdr{{
  position:absolute;left:0;top:0;width:100%;height:calc(56 * var(--u));
  display:flex;align-items:center;gap:calc(10 * var(--u));
  padding:0 calc(12 * var(--u));
  border-bottom:1px solid #14181f;
}}
.back{{
  display:flex;align-items:center;gap:calc(6 * var(--u));
  /* 33 tall / 152 wide, measured: template back button spans (13,11)-(164,43),
     mine rendered 137 x 28. Everything in this header was uniformly ~8-18% small. */
  height:calc(33 * var(--u));padding:0 calc(13 * var(--u));
  border:calc(1.5 * var(--u)) solid #2f4a6b;border-radius:calc(9 * var(--u));
  background:linear-gradient(180deg,#141b2b,#0d1220);
  color:var(--blue-txt);font-size:calc(13.5 * var(--u));font-weight:800;
  white-space:nowrap;
}}
.htitle{{
  /* padding-left 16: the title is flex-centred between the back button and the
     chip cluster, which are not symmetric, so it landed at x-centre 398 against
     the template's 406. */
  flex:1;text-align:center;padding-left:calc(16 * var(--u));color:var(--cyan);
  /* 16.5/900: template "ICM FUNDAMENTALS" measures 195 x 13 px of cyan, mine
     was 180 x 11 with half the ink (n 719 vs 1370). */
  font-size:calc(16.5 * var(--u));font-weight:900;
  letter-spacing:calc(1.7 * var(--u));text-transform:uppercase;
  text-shadow:0 0 calc(1.2 * var(--u)) rgba(53,200,240,1),
              0 0 calc(4 * var(--u)) rgba(53,200,240,.7);
}}
.chip{{
  display:flex;align-items:center;gap:calc(6 * var(--u));
  height:calc(32 * var(--u));padding:0 calc(13 * var(--u));
  border-radius:calc(16 * var(--u));background:#0b0d12;
  font-size:calc(13.5 * var(--u));font-weight:800;white-space:nowrap;
}}
.chip.xp{{border:1px solid var(--gold-dim);color:var(--gold-lit)}}
.chip.gem{{border:1px solid #2f5f86;color:#eaf4ff}}
.chip i{{font-style:normal;font-size:calc(12 * var(--u))}}
.chip.gem i{{color:#63c9ff}}
.me img{{width:118%;height:118%;object-fit:cover;object-position:50% 12%}}
.me{{
  width:calc(34 * var(--u));height:calc(34 * var(--u));border-radius:50%;
  border:calc(1.5 * var(--u)) solid var(--cyan);
  background:#12212c;overflow:hidden;flex:none;
}}

/* ========================= QUESTION BANNER ========================= */
.banner{{
  /* box (16,59)-(863,149) = 848 x 91 measured off the template; mine was
     837 x 90 at (18,60) with a stroke carrying half the ink (n 2672 vs 5447),
     so the border is 2.5px, not 1.5. */
  position:absolute;left:calc(16 * var(--u));top:calc(59 * var(--u));
  width:calc(848 * var(--u));height:calc(91 * var(--u));
  display:flex;align-items:center;justify-content:center;text-align:center;
  padding:0 calc(22 * var(--u));
  border:calc(2.5 * var(--u)) solid #3a9ab8;border-radius:calc(12 * var(--u));
  background:#000;
  box-shadow:0 0 calc(14 * var(--u)) rgba(53,200,240,.18),
             inset 0 0 calc(22 * var(--u)) rgba(53,200,240,.04);
  /* 22/1.55: the template's first banner line runs x 51..828 (778px) over a
     52px two-line ink height; at 20.5/1.45 mine ran 726 x 45. 726 * 22/20.5 = 779. */
  color:#fff;font-size:calc(22 * var(--u));font-weight:800;line-height:1.55;
  /* the bbox matched at 22/800 (779 x 51 against 778 x 52) but carried only
     5357 white px against the template's 8229. A tight white shadow adds the
     missing ink without moving a single glyph edge. */
  text-shadow:0 0 calc(1.1 * var(--u)) rgba(255,255,255,1),
              0 0 calc(3.2 * var(--u)) rgba(255,255,255,.85);
}}

/* ============================= STAGE ============================= */
.stage{{
  position:absolute;left:0;top:calc(152 * var(--u));
  width:calc(873 * var(--u));height:calc(940 * var(--u));
}}
/* every stage child is placed by template-pixel centre coords --cx / --cy */
.at{{position:absolute;left:calc(var(--cx) * var(--u));top:calc(var(--cy) * var(--u));
    transform:translate(-50%,-50%)}}

/* ---- concentric rails: outer ring, mid ring, felt ----
   Centred on x=441, NOT on left:50% (= 436.5 of an 873px stage). Gold-run
   scanlines put the template's felt at 263..619 (centre 441.0), its mid ring at
   232..648 (centre 440.0) and its outer ring at 182..699 (centre 440.5), while
   left:50% put all three at 436.5 -- a uniform 4.5px leftward drift that the
   seat plates, which are placed by explicit --cx, did not share. */
.ring{{
  position:absolute;left:calc(441 * var(--u));top:calc(504 * var(--u));
  transform:translate(-50%,-50%);
  border-radius:9999px;pointer-events:none;
}}
.ring-a{{
  width:calc(518 * var(--u));height:calc(838 * var(--u));
  border:calc(2.5 * var(--u)) solid var(--gold);
  box-shadow:0 0 calc(20 * var(--u)) rgba(232,181,60,.45);
}}
.ring-b{{
  /* stays at 3. The gold-run scanlines say the template's mid ring is 8px across
     on the flanks against 3px here, so 4 looked obviously right -- but thickening
     it (with felt 3->4 and ring-a 2.5->3) pushed the overall mean diff 13.34 ->
     13.58 and the rows-306 band 14.6 -> 15.7. Widening a stroke that is a hair off
     the template's ellipse doubles the mismatch wherever the curve slants, so the
     extra width costs more than it pays. Only the glow alphas were kept. */
  width:calc(416 * var(--u));height:calc(762 * var(--u));
  border:calc(3 * var(--u)) solid var(--gold);
  box-shadow:0 0 calc(16 * var(--u)) rgba(232,181,60,.48);
}}
.felt{{
  position:absolute;left:calc(441 * var(--u));top:calc(504 * var(--u));
  transform:translate(-50%,-50%);
  width:calc(358 * var(--u));height:calc(722 * var(--u));
  border-radius:9999px;
  border:calc(3 * var(--u)) solid #d9a233;
  background:
    radial-gradient(ellipse 68% 42% at 50% 46%, var(--felt-hi) 0%, #24211e 52%, var(--felt-lo) 100%);
  box-shadow:inset 0 0 calc(46 * var(--u)) rgba(0,0,0,.9),
             inset 0 calc(6 * var(--u)) calc(18 * var(--u)) rgba(255,255,255,.03);
  overflow:hidden;
}}
/* felt micro-texture */
.felt::after{{
  content:"";position:absolute;inset:0;border-radius:inherit;opacity:.16;
  background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.020) 0 1px,transparent 1px 3px),
                   repeating-linear-gradient(-45deg,rgba(0,0,0,.30) 0 1px,transparent 1px 3px);
}}
.rail-band{{
  position:absolute;left:calc(441 * var(--u));top:calc(504 * var(--u));
  transform:translate(-50%,-50%);
  width:calc(480 * var(--u));height:calc(810 * var(--u));
  border-radius:9999px;background:var(--rail);
  box-shadow:inset 0 0 calc(30 * var(--u)) rgba(0,0,0,.9);
}}

/* ---- felt centre furniture ---- */
.pot{{
  --cx:440;--cy:355;
  display:flex;align-items:center;gap:calc(8 * var(--u));
  height:calc(30 * var(--u));padding:0 calc(13 * var(--u)) 0 calc(7 * var(--u));
  border-radius:9999px;background:#0d0d0d;border:1px solid #2a2a2a;
  box-shadow:0 calc(3 * var(--u)) calc(10 * var(--u)) rgba(0,0,0,.7);
  z-index:4;
}}
.pot .disc{{width:calc(18 * var(--u));height:calc(18 * var(--u));border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#f0f0f0,#8d8d8d 60%,#4c4c4c)}}
.pot .lbl{{color:#c9c9c9;font-size:calc(10 * var(--u));font-weight:800;letter-spacing:calc(1 * var(--u))}}
.pot .val{{color:var(--gold-lit);font-size:calc(14 * var(--u));font-weight:900}}

.brand{{--cx:440;--cy:568;text-align:center;z-index:2;width:calc(340 * var(--u))}}
.brand .b1{{color:#f2f2f2;font-size:calc(21 * var(--u));font-weight:800}}
.brand .b2{{color:var(--gold-lit);font-size:calc(13 * var(--u));font-weight:800;margin-top:calc(4 * var(--u))}}

.dbtn{{
  --cx:440;--cy:744;
  width:calc(23 * var(--u));height:calc(23 * var(--u));border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#fff,#d6d6d6);
  color:#111;font-size:calc(11 * var(--u));font-weight:900;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 calc(2 * var(--u)) calc(6 * var(--u)) rgba(0,0,0,.8);z-index:4;
}}

/* ------------------------------ SEATS ------------------------------ */
.seat{{
  /* the SEAT BOX IS THE NAME PLATE — so --cx/--cy is the plate centre, exactly
     as measured off the template. The artwork is absolutely positioned behind
     it and does not shift the plate. */
  position:absolute;left:calc(var(--cx) * var(--u));top:calc(var(--cy) * var(--u));
  transform:translate(-50%,-50%);
  z-index:5;
}}
.seat .portrait{{
  position:absolute;left:50%;bottom:calc(-1 * var(--po,21) * var(--u));
  transform:translate(-50%,0) translateX(calc(var(--ax,0) * var(--u)));
  width:auto;height:calc(var(--ph,130) * var(--u));
  filter:drop-shadow(0 calc(3 * var(--u)) calc(9 * var(--u)) rgba(0,0,0,.85));
  pointer-events:none;z-index:-1;
}}
.plate{{
  position:relative;
  /* 80, not 70: the narrowest plate in the template ("Villain 2 / 28 BB") is
     81px wide including its border, and at min-width 70 mine rendered 71. The
     wider plates are text-driven and unaffected. */
  min-width:calc(80 * var(--u));
  padding:calc(3 * var(--u)) calc(9 * var(--u)) calc(4 * var(--u));
  border:calc(2 * var(--u)) solid var(--gold);border-radius:calc(7 * var(--u));
  background:var(--plate-bg);
  display:flex;flex-direction:column;align-items:center;line-height:1.32;
  box-shadow:0 calc(2 * var(--u)) calc(7 * var(--u)) rgba(0,0,0,.85);
}}
.pname{{color:#fff;font-size:calc(13 * var(--u));font-weight:800;white-space:nowrap}}
.pbb{{color:var(--gold-lit);font-size:calc(15 * var(--u));font-weight:900;white-space:nowrap}}

/* hero seat: olive plate, live glow, head-only artwork sitting on top of it */
.seat.hero{{z-index:7}}
.seat.hero .plate{{
  min-width:calc(76 * var(--u));
  /* 6px taller than a villain plate: template hero plate spans y 1022..1083
     (62px) against mine at 1022..1077 (56px), tops already flush. The extra 6
     is split evenly here and given back with --cy 903 so the top stays at 1022. */
  padding:calc(6 * var(--u)) calc(11 * var(--u)) calc(7 * var(--u));
  border-color:var(--gold-lit);border-width:calc(2.5 * var(--u));
  background:linear-gradient(180deg,#75731f 0%,#565415 55%,#3a390e 100%);
  /* the glow is not decoration -- it is a measurable share of the frame. Mean
     luminance in an annulus around the plate centre: template 93.7 / 84.9 / 69.1
     at r 45-60 / 60-80 / 80-100 against mine at 61.6 / 61.7 / 57.1. Near-field
     was roughly half strength, so each layer gains a spread term. */
  box-shadow:0 0 calc(22 * var(--u)) calc(4 * var(--u)) rgba(255,217,74,.50),
             0 0 calc(50 * var(--u)) calc(18 * var(--u)) rgba(255,217,74,.48),
             0 0 calc(105 * var(--u)) calc(26 * var(--u)) rgba(255,217,74,.18),
             0 calc(2 * var(--u)) calc(8 * var(--u)) rgba(0,0,0,.8);
}}
.seat.hero .pname{{font-size:calc(14 * var(--u))}}
.seat.hero .pbb{{font-size:calc(16 * var(--u))}}

/* ------------------- HOLE CARDS: BESIDE the hero box ------------------- */
.holecards{{
  position:absolute;
  /* left edge butts against the right edge of the hero plate, vertically level with it */
  left:calc(var(--cx) * var(--u));top:calc(var(--cy) * var(--u));
  transform:translate(-50%,-50%);
  display:flex;align-items:center;z-index:8;
}}
.card{{
  position:relative;
  /* 51 x 79, and the pair spans 100px only because they are narrower AND less
     overlapped. Two metrics have to agree at once: the white-pixel COUNT (template
     5611 at the >170 white threshold, 5720 at cardmeas.py's stricter >190 -- only
     compare numbers from one script's run) fixes the union area, and the bbox
     width (template 100) fixes the spread.
     At 55x81 the count was 6594; at 53x79 with -20 overlap the count landed (5511)
     but the spread collapsed to 95. Narrower cards + a smaller overlap satisfy both. */
  width:calc(51 * var(--u));height:calc(79 * var(--u));
  border-radius:calc(5.5 * var(--u));
  background:linear-gradient(160deg,#fff 0%,#f2f2f2 100%);
  box-shadow:0 calc(4 * var(--u)) calc(12 * var(--u)) rgba(0,0,0,.85);
  color:#d81f26;flex:none;
}}
.card.c-black{{color:#111}}
.card + .card{{margin-left:calc(-14 * var(--u))}}
/* +-8/9deg, measured off the template's card edges (A's top edge falls
   8.4deg to the left, K's rises 9.1deg to the right). At -6/+4 the pair
   read as almost square-on. */
.card.tilt-l{{transform:rotate(-10deg)}}
.card.tilt-r{{transform:rotate(11deg)}}
.c-corner{{
  position:absolute;left:calc(4.5 * var(--u));top:calc(2.5 * var(--u));
  font-size:calc(11.5 * var(--u));font-weight:900;line-height:1;
  display:flex;flex-direction:column;align-items:center;
}}
.c-corner i{{font-style:normal;font-size:calc(10 * var(--u));margin-top:calc(1 * var(--u))}}
.c-rank{{
  position:absolute;left:0;right:0;top:calc(14 * var(--u));text-align:center;
  font-size:calc(34 * var(--u));font-weight:900;line-height:1;
}}
.c-suit{{
  position:absolute;left:0;right:0;bottom:calc(4 * var(--u));text-align:center;
  font-size:calc(27 * var(--u));line-height:1;
}}

/* villain 8 mucked / face-down cards */
.facedown{{
  position:absolute;left:calc(var(--cx) * var(--u));top:calc(var(--cy) * var(--u));
  transform:translate(-50%,-50%);display:flex;z-index:6;
}}
.facedown span{{
  width:calc(32 * var(--u));height:calc(52 * var(--u));border-radius:calc(4 * var(--u));
  background:linear-gradient(150deg,#26251c,#131310);
  border:calc(1.5 * var(--u)) solid #6d5a1e;
  box-shadow:0 calc(3 * var(--u)) calc(8 * var(--u)) rgba(0,0,0,.85);
}}
.facedown span:first-child{{transform:rotate(-6deg)}}
.facedown span + span{{margin-left:calc(-13 * var(--u))}}

/* --------------------------- HUD corners --------------------------- */
.timer{{
  --cx:113;--cy:849;
  width:calc(83 * var(--u));height:calc(78 * var(--u));
  border:calc(1.5 * var(--u)) solid #6d2320;border-radius:calc(10 * var(--u));
  background:#161313;
  display:flex;align-items:center;justify-content:center;
  color:#ff3b30;font-size:calc(40 * var(--u));font-weight:800;
  font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  box-shadow:0 0 calc(10 * var(--u)) rgba(255,59,48,.16);
  z-index:6;
}}
.qcount{{
  --cx:744;--cy:869;
  width:calc(168 * var(--u));height:calc(42 * var(--u));
  display:flex;align-items:center;justify-content:center;
  border:calc(1.5 * var(--u)) solid #2b5f86;border-radius:calc(10 * var(--u));
  background:#080d15;color:#63b8ff;
  font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  font-size:calc(13 * var(--u));font-weight:700;letter-spacing:calc(.4 * var(--u));
  z-index:6;
}}

/* =========================== ACTION BAR =========================== */
.actions{{
  /* measured: template row 1 occupies y 1100..1148, row 2 y 1157..1205 (49 tall,
     9 apart); columns run 17..436 and 444..862 (419 wide, 8 apart). Mine was
     46 tall / 12 apart / 405-432 wide and stopped 8px short of the right edge. */
  position:absolute;left:calc(17 * var(--u));top:calc(1100 * var(--u));
  width:calc(846 * var(--u));
  display:grid;grid-template-columns:1fr 1fr;
  gap:calc(9 * var(--u)) calc(8 * var(--u));
}}
.act{{
  height:calc(49 * var(--u));border:none;border-radius:calc(10 * var(--u));
  background:linear-gradient(150deg,var(--btn-a),var(--btn-b));
  color:#fff;font-size:calc(16 * var(--u));font-weight:800;
  font-family:inherit;cursor:pointer;
  box-shadow:0 calc(3 * var(--u)) calc(10 * var(--u)) rgba(0,0,0,.6),
             inset 0 1px 0 rgba(255,255,255,.22);
}}
.act:active{{transform:translateY(calc(1 * var(--u)));filter:brightness(1.1)}}
</style>
</head>
<body>
<div class="app">

  <div class="hdr">
    <div class="back">&#8592; Back to Training</div>
    <div class="htitle">ICM Fundamentals</div>
    <div class="chip xp"><i>&#9889;</i>1,250 XP</div>
    <div class="chip gem"><i>&#9670;</i>500</div>
    <div class="me"><img src="{AV['fox']}" alt="You"></div>
  </div>

  <div class="banner">You Are On The Button (Last To Act). The Player To Your Right Bets 2.5 Big Blinds. What Is Your Best Move?</div>

  <div class="stage">
    <div class="ring ring-a"></div>
    <div class="rail-band"></div>
    <div class="ring ring-b"></div>
    <div class="felt"></div>

    <div class="at pot"><span class="disc"></span><span class="lbl">POT</span><span class="val">0</span></div>
    <div class="at brand"><div class="b1">ICM Fundamentals</div><div class="b2">Smarter.Poker</div></div>
    <div class="at dbtn">D</div>

{chr(10).join(seat_html(*s) for s in SEATS)}

    <div class="facedown" style="--cx:722;--cy:794"><span></span><span></span></div>

    <div class="seat hero" style="--cx:440;--cy:903;--ph:102;--po:-48;--ax:-4">
      <img class="portrait" src="{AV['fox']}" alt="Hero">
      <div class="plate"><span class="pname">Hero</span><span class="pbb">45 BB</span></div>
    </div>

    <div class="holecards" style="--cx:562;--cy:868">
      {card('A','&#9829;','tilt-l')}
      {card('K','&#9829;','tilt-r')}
    </div>

    <div class="at timer">15</div>
    <div class="at qcount">Question 1 of 20</div>
  </div>

  <div class="actions">
    <button class="act">Fold</button>
    <button class="act">Call</button>
    <button class="act">Raise to 8bb</button>
    <button class="act">All-In</button>
  </div>

</div>
</body>
</html>
'''

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w").write(HTML)
print('wrote', OUT, len(HTML) // 1024, 'KB',
      '(asset paths)' if ASSET_MODE else '(inlined data URLs)')
