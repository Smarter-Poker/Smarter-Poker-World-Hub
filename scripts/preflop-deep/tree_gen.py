"""
CANONICAL shared PioSOLVER tree generator for 6-max 100bb single-raised pots.
LOCKED STANDARD (see TREE_STANDARD.md). Both machines run THIS exact file to
produce byte-identical add_line geometry, then feed it to Pio. Never run an
independently-written generator.

Structure (production v1, engine-verified + parser-validated 2026-07-23):
  - x100 scale: pot 550 (5.5bb), eff_stack 9750 (97.5bb)
  - Flop: bets 33% and 75%; facing a bet -> fold / call / raise to 3x / all-in
  - Turn, River: bet 75%; facing a bet -> fold / call / all-in
  - Cap: ONE standard (3x) raise per street; an all-in jam over a raise is allowed
  - Folds are implicit (Pio adds them automatically); calls are explicit
  - rake 0, set_isomorphism 1 0, solve to 0.5%

The add_line geometry is board- and range-INDEPENDENT, so this one tree serves
every SRP spot; only set_board + the two set_range files change per spot.

Validation: 161 lines, every bet 33%/75% of its node pot, every raise 3x or
all-in, pot math consistent, <=1 standard raise per street. Root EVs must match
across machines before any DB write.
"""
POT = 550
EFF = 9750


def build_lines():
    lines = []

    def action(street, oop, ip, pot, sofar, is_oop, raises, facing):
        if street > 2 or oop == EFF or ip == EFF:
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
            cands.append(EFF)                          # all-in jam (always)
            seen = set()
            for r in cands:
                if r >= EFF: r = EFF
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
                if new >= EFF: new = EFF; amt = EFF - me
                if new <= me or new in seen: continue
                seen.add(new)
                if is_oop:
                    action(street, new, ip, pot + amt, sofar + [new], False, raises, amt)
                else:
                    action(street, oop, new, pot + amt, sofar + [new], True, raises, amt)

    action(0, 0, 0, POT, [], True, 0, 0)
    return lines


def emit(board, oop_range_file, ip_range_file):
    """Full Pio command block for one SRP spot. Machines paste range file CONTENTS
    where indicated (set_range OOP <1326 weights>)."""
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
    print("# canonical SRP production geometry: %d add_line paths" % len(lns))
    for ln in lns:
        print("add_line " + " ".join(str(x) for x in ln))
