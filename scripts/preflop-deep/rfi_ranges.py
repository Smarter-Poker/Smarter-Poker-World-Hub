"""
Canonical 6-max 100bb RFI (raise-first-in) ranges, validated against known GTO
percentage bands. Self-contained (no external imports) so it survives container
resets. Emits per-seat class weights + the length-1326 set_range vector in the
verified combo order (card=rank*4+suit, c,d,h,s=0,1,2,3; combo=b*(b-1)/2+a),
and asserts each seat's combo-weighted percentage lands in its GTO band.

These are the OPENER ranges. Postflop solves also need the caller's range
(vs-RFI flat/3bet) — see vs_rfi_ranges.py. Pair them per line to build a
complete solve input.
"""
import json

RANKS_HL = "AKQJT98765432"      # high->low, for range tokens
RANKS_LH = "23456789TJQKA"      # low->high, for card indexing (2=0..A=12)
SUITS = "cdhs"


def _idx(r): return RANKS_HL.index(r)
def card_index(rank_ch, suit_ch): return RANKS_LH.index(rank_ch) * 4 + SUITS.index(suit_ch)
def combo_index(ca, cb):
    a, b = (ca, cb) if ca < cb else (cb, ca)
    return b * (b - 1) // 2 + a


def all_combos_for_class(hc):
    r1, r2 = hc[0], hc[1]
    suited = hc.endswith("s"); pair = (r1 == r2)
    out = set()
    for s1 in SUITS:
        for s2 in SUITS:
            c1, c2 = card_index(r1, s1), card_index(r2, s2)
            if c1 == c2: continue
            if pair:
                if c1 < c2: out.add(combo_index(c1, c2))
            else:
                if suited != (s1 == s2): continue
                if RANKS_LH.index(r1) <= RANKS_LH.index(r2): continue
                out.add(combo_index(c1, c2))
    return sorted(out)


def combos_in_class(hc): return 6 if len(hc) == 2 else (4 if hc.endswith("s") else 12)


def expand(tokens):
    """'22+','A2s+','KTs+','AJo+','KQo' style -> {class: weight}."""
    out = {}
    for t in tokens:
        w = 1.0
        if ":" in t: t, ws = t.split(":"); w = float(ws)
        if t.endswith("+"):
            base = t[:-1]
            if len(base) == 2 and base[0] == base[1]:
                lo = _idx(base[0])
                for r in RANKS_HL[:lo + 1]: out[r + r] = w
            else:
                hi, ko, suf = base[0], base[1], base[2]; h = _idx(hi)
                for k in range(_idx(ko), h, -1): out[hi + RANKS_HL[k] + suf] = w
        else:
            out[t] = w
    return out


def class_to_vector(cw):
    vec = [0.0] * 1326
    for hc, w in cw.items():
        for k in all_combos_for_class(hc): vec[k] = float(w)
    return vec


def pct(cw): return sum(combos_in_class(h) * w for h, w in cw.items()) / 1326 * 100


RFI = {
    "UTG": ["22+","A2s+","KTs+","QTs+","JTs","T9s","98s","87s","76s","65s","AJo+","KQo"],
    "MP":  ["22+","A2s+","K9s+","QTs+","J9s+","T9s","98s","87s","76s","65s","ATo+","KJo+"],
    "CO":  ["22+","A2s+","K7s+","Q8s+","J8s+","T8s+","97s+","86s+","75s+","64s+","54s","A9o+","KTo+","QTo+","JTo"],
    "BTN": ["22+","A2s+","K2s+","Q4s+","J6s+","T6s+","96s+","85s+","74s+","64s+","53s+","43s","A2o+","K7o+","Q9o+","J9o+","T9o","98o","87o"],
    "SB":  ["22+","A2s+","K2s+","Q4s+","J6s+","T6s+","96s+","85s+","74s+","64s+","53s+","43s","A2o+","K8o+","Q9o+","J9o+","T9o"],
}
BAND = {"UTG": (14, 17), "MP": (16, 20), "CO": (22, 28), "BTN": (40, 48), "SB": (36, 46)}


def build():
    out = {}
    for seat, toks in RFI.items():
        cw = expand(toks); p = pct(cw); lo, hi = BAND[seat]
        assert lo <= p <= hi, f"{seat} {p:.1f}% out of band {lo}-{hi}"
        out[seat] = {"pct": round(p, 1), "class_weights": cw, "set_range": class_to_vector(cw)}
    return out


if __name__ == "__main__":
    data = build()
    for seat in RFI:
        print(f"{seat:4s} {data[seat]['pct']:5.1f}%  ({len(data[seat]['class_weights'])} classes, "
              f"{int(sum(data[seat]['set_range']))} full-weight combos)")
    with open("/home/claude/whub/scripts/preflop-deep/rfi_ranges.json", "w") as f:
        json.dump({s: {"pct": data[s]["pct"], "class_weights": data[s]["class_weights"]} for s in data}, f, indent=0)
    print("all seats validated in-band; rfi_ranges.json written")
