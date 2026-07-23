"""
Deterministically generate the solve-input pair for:
  spot002 = 6-max 100bb cash, CO open 2.5bb, BB call (single-raised pot).
Run `python make_spot002.py` to write three files next to this script:
  spot002_ip_CO.txt    (1326 space-separated weights, CO RFI opener, IP)
  spot002_oop_BB.txt   (1326 space-separated weights, BB flat-vs-CO, OOP)
  spot002_config.json  (board / pot / eff_stack / bet structure)
Combo order is the verified map: card=rank*4+suit (c,d,h,s=0,1,2,3, rank 2=0..A=12),
combo index = b*(b-1)//2 + a for card indices a<b (2c2d=0 ... AhAs=1325).
Ranges validated: CO RFI ~25%, BB flat-vs-CO ~35%. AhAs present IP (opener keeps
AA), absent OOP (BB 3-bets AA rather than flatting). Board and pot geometry match
spot001 (2.5x SRP, SB folds -> pot 5.5bb, eff 97.5bb) so this isolates the
matchup (CO vs BB) as the only changed variable.
"""
import json, os

RANKS_HL = "AKQJT98765432"; RANKS_LH = "23456789TJQKA"; SUITS = "cdhs"


def _idx(r): return RANKS_HL.index(r)
def ci(rank, suit): return RANKS_LH.index(rank) * 4 + SUITS.index(suit)
def comboidx(a, b):
    a, b = (a, b) if a < b else (b, a)
    return b * (b - 1) // 2 + a


def all_combos(hc):
    r1, r2 = hc[0], hc[1]; suited = hc.endswith("s"); pair = (r1 == r2); out = set()
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
    """'X-Y' descending run, 'Z+' plus-run, or a single class."""
    if "-" in t:
        lo, hi = t.split("-")
        if len(lo) == 2 and lo[0] == lo[1]:
            a, b = _idx(lo[0]), _idx(hi[0])
            return {RANKS_HL[k] * 2 for k in range(min(a, b), max(a, b) + 1)}
        suf = lo[2]; hc = lo[0]; k1, k2 = _idx(lo[1]), _idx(hi[1])
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
        for k in all_combos(hc): v[k] = 1.0
    return v


def pct(classes): return sum(combos(h) for h in classes) / 1326 * 100


# CO RFI opener (from rfi_ranges.py, validated CO band 22-28%)
CO_RFI = ["22+", "A2s+", "K7s+", "Q8s+", "J8s+", "T8s+", "97s+", "86s+", "75s+", "64s+", "54s",
          "A9o+", "KTo+", "QTo+", "JTo"]
# BB flat-defense vs CO (from vs_rfi_ranges.py, validated 31-39%)
BB_FLAT_VS_CO = ["22-JJ", "A2s+", "K9s-K3s", "Q9s-Q5s", "J9s-J6s", "T8s-T6s", "98s-95s", "87s-84s",
                 "76s-74s", "65s-63s", "54s-53s", "43s", "32s", "ATo-A6o", "KJo-K8o", "QJo-Q8o",
                 "J9o+", "T8o+", "98o"]
BB_3BET_EXCLUDE = {"AA", "KK", "QQ", "AKs", "AQs", "AKo", "AQo"}


def fmt(v): return " ".join(str(int(x)) if x in (0.0, 1.0) else f"{x:g}" for x in v)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    clsIP = expand(CO_RFI)
    clsOOP = expand(BB_FLAT_VS_CO) - BB_3BET_EXCLUDE
    pIP, pOOP = pct(clsIP), pct(clsOOP)
    assert 22 <= pIP <= 28, pIP
    assert 31 <= pOOP <= 39, pOOP
    vIP, vOOP = vec(clsIP), vec(clsOOP)
    assert vIP[1325] == 1.0 and vOOP[1325] == 0.0  # AhAs: CO yes, BB no
    open(os.path.join(here, "spot002_ip_CO.txt"), "w").write(fmt(vIP))
    open(os.path.join(here, "spot002_oop_BB.txt"), "w").write(fmt(vOOP))
    cfg = {
        "spot_id": "spot002",
        "line": "6max 100bb cash: CO open 2.5bb, BB call (single-raised pot)",
        "board": "Qh7s2c", "pot_bb": 5.5, "eff_stack_bb": 97.5,
        "oop": "BB (caller)", "ip": "CO (opener)",
        "oop_range_file": "spot002_oop_BB.txt", "ip_range_file": "spot002_ip_CO.txt",
        "bet_structure": {"flop": ["33%", "75%"], "turn": ["75%"], "river": ["75%"], "allin": True},
        "note": "Harvest every turn+river node; Array0=EV; filter dead combos via show_range.",
    }
    json.dump(cfg, open(os.path.join(here, "spot002_config.json"), "w"), indent=2)
    print(f"CO RFI {pIP:.1f}%  BB flat-vs-CO {pOOP:.1f}%  -> wrote 3 files in {here}")


if __name__ == "__main__":
    main()
