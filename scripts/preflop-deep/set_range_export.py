"""
Convert a class-weight range (e.g. a solved Nash chart, or any PioSOLVER-derived
range) into a length-1326 `set_range` vector in the verified combo order, and
validate the round-trip. Proves the exact conversion the Windows machines rely on,
using range data we have already verified as correct GTO (the push/fold charts).
"""
import json
import combomap as cm


def chart_to_setrange(matrix, key):
    """matrix: {class: {key: weight, 'fold': ...}} -> length-1326 weight vector."""
    class_weights = {hc: v.get(key, 0.0) for hc, v in matrix.items()}
    return cm.class_to_vector(class_weights)


def setrange_pct(vec):
    return sum(vec) / 1326.0 * 100.0


def to_setrange_line(vec, player):
    return f"set_range {player} " + " ".join(
        (str(int(w)) if w in (0.0, 1.0) else f"{w:g}") for w in vec
    )


def validate(vec, matrix, key, expected_pct):
    assert all(0.0 <= w <= 1.0 for w in vec), "weight out of [0,1]"
    pct = setrange_pct(vec)
    assert abs(pct - expected_pct) < 0.15, f"pct {pct:.2f} != chart {expected_pct}"
    aa_w = matrix.get("AA", {}).get(key, 0.0)
    idx_ahas = cm.combo_index(cm.card_index("A", "h"), cm.card_index("A", "s"))
    assert idx_ahas == 1325 and vec[1325] == aa_w, "AhAs mismatch"
    idx_2c2d = cm.combo_index(cm.card_index("2", "c"), cm.card_index("2", "d"))
    tt_w = matrix.get("22", {}).get(key, 0.0)
    assert idx_2c2d == 0 and vec[0] == tt_w, "2c2d mismatch"
    nonzero_classes = {hc for hc, v in matrix.items() if v.get(key, 0.0) > 0}
    covered = set()
    for hc in nonzero_classes:
        covered.update(cm.all_combos_for_class(hc))
    for k, w in enumerate(vec):
        assert (w == 0.0) or (k in covered), f"combo {k} nonzero but no source class"
    return pct


if __name__ == "__main__":
    data = json.load(open("/home/claude/nash/nash_charts.json"))
    sb10 = next(c for c in data["charts"] if c["position"] == "SB" and c["depth"] == 10)
    vec = chart_to_setrange(sb10["matrix"], "push")
    pct = validate(vec, sb10["matrix"], "push", sb10["pct"])
    print(f"SB 10bb jam  -> set_range vector OK: {pct:.2f}% (chart {sb10['pct']}%), "
          f"AhAs[1325]={vec[1325]}, 2c2d[0]={vec[0]}")

    bb10 = data["bb_calls"]["10"]
    vecb = chart_to_setrange(bb10["matrix"], "call")
    pctb = validate(vecb, bb10["matrix"], "call", bb10["pct"])
    print(f"BB call 10bb -> set_range vector OK: {pctb:.2f}% (chart {bb10['pct']}%)")

    line = to_setrange_line(vec, "IP")
    print(f"sample set_range line length: {len(line.split())-2} weights "
          f"(expect 1326): {'PASS' if len(line.split())-2==1326 else 'FAIL'}")
    print("conversion pipeline verified on trusted GTO data.")
