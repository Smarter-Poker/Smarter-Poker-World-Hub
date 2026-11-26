"""FLOP-4 A2 strategy-storage rule (pure Python, no Pio). Rule text: STORAGE-RULE.md (this file is its implementation; the constants below are frozen).
PioSOLVER 3.8.0 sometimes stores a strategy row that differs from the row written (three recorded cases: one hand, one action zeroed, row renormalised).
The driver writes, reads back, retries once, and then calls judge(): a mismatch is ADOPTED (the STORED strategy is what the arm scores) only when a
worst-case bound on its effect on any root value (EV or best-response value of either player, hence L and X) fits the limit; otherwise it is refused.
bound for one hand = share x tv x swing / pot x 100 (% of root pot)
  share = the hand's fraction of the actor's root matchup mass (its probability of being the hand the actor holds), reach to the node taken as 1;
  tv    = half the sum over actions of |stored - written| (the probability mass the solver moved for this hand at this node);
  swing = pot + 2 x effective stack (no payoff of either player can change by more than this when one decision changes).
"""
EXACT_TOL = 1e-6          # unchanged f1_readback tolerance: at or below this a write is exact
LIMIT_CAP_PCT = 0.1       # % of root pot; the limit is min(100 x solve_accuracy, this): the storage effect stays within the solve tolerance
MAX_HANDS = 3             # more mismatched hands at one write than this is not the recorded phenomenon: never adopted
HAND_TV_CAP = 0.05        # a hand whose moved probability mass exceeds this is never adopted, whatever its weight
ROW_TOL = 5e-6            # a stored row must still be a probability row (each value in [0, 1], sum 1) within this
CLASSES = ('adopt', 'exceeded', 'anomaly')
def limit_pct(solve_accuracy): return min(100.0 * float(solve_accuracy), LIMIT_CAP_PCT)
def mismatches(written, back, live_range, tol=EXACT_TOL):
    """Compare on hands live for the actor. Returns {'err', 'n_live', 'hands': [{'hand', 'written': {child: v}, 'stored': {child: v}, 'err', 'tv'}]}.
    Raises ValueError when no hand is live (same as f1_readback)."""
    live = [i for i, w in enumerate(live_range) if w > 0]
    if not live: raise ValueError('no live hand for the acting player at this node')
    hands = []; worst = 0.0
    for i in live:
        d = [abs(back[c][i] - written[c][i]) for c in written]; e = max(d)
        if e > worst: worst = e
        if not e <= tol:
            hands.append({'hand': i, 'written': {c: written[c][i] for c in written}, 'stored': {c: back[c][i] for c in written}, 'err': e, 'tv': 0.5 * sum(d)})
    return {'err': worst, 'n_live': len(live), 'hands': hands}
def matchup_mass(actor_root, opp_root, combo_cards, board_cards=()):
    """(mass, total): mass(h) = w_h x (opponent weight not sharing a card with h); total = sum of mass. share(h) = mass(h) / total (review correction 3:
    the driver logs the root weight, mass(h) / w_h and the total, so a bound can be recomputed from the incident record)."""
    dead = set(board_cards); n = len(combo_cards)
    a = [0.0 if dead.intersection(combo_cards[i]) else float(actor_root[i]) for i in range(n)]
    o = [0.0 if dead.intersection(combo_cards[i]) else float(opp_root[i]) for i in range(n)]
    tot = sum(o); by_card = {}
    for i in range(n):
        for c in combo_cards[i]: by_card[c] = by_card.get(c, 0.0) + o[i]
    m = [a[i] * (tot - by_card.get(combo_cards[i][0], 0.0) - by_card.get(combo_cards[i][1], 0.0) + o[i]) for i in range(n)]
    z = sum(m)
    if not z > 0: raise ValueError('no matchup mass at the root')
    return m, z
def matchup_shares(actor_root, opp_root, combo_cards, board_cards=()):
    """share(h) for every hand: w_h x (opponent weight not sharing a card with h) / total matchup mass. Hands holding a board card get 0."""
    m, z = matchup_mass(actor_root, opp_root, combo_cards, board_cards)
    return [x / z for x in m]
def judge(mm, shares, pot_chips, stack_chips, limit, used_pct=0.0):
    """mm from mismatches() (with hands). Returns the verdict dict; 'class' is one of CLASSES; 'bound_pct' is this mismatch's bound; adoption needs
    used_pct + bound_pct <= limit (used_pct = bounds already charged to the same arm, including the phase's outstanding restore drift)."""
    swing = float(pot_chips) + 2.0 * float(stack_chips); bound = 0.0; reasons = []; hands = []
    for h in mm['hands']:
        sh = shares[h['hand']]; b = sh * h['tv'] * swing / float(pot_chips) * 100.0; bound += b
        st = list(h['stored'].values())
        row_ok = all(-ROW_TOL <= v <= 1 + ROW_TOL for v in st) and abs(sum(st) - 1.0) <= ROW_TOL * max(1, len(st))
        if not row_ok: reasons.append('stored row of hand %d is not a probability row' % h['hand'])
        if h['tv'] > HAND_TV_CAP: reasons.append('hand %d moved mass %.6g above the per-hand cap %g' % (h['hand'], h['tv'], HAND_TV_CAP))
        if not sh > 0: reasons.append('hand %d is live for read-back but has no root matchup share (bound undefined)' % h['hand'])
        hands.append(dict(h, share=sh, bound_pct=b))
    if len(mm['hands']) > MAX_HANDS: reasons.append('%d mismatched hands above the cap %d' % (len(mm['hands']), MAX_HANDS))
    if reasons: cls = 'anomaly'
    elif used_pct + bound <= limit: cls = 'adopt'
    else: cls = 'exceeded'; reasons.append('bound %.6g + already used %.6g above the limit %.6g (%% of root pot)' % (bound, used_pct, limit))
    return {'class': cls, 'bound_pct': bound, 'used_pct': used_pct, 'limit_pct': limit, 'swing_chips': swing, 'max_err': mm['err'], 'n_live': mm['n_live'],
            'n_hands': len(mm['hands']), 'hands': hands[:25], 'reasons': reasons}
def stored_strategy(written, back, live_range):
    """The strategy the solver actually holds, for scoring and for later lock checks: read-back values on live hands, written values elsewhere."""
    return {c: [back[c][i] if live_range[i] > 0 else written[c][i] for i in range(len(written[c]))] for c in written}
