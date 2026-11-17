"""Read-back invariant shared by the FLOP-1 driver and its regression (pure Python, no Pio).
Invariant: after set_strategy at a node, for every hand that is LIVE for the acting player at that node (range weight > 0), the strategy read back equals
the strategy written, per action, within tol. Hands that are dead for the actor are ignored (the solver stores nothing meaningful for them)."""
def readback_error(written, back, actor_range):
    live = [i for i, w in enumerate(actor_range) if w > 0]
    if not live: raise ValueError('no live hand for the acting player at this node')
    return max(abs(back[c][i] - written[c][i]) for c in written for i in live), len(live)
def enforce_readback(written, back, actor_range, tol=1e-6):
    err, n = readback_error(written, back, actor_range)
    if not err <= tol: raise ValueError('strategy read-back mismatch on live hands: %g > %g' % (err, tol))
    return err, n
