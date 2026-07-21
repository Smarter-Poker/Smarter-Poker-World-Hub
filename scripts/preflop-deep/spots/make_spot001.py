"""
Deterministically generate the FIRST verified solve-input pair for the machines:
  spot001 = 6-max 100bb cash, BTN open 2.5bb, BB call (single-raised pot).
Run `python make_spot001.py` to write three files next to this script:
  spot001_ip_BTN.txt   (1326 space-separated weights, BTN RFI opener, IP)
  spot001_oop_BB.txt   (1326 space-separated weights, BB flat-call, OOP)
  spot001_config.json  (board / pot / eff_stack / bet structure)
Combo order is the verified map: card=rank*4+suit (c,d,h,s=0,1,2,3, rank 2=0..A=12),
combo index = b*(b-1)//2 + a for card indices a<b (2c2d=0 ... AhAs=1325).
Ranges validated: BTN RFI 45.7%, BB flat 43.4%. AhAs present IP (opener keeps AA),
absent OOP (BB 3-bets AA, does not flat it).
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


def expand(tokens):
    out = {}
    for t in tokens:
        w = 1.0
        if ":" in t: t, ws = t.split(":"); w = float(ws)
        if t.endswith("+"):
            base = t[:-1]
            if len(base) == 2 and base[0] == base[1]:
                for r in RANKS_HL[:_idx(base[0]) + 1]: out[r + r] = w
            else:
                hi, ko, suf = base[0], base[1], base[2]; h = _idx(hi)
                for k in range(_idx(ko), h, -1): out[hi + RANKS_HL[k] + suf] = w
        else: out[t] = w
    return out


def vec(cw):
    v = [0.0] * 1326
    for hc, w in cw.items():
        for k in all_combos(hc): v[k] = float(w)
    return v


def pct(cw): return sum(combos(h) * w for h, w in cw.items()) / 1326 * 100


BTN = ["22+","A2s+","K2s+","Q4s+","J6s+","T6s+","96s+","85s+","74s+","64s+","53s+","43s","A2o+","K7o+","Q9o+","J9o+","T9o","98o","87o"]
BB  = ["22+","A2s+","K2s+","Q4s+","J5s+","T6s+","96s+","85s+","74s+","63s+","53s+","43s","A2o+","K5o+","Q9o+","J9o+","T9o","98o"]
BB_3BET_EXCLUDE = ["AA","KK","QQ","AKs","AQs","AKo","AQo"]


def fmt(v): return " ".join(str(int(x)) if x in (0.0, 1.0) else f"{x:g}" for x in v)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    cwBTN = expand(BTN)
    cwBB = expand(BB)
    for k in BB_3BET_EXCLUDE: cwBB.pop(k, None)
    assert 44 <= pct(cwBTN) <= 47, pct(cwBTN)
    assert 41 <= pct(cwBB) <= 46, pct(cwBB)
    vIP, vOOP = vec(cwBTN), vec(cwBB)
    assert vIP[1325] == 1.0 and vOOP[1325] == 0.0  # AhAs: BTN yes, BB no
    open(os.path.join(here, "spot001_ip_BTN.txt"), "w").write(fmt(vIP))
    open(os.path.join(here, "spot001_oop_BB.txt"), "w").write(fmt(vOOP))
    cfg = {
        "spot_id": "spot001",
        "line": "6max 100bb cash: BTN open 2.5bb, BB call (single-raised pot)",
        "board": "Qh7s2c", "pot_bb": 5.5, "eff_stack_bb": 97.5,
        "oop": "BB (caller)", "ip": "BTN (opener)",
        "oop_range_file": "spot001_oop_BB.txt", "ip_range_file": "spot001_ip_BTN.txt",
        "bet_structure": {"flop": ["33%", "75%"], "turn": ["75%"], "river": ["75%"], "allin": True},
        "note": "Harvest every turn+river node; Array0=EV; filter dead combos via show_range.",
    }
    json.dump(cfg, open(os.path.join(here, "spot001_config.json"), "w"), indent=2)
    print(f"BTN RFI {pct(cwBTN):.1f}%  BB flat {pct(cwBB):.1f}%  -> wrote 3 files in {here}")


if __name__ == "__main__":
    main()
