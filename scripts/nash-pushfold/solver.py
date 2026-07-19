"""Jam/fold Nash equilibrium via fictitious play over the MC equity matrix.
6-max chipEV model, no antes, effective stacks S bb, single-overcall approximation
(standard for push/fold charts): first caller closes action.

Positions (6-max, first-in): UTG -> [MP, CO, BTN, SB, BB] behind, MP -> 4 behind,
CO -> 3, BTN -> 2, SB -> 1 (heads-up jam/fold vs BB). BB call-vs-SB-jam range is
the BB side of the SB solve.
"""
import json
import numpy as np

eq = np.load('/home/claude/nash/eq169.npy')          # eq[a][b] = equity of a vs b (ties=0.5)
w = np.load('/home/claude/nash/w169.npy')            # w[a][b] = combos of b given a's rep cards
CLASSES = json.load(open('/home/claude/nash/classes.json'))
IDX = {c: k for k, c in enumerate(CLASSES)}
N = 169
TOTAL_COMBOS = 1225.0  # C(50,2) available to one villain given hero's 2 cards

BLIND = {'SB': 0.5, 'BB': 1.0}
def blind(pos): return BLIND.get(pos, 0.0)

POSITIONS = {
    'UTG': ['MP', 'CO', 'BTN', 'SB', 'BB'],
    'MP':  ['CO', 'BTN', 'SB', 'BB'],
    'CO':  ['BTN', 'SB', 'BB'],
    'BTN': ['SB', 'BB'],
    'SB':  ['BB'],
}

def eq_vs_range(strat):
    """For every hero class h: (equity of h vs villain playing `strat` (0..1 per class),
    P(villain's dealt hand is in strat | h's blockers)). Vectorized."""
    weighted = w * strat[None, :]                    # [h, v] combos of v in range given h
    mass = weighted.sum(axis=1)                      # total in-range combos
    with np.errstate(invalid='ignore', divide='ignore'):
        e = (weighted * eq).sum(axis=1) / np.where(mass > 0, mass, 1)
    p_in = mass / TOTAL_COMBOS
    return np.where(mass > 0, e, 0.5), p_in

def caller_eq_vs_push_range(J):
    """equity of each caller class v vs pusher range J (v's blockers applied)."""
    # combos of pusher class u given caller v's cards: w[v][u]
    weighted = w * J[None, :]
    mass = weighted.sum(axis=1)
    with np.errstate(invalid='ignore', divide='ignore'):
        e = (weighted * eq).sum(axis=1) / np.where(mass > 0, mass, 1)
    return np.where(mass > 0, e, 0.5)

def solve(pusher_pos, S, iters=400):
    behind = POSITIONS[pusher_pos]
    k = len(behind)
    J = np.zeros(N); J[[IDX['AA'], IDX['KK'], IDX['QQ'], IDX['AKs']]] = 1.0  # seed
    C = [np.zeros(N) for _ in range(k)]
    for c in C:
        c[[IDX['AA'], IDX['KK']]] = 1.0
    J_avg, C_avg = J.copy(), [c.copy() for c in C]
    for t in range(1, iters + 1):
        # ── callers best-respond to averaged pusher range ──
        newC = []
        for i, cpos in enumerate(behind):
            e = caller_eq_vs_push_range(J_avg)
            dead = 1.5 - blind(pusher_pos) - blind(cpos)
            ev_call = e * (2 * S + dead) - S
            ev_fold = -blind(cpos)
            newC.append((ev_call > ev_fold).astype(float))
        # ── pusher best-responds to averaged caller ranges ──
        ev_push = np.zeros(N)
        p_nofold = np.ones(N)  # running P(everyone so far folded | h)
        for i, cpos in enumerate(behind):
            e_i, p_call = eq_vs_range(np.clip(C_avg[i], 0, 1))
            dead = 1.5 - blind(pusher_pos) - blind(cpos)
            ev_showdown = e_i * (2 * S + dead) - S
            ev_push += p_nofold * p_call * ev_showdown
            p_nofold = p_nofold * (1 - p_call)
        ev_push += p_nofold * (1.5 - blind(pusher_pos))
        ev_fold = -blind(pusher_pos)
        newJ = (ev_push > ev_fold).astype(float)
        # ── fictitious-play averaging ──
        a = 2.0 / (t + 2.0)
        J_avg = (1 - a) * J_avg + a * newJ
        for i in range(k):
            C_avg[i] = (1 - a) * C_avg[i] + a * newC[i]
    # final polish: quantize near-pure strategies
    J_avg = np.where(J_avg > 0.98, 1.0, np.where(J_avg < 0.02, 0.0, J_avg))
    C_avg = [np.where(c > 0.98, 1.0, np.where(c < 0.02, 0.0, c)) for c in C_avg]
    return J_avg, C_avg

def range_pct(strat):
    """percent of all 1326 combos played (combo-weighted, no blockers)."""
    combos = np.array([6 if len(c) == 2 else (4 if c.endswith('s') else 12) for c in CLASSES])
    return float((strat * combos).sum() / 1326 * 100)

def to_matrix(strat, key='push'):
    out = {}
    for i, c in enumerate(CLASSES):
        f = round(float(strat[i]), 3)
        if f > 0:
            out[c] = {key: f, 'fold': round(1 - f, 3)}
    return out

def main():
    depths = list(range(2, 21)) + [25]
    charts = []   # (position, depth, matrix, pct)
    bb_calls = {} # depth -> BB call matrix vs SB jam
    for S in depths:
        for pos in ['UTG', 'MP', 'CO', 'BTN', 'SB']:
            J, C = solve(pos, S)
            charts.append({'position': pos, 'depth': S, 'pct': round(range_pct(J), 1),
                           'matrix': to_matrix(J, 'push')})
            if pos == 'SB':
                bb = C[0]
                bb_calls[S] = {'pct': round(range_pct(bb), 1), 'matrix': to_matrix(bb, 'call')}
        print(f'S={S}: ' + ', '.join(f"{c['position']} {c['pct']}%" for c in charts[-5:])
              + f", BB call {bb_calls[S]['pct']}%", flush=True)
    json.dump({'charts': charts, 'bb_calls': bb_calls}, open('/home/claude/nash/nash_charts.json', 'w'))
    print('saved nash_charts.json')

if __name__ == '__main__':
    main()
