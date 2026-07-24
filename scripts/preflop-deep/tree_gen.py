"""
CANONICAL shared PioSOLVER tree generator for single-raised pots.
Both machines run THIS exact file to produce byte-identical add_line geometry.

build_lines(pot, eff) is parameterized: pot (chips) and eff_stack (chips) drive the
bet sizes (33%/75% flop, 75% turn/river), the 3x flop raise, and the all-in jam.
Defaults reproduce the verified 100bb SRP tree (pot 550, eff 9750 -> 161 lines, b412).
A different (stack, pot) -> a different, valid tree (e.g. shorter stacks all-in sooner).
This is how cash vs tournament vs blind-depth produce different solves: the phase
passes its own pot/eff (+ rake/antes) so Pio builds and solves a different game.

Validation (100bb): 161 lines, every bet 33%/75% of node pot, raises 3x or all-in,
<=1 standard raise per street; both machines produced byte-identical EVs.
"""
POT = 550
EFF = 9750


def build_lines(pot=POT, eff=EFF):
    lines = []

    def action(street, oop, ip, pot, sofar, is_oop, raises, facing):
        if street > 2 or oop == eff or ip == eff:
            lines.append(sofar); return
        me = oop if is_oop else ip
        opp = ip if is_oop else oop
        if facing > 0:
            # call (explicit -> closes the action / seals the street boundary)
            action(street + 1, opp, opp, pot + facing, sofar + [opp], True, 0, 0)
            # raises
            cands = []
            if street == 0 and raises == 0:
                cands.append(me + 3 * facing)          # 3x standard raise, flop only
            cands.append(eff)                          # all-in jam (always)
            seen = set()
            for r in cands:
                if r >= eff: r = eff
                if r <= opp or r in seen: continue
                seen.add(r)
                if is_oop:
                    action(street, r, opp, pot + (r - me), sofar + [r], False, raises + 1, r - opp)
                else:
                    action(street, oop, r, pot + (r - me), sofar + [r], True, raises + 1, r - opp)
        else:
            # check
            if is_oop:
                action(street, oop, ip, pot, sofar + [me], False, raises, 0)
            else:
                action(street + 1, oop, ip, pot, sofar + [me], True, 0, 0)
            # bets
            seen = set()
            for b in ([0.33, 0.75] if street == 0 else [0.75]):
                amt = int(round(pot * b)); new = me + amt
                if new >= eff: new = eff; amt = eff - me
                if new <= me or new in seen: continue
                seen.add(new)
                if is_oop:
                    action(street, new, ip, pot + amt, sofar + [new], False, raises, amt)
                else:
                    action(street, oop, new, pot + amt, sofar + [new], True, raises, amt)

    action(0, 0, 0, pot, [], True, 0, 0)
    return lines


def emit(board, oop_range_file, ip_range_file):
    """Full Pio command block for one SRP spot (100bb reference)."""
    out = [
        "pot 0 0 %d" % POT,
        "eff_stack %d" % EFF,
        "set_board %s" % board,
        "set_range OOP <contents of %s>" % oop_range_file,
        "set_range IP <contents of %s>" % ip_range_file,
        "set_rake 0 0 0 0",
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
