"""
Verified combo map — SINGLE source of truth for card/combo indexing shared by
the preflop solver and the PioSOLVER `set_range` vectors on the Windows machines.

Card index : card = rank*4 + suit
             rank 2=0..A=12 ; suit c=0,d=1,h=2,s=3
Combo index: for card indices a<b, index = b*(b-1)//2 + a
             (2c2d=0 ... AhAs=1325). Matches eval7 native encoding (verified).
"""
RANKS = "23456789TJQKA"
SUITS = "cdhs"


def card_index(rank_ch, suit_ch):
    return RANKS.index(rank_ch) * 4 + SUITS.index(suit_ch)


def card_str(idx):
    return RANKS[idx // 4] + SUITS[idx % 4]


def combo_index(ca, cb):
    a, b = (ca, cb) if ca < cb else (cb, ca)
    return b * (b - 1) // 2 + a


NUM_COMBOS = 1326


def all_combos_for_class(hc):
    r1, r2 = hc[0], hc[1]
    suited = hc.endswith("s")
    pair = (r1 == r2)
    out = set()
    for s1 in SUITS:
        for s2 in SUITS:
            c1, c2 = card_index(r1, s1), card_index(r2, s2)
            if c1 == c2:
                continue
            if pair:
                if c1 < c2:
                    out.add(combo_index(c1, c2))
            else:
                is_s = (s1 == s2)
                if suited != is_s:
                    continue
                if RANKS.index(r1) <= RANKS.index(r2):
                    continue
                out.add(combo_index(c1, c2))
    return sorted(out)


def class_to_vector(class_weights):
    """dict {class: weight} -> length-1326 list in PioSOLVER combo order."""
    vec = [0.0] * NUM_COMBOS
    for hc, w in class_weights.items():
        for k in all_combos_for_class(hc):
            vec[k] = float(w)
    return vec


def combos_in_class(hc):
    return 6 if len(hc) == 2 else (4 if hc.endswith("s") else 12)


if __name__ == "__main__":
    assert combo_index(card_index("2", "c"), card_index("2", "d")) == 0
    assert combo_index(card_index("A", "h"), card_index("A", "s")) == 1325
    assert len(all_combos_for_class("AA")) == 6
    assert len(all_combos_for_class("AKs")) == 4
    assert len(all_combos_for_class("AKo")) == 12
    print("combomap OK")
