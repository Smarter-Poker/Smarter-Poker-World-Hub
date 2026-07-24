"""Deterministically (re)generate the 1326-weight range files under ranges/.
Run `python make_ranges.py`. Adding a matchup here + a phase in phases.json is all
it takes to extend coverage; the orchestrator re-runs this each loop."""
import os
RANKS_HL="AKQJT98765432"; RANKS_LH="23456789TJQKA"; SUITS="cdhs"
def _idx(r): return RANKS_HL.index(r)
def ci(r,s): return RANKS_LH.index(r)*4+SUITS.index(s)
def cx(a,b):
    a,b=(a,b) if a<b else (b,a); return b*(b-1)//2+a
def all_combos(hc):
    r1,r2=hc[0],hc[1]; suited=hc.endswith("s"); pair=(r1==r2); out=set()
    for s1 in SUITS:
        for s2 in SUITS:
            c1,c2=ci(r1,s1),ci(r2,s2)
            if c1==c2: continue
            if pair:
                if c1<c2: out.add(cx(c1,c2))
            else:
                if suited!=(s1==s2): continue
                if RANKS_LH.index(r1)<=RANKS_LH.index(r2): continue
                out.add(cx(c1,c2))
    return sorted(out)
def nc(hc): return 6 if len(hc)==2 else (4 if hc.endswith("s") else 12)
def _run(t):
    if "-" in t:
        lo,hi=t.split("-")
        if len(lo)==2 and lo[0]==lo[1]:
            a,b=_idx(lo[0]),_idx(hi[0]); return {RANKS_HL[k]*2 for k in range(min(a,b),max(a,b)+1)}
        suf=lo[2]; hc=lo[0]; k1,k2=_idx(lo[1]),_idx(hi[1])
        return {hc+RANKS_HL[k]+suf for k in range(min(k1,k2),max(k1,k2)+1)}
    if t.endswith("+"):
        base=t[:-1]
        if len(base)==2 and base[0]==base[1]: return {RANKS_HL[k]*2 for k in range(0,_idx(base[0])+1)}
        hi,ko,suf=base[0],base[1],base[2]; h=_idx(hi)
        return {hi+RANKS_HL[k]+suf for k in range(_idx(ko),h,-1)}
    return {t}
def expand(toks):
    o=set()
    for t in toks: o|=_run(t)
    return o
def vec(cls):
    v=[0.0]*1326
    for hc in cls:
        for k in all_combos(hc): v[k]=1.0
    return v
def pct(cls): return sum(nc(h) for h in cls)/1326*100
def fmt(v): return " ".join(str(int(x)) if x in (0.0,1.0) else f"{x:g}" for x in v)
RFI={
 "UTG":["22+","A2s+","KTs+","QTs+","JTs","T9s","98s","87s","76s","65s","AJo+","KQo"],
 "MP": ["22+","A2s+","K9s+","QTs+","J9s+","T9s","98s","87s","76s","65s","ATo+","KJo+"],
 "CO": ["22+","A2s+","K7s+","Q8s+","J8s+","T8s+","97s+","86s+","75s+","64s+","54s","A9o+","KTo+","QTo+","JTo"],
 "BTN":["22+","A2s+","K2s+","Q4s+","J6s+","T6s+","96s+","85s+","74s+","64s+","53s+","43s","A2o+","K7o+","Q9o+","J9o+","T9o","98o","87o"],
}
EXCL={"AA","KK","QQ","AKs","AQs","AKo","AQo"}
BBFLAT={
 "UTG":["22-JJ","AJs-A2s","KTs-K6s","QTs-Q7s","JTs-J7s","T9s-T7s","98s-97s","87s-86s","76s-75s","65s","54s","AJo-A8o","KJo-K9o","QJo-QTo","JTo-J9o","T9o"],
 "MP": ["22-JJ","A2s+","KTs-K5s","QTs-Q6s","J9s-J7s","T9s-T6s","98s-96s","87s-85s","76s-74s","65s-64s","54s","43s","AJo-A7o","KJo-K9o","QJo-Q9o","J9o+","T9o","98o"],
 "CO": ["22-JJ","A2s+","K9s-K3s","Q9s-Q5s","J9s-J6s","T8s-T6s","98s-95s","87s-84s","76s-74s","65s-63s","54s-53s","43s","32s","ATo-A6o","KJo-K8o","QJo-Q8o","J9o+","T8o+","98o"],
 "BTN":["22+","A2s+","K2s+","Q4s+","J5s+","T6s+","96s+","85s+","74s+","63s+","53s+","43s","A2o+","K5o+","Q9o+","J9o+","T9o","98o"],
}
def write_all(d="ranges"):
    os.makedirs(d, exist_ok=True)
    for seat,toks in RFI.items():
        open(f"{d}/RFI_{seat}_100.txt","w").write(fmt(vec(expand(toks))))
    for seat,toks in BBFLAT.items():
        open(f"{d}/BBflat_vs_{seat}_100.txt","w").write(fmt(vec(expand(toks)-EXCL)))
if __name__=="__main__":
    write_all()
    for seat,toks in RFI.items(): print(f"RFI_{seat}_100 {pct(expand(toks)):.1f}%")
    for seat,toks in BBFLAT.items(): print(f"BBflat_vs_{seat}_100 {pct(expand(toks)-EXCL):.1f}%")
    print("range files written to ranges/")
