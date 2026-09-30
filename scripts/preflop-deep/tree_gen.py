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
CHIPS_PER_BIG_BLIND = 100
MIN_NON_ALL_IN_RESIDUAL_CHIPS = CHIPS_PER_BIG_BLIND


def aggressive_target_or_jam(requested_target, eff):
    """Return a strategically distinct non-all-in target or the all-in target.

    The canonical solver scale is 100 chips per big blind. A non-all-in action
    is retained only when it leaves at least one full big blind behind. This
    deterministic separation keeps strategically distinct deep-stack sizes,
    while a nominal ``eff - 1`` or any other sub-1-BB residual collapses to the
    single jam.
    """
    values = (requested_target, eff)
    if any(not isinstance(value, int) or isinstance(value, bool) for value in values):
        raise ValueError("aggressive geometry requires integer chip contributions")
    if not (0 < requested_target and eff > 0):
        raise ValueError("aggressive geometry requires a positive wager target")
    if requested_target >= eff:
        return eff

    residual_to_jam = eff - requested_target
    if residual_to_jam < MIN_NON_ALL_IN_RESIDUAL_CHIPS:
        return eff
    return requested_target


def raise_targets(actor_contribution, opponent_contribution, eff):
    """Return deterministic legal raise-to targets for a facing decision.

    The first target is a full standard raise (three times the amount faced,
    never below the legal minimum); the second is the all-in target. A standard
    target is retained only when it leaves at least one big blind behind.
    Near the stack cap only the jam is emitted.
    Facing an all-in returns no raises, leaving Pio's implicit Fold plus the
    explicit Call as the required binary decision.
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
    preferred_standard = actor_contribution + 3 * amount_faced
    standard = aggressive_target_or_jam(
        max(minimum_full_raise, preferred_standard),
        eff,
    )
    if standard == eff:
        return [eff]
    return [standard, eff]


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
            # Every street starts from the same four-way no-facing sizing
            # contract: Check plus 33%, 75%, and 125% pot. A near-cap size is
            # normalized to the single jam by the same one-big-blind residual
            # contract used at facing nodes.
            seen = set()
            for b in OPEN_BET_FRACTIONS:
                amt = int(round(pot * b)); requested = me + amt
                if requested <= me:
                    continue
                new = aggressive_target_or_jam(requested, eff)
                amt = new - me
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
