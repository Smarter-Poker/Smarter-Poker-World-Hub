"""
Caller-side (vs-RFI) FLAT-defense ranges for 6-max 100bb single-raised pots.

Pairs with the opener ranges in rfi_ranges.py to form complete single-raised-pot
(SRP) solve inputs for the PioSOLVER machines. For an SRP spot only the opener
range + the caller's FLAT range are needed; the 3-bet branch is a different pot
type and is supplied when we build 3-bet-pot spots.

Self-contained (no imports) so it survives container resets. Verified combo map
shared with the machines:
  card  = rank*4 + suit   (c,d,h,s = 0,1,2,3 ; rank 2=0 .. A=12)
  combo = b*(b-1)//2 + a   for card indices a<b   (2c2d=0 ... AhAs=1325)

SOURCING (2026-07-23): the app's src/config/solverRanges.js was found to be too
tight to use as a solve source (its BB_DEFENSE vs_BTN encodes ~18% total defense
vs the ~55% its own comment claims; its RFI has BTN at 25% vs ~45% real GTO).
That is why the opener ranges were hand-authored in rfi_ranges.py, and these
caller ranges follow the same method: hand-authored, calibrated to established
6-max 100bb GTO flat-defense frequencies, each validated to a percentage band +
poker-logic sanity. These are v1 interim ranges (correct %s, sensible
composition); the Pio preflop solver can refine them to exact parity later
without blocking postflop production.
"""
import json

RANKS_HL = "AKQJT98765432"
RANKS_LH = "23456789TJQKA"
SUITS = "cdhs"


def _idx(r): return RANKS_HL.index(r)
def ci(rank, suit): return RANKS_LH.index(rank) * 4 + SUITS.index(suit)
def comboidx(a, b):
    a, b = (a, b) if a < b else (b, a)
    return b * (b - 1) // 2 + a


def all_combos(hc):
    r1, r2 = hc[0], hc[1]
    suited = hc.endswith("s"); pair = (r1 == r2); out = set()
    for s1 in SUITS:
        for s2 in SUITS:
            c1, c2 = ci(r1, s1), ci(r2, s2)
            if c1 == c2: continue
            if pair:
                if c1 < c2: out.add(comboidx(c1, c2))
            else:
                if suited != (s1 == s2): continue
                if RANKS_LH.index(r1) <= RANKS_LH.index(r2): continue
                out.add(comboidx(c1, c2))
    return sorted(out)


def combos(hc): return 6 if len(hc) == 2 else (4 if hc.endswith("s") else 12)


def _run(t):
    """Expand one token: 'X-Y' descending run, 'Z+' plus-run, or a single class."""
    if "-" in t:
        lo, hi = t.split("-")
        if len(lo) == 2 and lo[0] == lo[1]:            # pair run e.g. 22-JJ
            a, b = _idx(lo[0]), _idx(hi[0])
            return {RANKS_HL[k] * 2 for k in range(min(a, b), max(a, b) + 1)}
        suf = lo[2]; hc = lo[0]; k1, k2 = _idx(lo[1]), _idx(hi[1])   # kicker run
        return {hc + RANKS_HL[k] + suf for k in range(min(k1, k2), max(k1, k2) + 1)}
    if t.endswith("+"):
        base = t[:-1]
        if len(base) == 2 and base[0] == base[1]:
            return {RANKS_HL[k] * 2 for k in range(0, _idx(base[0]) + 1)}
        hi, ko, suf = base[0], base[1], base[2]; h = _idx(hi)
        return {hi + RANKS_HL[k] + suf for k in range(_idx(ko), h, -1)}
    return {t}


def expand(tokens):
    out = set()
    for t in tokens:
        out |= _run(t)
    return out


def vec(classes):
    v = [0.0] * 1326
    for hc in classes:
        for k in all_combos(hc):
            v[k] = 1.0
    return v


def pct(classes): return sum(combos(h) for h in classes) / 1326 * 100


# BB flat-call (defense) ranges keyed by the OPENER seat the BB defends against
# (opens ~2.5bb). Premiums (AA/KK/QQ/AKs/AQs/AKo/AQo) are 3-bet, so they are
# removed from every flat list (see BB_3BET_EXCLUDE). Widen with opener range:
# BB flats more the later the opener's seat.
BB_FLAT_TOKENS = {
    "UTG": ["22-JJ", "AJs-A2s", "KTs-K6s", "QTs-Q7s", "JTs-J7s", "T9s-T7s", "98s-97s", "87s-86s",
            "76s-75s", "65s", "54s", "AJo-A8o", "KJo-K9o", "QJo-QTo", "JTo-J9o", "T9o"],
    "MP":  ["22-JJ", "A2s+", "KTs-K5s", "QTs-Q6s", "J9s-J7s", "T9s-T6s", "98s-96s", "87s-85s",
            "76s-74s", "65s-64s", "54s", "43s", "AJo-A7o", "KJo-K9o", "QJo-Q9o", "J9o+", "T9o", "98o"],
    "CO":  ["22-JJ", "A2s+", "K9s-K3s", "Q9s-Q5s", "J9s-J6s", "T8s-T6s", "98s-95s", "87s-84s",
            "76s-74s", "65s-63s", "54s-53s", "43s", "32s", "ATo-A6o", "KJo-K8o", "QJo-Q8o",
            "J9o+", "T8o+", "98o"],
    # matches the validated spot001 BB flat (43.4%)
    "BTN": ["22+", "A2s+", "K2s+", "Q4s+", "J5s+", "T6s+", "96s+", "85s+", "74s+", "63s+", "53s+", "43s",
            "A2o+", "K5o+", "Q9o+", "J9o+", "T9o", "98o"],
}
BB_3BET_EXCLUDE = {"AA", "KK", "QQ", "AKs", "AQs", "AKo", "AQo"}
# GTO flat-defense percentage bands (call-only), +/-~4 of target.
BB_FLAT_BAND = {"UTG": (22, 29), "MP": (26, 33), "CO": (31, 39), "BTN": (40, 46)}


def bb_flat(seat):
    return expand(BB_FLAT_TOKENS[seat]) - BB_3BET_EXCLUDE


def build():
    out = {}
    for seat in BB_FLAT_TOKENS:
        cls = bb_flat(seat)
        p = pct(cls); lo, hi = BB_FLAT_BAND[seat]
        assert lo <= p <= hi, f"BB flat vs {seat}: {p:.1f}% out of band {lo}-{hi}"
        v = vec(cls)
        assert v[1325] == 0.0, f"AhAs must not be in BB flat vs {seat} (BB 3-bets AA)"
        assert v[0] == 1.0, f"2c2d must be in BB flat vs {seat} (small pairs flat)"
        out[seat] = {"pct": round(p, 1), "classes": sorted(cls), "set_range": v}
    return out


if __name__ == "__main__":
    data = build()
    for seat in BB_FLAT_TOKENS:
        d = data[seat]
        print(f"BB flat vs {seat:4s} {d['pct']:5.1f}%  "
              f"({len(d['classes'])} classes, {int(sum(d['set_range']))} combos)")
    json.dump({s: {"pct": data[s]["pct"], "classes": data[s]["classes"]} for s in data},
              open("vs_rfi_ranges.json", "w"), indent=0)
    print("all BB flat ranges validated in-band; vs_rfi_ranges.json written")
