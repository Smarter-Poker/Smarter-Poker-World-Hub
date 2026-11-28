#!/usr/bin/env python3
"""Generate the #SMARTERDESIGN image-header art for every Training page.

Each page gets its own scene (the photographic right side of the header) and
its own seal (the subject in the round chrome frame on the left), cropped from
the platform's existing rendered art. No two pages share a scene, no two share
a seal, and a page's seal never comes from its own scene, so the header test in
__tests__/bankroll-mobile-upgrades.test.mjs (unique bytes per file) holds.

Run from the repository root:  python3 scripts/design/generate-training-header-art.py
"""
import glob
import os
import sys
from PIL import Image, ImageFilter

OUT = 'public/images/smarterdesign/headers'
POOLS = {
    'cr': 'public/images/training/casino-realism/{}.webp',
    'cm': 'public/images/training/coach-mode/{}.webp',
    'tm': 'public/images/trivia/modes-console-v1/{}.webp',
}


def resolve(ref):
    pool, name = ref.split(':', 1)
    if pool == 'lw':
        return sorted(glob.glob(f'public/images/trivia/intro-v1/{name}-wide-1440.*.webp'))[0]
    if pool in ('i1', 'i2', 'i3'):
        return sorted(glob.glob(f'public/images/trivia/intro-v{pool[1]}/{name}-wide-1440.*.webp'))[0]
    return POOLS[pool].format(name)


# slug -> scene source. Seals are assigned below from the unused pool.
SCENES = {
    'training-lobby': 'lw:lobby',
    'training-achievements': 'i3:achievements',
    'training-aggregate': 'i3:stats',
    'training-autopilot': 'cr:adv-018',
    'training-coach-mode': 'cm:strategy-chamber-hero',
    'training-community-leaderboard': 'lw:tournaments',
    'training-custom-rake': 'cr:cash-002',
    'training-custom-solve': 'cr:adv-001',
    'training-daily-challenge': 'lw:daily',
    'training-daily-goals': 'i2:daily',
    'training-drill-builder': 'cr:adv-012',
    'training-equity-calculator': 'lw:gto',
    'training-famous-finals': 'lw:history',
    'training-flashcards': 'cr:adv-010',
    'training-focus-timer': 'lw:time-attack',
    'training-glossary': 'lw:rules',
    'training-gto-news': 'cr:mtt-022',
    'training-gto-preloader': 'cr:adv-009',
    'training-hand-comparison': 'cr:adv-017',
    'training-hand-history-upload': 'cr:psy-017',
    'training-hand-lab': 'cr:hand-lab',
    'training-icm-simulator': 'i2:icm',
    'training-jarvis': 'cr:psy-009',
    'training-live-hud-sync': 'cr:psy-018',
    'training-mental-journal': 'cr:psy-010',
    'training-milestones': 'cr:mtt-006',
    'training-multi-table': 'cr:cash-006',
    'training-multiway-preflop': 'cr:cash-009',
    'training-my-playbook': 'cr:psy-020',
    'training-position-mastery': 'cm:preflop-position',
    'training-range-browser': 'cr:adv-020',
    'training-progress': 'lw:endless',
    'training-pvp-lobby': 'lw:pvp',
    'training-qre-explorer': 'cr:psy-007',
    'training-quick-warmup': 'cr:spins-004',
    'training-quiz-builder': 'cr:quiz-gauntlet',
    'training-rake-solutions': 'cr:cash-010',
    'training-range-builder': 'cm:three-bet-pressure',
    'training-replay-theater': 'cr:psy-008',
    'training-reports': 'cr:mtt-023',
    'training-risk-analyzer': 'cr:psy-015',
    'training-scenario-demo': 'cm:pot-odds-core',
    'training-session-dashboard': 'cr:mtt-017',
    'training-session-notes': 'cr:psy-011',
    'training-session-warmup': 'cr:spins-006',
    'training-short-deck-trainer': 'cr:cash-024',
    'training-skill-tree': 'cr:mtt-011',
    'training-spot-trainer': 'cr:cash-020',
    'training-streaks': 'lw:survival',
    'training-study-group': 'cr:study-group',
    'training-study-group-finder': 'tm:history',
    'training-study-plan': 'cr:mtt-003',
    'training-table-wizard': 'lw:cash',
    'training-tilt-guard': 'tm:survival',
    'training-tournament-prep': 'lw:mtt',
    'training-tournaments': 'tm:mtt',
    'training-training-calendar': 'cm:turn-evolution',
    'training-training-feed': 'tm:cash',
    'training-weakness-scanner': 'tm:endless',
    # Game entry pages: their own game's rendered art.
    'training-bluff-catcher': 'cr:cash-005',
    'training-ev-trainer': 'cr:adv-006',
    'training-final-table-sim': 'cr:final-table-sim',
    'training-icm-final-table': 'cr:mtt-004',
    'training-nodelocking': 'cr:adv-003',
    'training-preflop-advisor': 'cr:cash-001',
    'training-bounty-trainer': 'cr:mtt-005',
    'training-frequency-locking': 'cr:adv-005',
    'training-gto-vs-exploitative': 'cr:adv-013',
    'training-mixed-strategy-lab': 'cr:mixed-strategy-lab',
    'training-multiway-postflop': 'cr:cash-016',
    'training-player-profiles': 'cr:adv-015',
    'training-pot-geometry': 'cr:adv-011',
    'training-range-advisor': 'cr:adv-004',
    'training-spr-trainer': 'cr:mtt-024',
    'training-three-way-postflop': 'cr:cash-019',
    'training-blind-defense': 'cr:cash-003',
    'training-villain-range': 'cr:adv-008',
    # Training category pages.
    'training-category-mtt': 'cr:mtt-008',
    'training-category-cash': 'cr:cash-011',
    'training-category-spins': 'cr:spins-001',
    'training-category-psychology': 'cr:psy-003',
    'training-category-advanced': 'cr:adv-016',
    # Preflop Charts sub pages.
    'preflop-stats': 'i2:gto',
    'preflop-leaderboard': 'i2:mtt',
    'preflop-achievements': 'i2:cash',
    'preflop-tutorial': 'tm:rules',
}


