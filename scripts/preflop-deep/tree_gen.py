"""
CANONICAL shared PioSOLVER tree generator for single-raised pots.
Both machines run THIS exact file to produce byte-identical add_line geometry.

build_lines(pot, eff) is parameterized: pot (chips) and eff_stack (chips) drive
the 33%/75%/125% bets on every street plus the legal standard raise and all-in
raise at every non-all-in facing node.
A different (stack, pot) -> a different, valid tree (e.g. shorter stacks all-in sooner).
This is how cash vs tournament vs blind-depth produce different solves: the phase
passes its own pot/eff (+ rake/antes) so Pio builds and solves a different game.

The legacy ``srp_parameterized_v2`` rows remain immutable. New solves produced
by this generator use a new geometry identity so old rows can never be relabeled
as if they contained the expanded four-action decision tree.
"""
POT = 550
EFF = 9750
GEOMETRY_TAG = "srp_parameterized_four_action_v3"
OPEN_BET_FRACTIONS = (0.33, 0.75, 1.25)


def raise_targets(actor_contribution, opponent_contribution, eff):
    """Return deterministic legal raise-to targets for a facing decision.

    The first target is a full standard raise (three times the amount faced,
    never below the legal minimum); the second is the all-in target. Near the
    stack cap the standard target is capped at one chip below all-in so it stays
    distinct. If no non-all-in full raise exists, only the legal all-in raise is
    returned. Facing an all-in returns no raises, leaving Pio's implicit Fold
    plus the explicit Call as the required binary decision.
    """
    values = (actor_contribution, opponent_contribution, eff)
    if any(not isinstance(value, int) or isinstance(value, bool) for value in values):
        raise ValueError("raise geometry requires integer chip contributions")
    if not (0 <= actor_contribution < opponent_contribution <= eff):
        raise ValueError("raise geometry requires one canonical facing-wager state")
    if opponent_contribution == eff:
        return []

    amount_faced = opponent_contribution - actor_contribution
    minimum_full_raise = opponent_contribution + amount_faced
    if minimum_full_raise >= eff:
        return [eff]

    preferred_standard = actor_contribution + 3 * amount_faced
    standard = min(eff - 1, max(minimum_full_raise, preferred_standard))
    # Keep this dedupe even though the integer/cap guards above already make
    # the two targets distinct. It is a fail-safe against future sizing edits.
    return list(dict.fromkeys((standard, eff)))


def build_lines(pot=POT, eff=EFF):
    if (not isinstance(pot, int) or isinstance(pot, bool) or pot <= 0
            or not isinstance(eff, int) or isinstance(eff, bool) or eff <= 0):
        raise ValueError("pot and effective stack must be positive integer chips")
    lines = []

    def action(street, oop, ip, pot, sofar, is_oop, facing):
        # One player reaching the cap creates a facing-all-in decision for the
        # other player; only a matched all-in is terminal.
        if street > 2 or (oop == eff and ip == eff):
            lines.append(sofar); return
        me = oop if is_oop else ip
        opp = ip if is_oop else oop
        if facing > 0:
            # call (explicit -> closes the action / seals the street boundary)
            action(street + 1, opp, opp, pot + facing, sofar + [opp], True, 0)
            # Pio supplies Fold implicitly at a facing node. Emit exactly two
            # distinct raise-to choices whenever a non-all-in full raise is
            # legal; an all-in facing node remains the binary Fold/Call case.
            for r in raise_targets(me, opp, eff):
                if is_oop:
                    action(street, r, opp, pot + (r - me), sofar + [r], False, r - opp)
                else:
                    action(street, oop, r, pot + (r - me), sofar + [r], True, r - opp)
        else:
            # check
            if is_oop:
                action(street, oop, ip, pot, sofar + [me], False, 0)
            else:
                action(street + 1, oop, ip, pot, sofar + [me], True, 0)
            # Every street uses the same four-way no-facing action contract:
            # Check plus 33%, 75%, and 125% pot, capped only by effective stack.
            seen = set()
            for b in OPEN_BET_FRACTIONS:
                amt = int(round(pot * b)); new = me + amt
                if new >= eff: new = eff; amt = eff - me
                if new <= me or new in seen: continue
                seen.add(new)
                if is_oop:
                    action(street, new, ip, pot + amt, sofar + [new], False, amt)
                else:
                    action(street, oop, new, pot + amt, sofar + [new], True, amt)

    action(0, 0, 0, pot, [], True, 0)
    return lines


def emit(board, oop_range_file, ip_range_file):
    """Full Pio command block for one SRP spot (100bb reference)."""
    out = [
        "pot 0 0 %d" % POT,
        "eff_stack %d" % EFF,
        "set_board %s" % board,
        "set_range OOP <contents of %s>" % oop_range_file,
        "set_range IP <contents of %s>" % ip_range_file,
        "set_rake 0 0",
        "set_isomorphism 1 0",
        "clear_lines",
    ]
    for ln in build_lines():
        out.append("add_line " + " ".join(str(x) for x in ln))
    out += ["build_tree", "go", "wait_for_solver"]
    return "\n".join(out)


if __name__ == "__main__":
    lns = build_lines()
    print("# canonical SRP geometry: %d add_line paths" % len(lns))
    for ln in lns:
        print("add_line " + " ".join(str(x) for x in ln))
