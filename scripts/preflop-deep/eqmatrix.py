"""Compute 169x169 preflop equity matrix + blocker-adjusted combo counts.
Equity[a][b] = P(class-a rep combo beats a uniform random combo of class b), ties=0.5.
Monte Carlo via eval7 (C), N=200k per unordered pair -> stderr ~0.1%."""
import eval7, itertools, json, time
import numpy as np

RANKS = 'AKQJT98765432'
CLASSES = []
for i, r1 in enumerate(RANKS):
    for j, r2 in enumerate(RANKS):
        if i == j: CLASSES.append(r1 + r2)
        elif i < j: CLASSES.append(r1 + r2 + 's')
        else: CLASSES.append(r2 + r1 + 'o')
CLASSES = sorted(set(CLASSES), key=lambda c: (RANKS.index(c[0]), RANKS.index(c[1]), c[2:]))
assert len(CLASSES) == 169
IDX = {c: k for k, c in enumerate(CLASSES)}

def rep_combo(cls):
    r1, r2 = cls[0], cls[1]
    if len(cls) == 2:  # pair
        return [eval7.Card(r1 + 'h'), eval7.Card(r2 + 'd')]
    if cls[2] == 's':
        return [eval7.Card(r1 + 'h'), eval7.Card(r2 + 'h')]
    return [eval7.Card(r1 + 'h'), eval7.Card(r2 + 'd')]

def all_combos(cls):
    suits = 'shdc'
    r1, r2 = cls[0], cls[1]
    out = []
    if len(cls) == 2:
        for a, b in itertools.combinations(suits, 2):
            out.append((r1 + a, r2 + b))
    elif cls[2] == 's':
        for a in suits: out.append((r1 + a, r2 + a))
    else:
        for a in suits:
            for b in suits:
                if a != b: out.append((r1 + a, r2 + b))
    return out

def main():
    N = 200000
    eq = np.zeros((169, 169))
    w = np.zeros((169, 169))  # combos of villain class b given hero rep of a
    reps = {c: rep_combo(c) for c in CLASSES}
    combos = {c: all_combos(c) for c in CLASSES}
    # blocker-adjusted combo counts (exact, vs hero representative)
    for a in CLASSES:
        hero_cards = {str(c) for c in reps[a]}
        for b in CLASSES:
            w[IDX[a], IDX[b]] = sum(1 for c1, c2 in combos[b] if c1 not in hero_cards and c2 not in hero_cards)
    t0 = time.time()
    done = 0
    for ia, a in enumerate(CLASSES):
        hero = reps[a]
        for ib in range(ia, 169):
            b = CLASSES[ib]
            if w[ia, ib] == 0:
                eq[ia, ib] = 0.5; eq[ib, ia] = 0.5; continue
            r = eval7.HandRange(b)
            e = eval7.py_hand_vs_range_monte_carlo(hero, r, [], N)
            eq[ia, ib] = e
            eq[ib, ia] = 1.0 - e
            done += 1
        if ia % 20 == 0:
            print(f'{ia}/169 rows, {done} pairs, {time.time()-t0:.0f}s', flush=True)
    np.save('/home/claude/nash/eq169.npy', eq)
    np.save('/home/claude/nash/w169.npy', w)
    with open('/home/claude/nash/classes.json', 'w') as f:
        json.dump(CLASSES, f)
    # sanity anchors
    def E(x, y): return eq[IDX[x], IDX[y]]
    print('AA vs KK', round(E('AA','KK'),4), '(true ~0.8236)')
    print('AKs vs QQ', round(E('AKs','QQ'),4), '(true ~0.4605)')
    print('72o vs AA', round(E('72o','AA'),4), '(true ~0.1160)')
    print('A5s vs KQo', round(E('A5s','KQo'),4), '(true ~0.5745)')
    print('total time', round(time.time()-t0,1), 's')

if __name__ == '__main__':
    main()