def scene(src, out):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    ch = min(h, round(w / 2.16))
    top = max(0, min(h - ch, round(h * 0.46 - ch / 2)))
    im.crop((0, top, w, top + ch)).resize((1080, 500), Image.LANCZOS).save(out, quality=86, method=6)


def seal(src, out):
    """Crop the most detailed square near the middle: the hero subject."""
    im = Image.open(src).convert('RGB')
    w, h = im.size
    side = round(h * 0.56)
    small = im.convert('L').resize((w // 8, h // 8))
    edges = small.filter(ImageFilter.FIND_EDGES)
    px = edges.load()
    sw, sh = small.size
    sd = side // 8
    best, best_box = -1, None
    for y in range(0, sh - sd + 1, 2):
        for x in range(0, sw - sd + 1, 2):
            total = sum(px[i, j] for i in range(x, x + sd, 2) for j in range(y, y + sd, 2))
            cx, cy = (x + sd / 2) / sw - 0.5, (y + sd / 2) / sh - 0.45
            score = total * (1 - 1.6 * (cx * cx + cy * cy))
            if score > best:
                best, best_box = score, (x * 8, y * 8)
    x, y = best_box
    im.crop((x, y, x + side, y + side)).resize((352, 352), Image.LANCZOS).save(out, quality=90, method=6)


def main():
    scenes = {slug: resolve(ref) for slug, ref in SCENES.items()}
    if len(set(scenes.values())) != len(scenes):
        sys.exit('two pages share a scene source')
    used = set(scenes.values())
    pool = sorted(glob.glob('public/images/training/casino-realism/*.webp'))
    pool += sorted(glob.glob('public/images/training/coach-mode/*.webp'))
    pool += sorted(glob.glob('public/images/trivia/modes-console-v1/*.webp'))
    # Sources whose subject already appears as a hand-made seal elsewhere
    # (ICM scale, Preflop Charts A-K, Goals stopwatch, the Preflop scene).
    taken = {
        'public/images/trivia/modes-console-v1/icm.webp',
        'public/images/trivia/modes-console-v1/time-attack.webp',
        'public/images/trivia/modes-console-v1/pro.webp',
        'public/images/training/casino-realism/bluff-catcher.webp',
        'public/images/training/casino-realism/tournament-prep.webp',
    }
    pool = [p for p in pool if p not in taken]
    fresh = [p for p in pool if p not in used]
    reused = [p for p in pool if p in used]
    seals = {}
    order = fresh + reused
    i = 0
    for slug, src in scenes.items():
        while order[i % len(order)] == src:
            i += 1
        seals[slug] = order[i % len(order)]
        i += 1
    # Seals are purpose-made emblems now (scripts/design/render-training-seals.mjs);
    # this script only writes the scenes. Pass --crop-seals to regenerate the
    # retired scene-crop seals for comparison.
    crop_seals = '--crop-seals' in sys.argv
    for slug in scenes:
        scene(scenes[slug], os.path.join(OUT, f'{slug}-scene.webp'))
        if crop_seals:
            seal(seals[slug], os.path.join(OUT, f'{slug}-seal.webp'))
    print(f'{len(scenes)} headers written ({len(fresh)} unused seal sources available)')


if __name__ == '__main__':
    main()
