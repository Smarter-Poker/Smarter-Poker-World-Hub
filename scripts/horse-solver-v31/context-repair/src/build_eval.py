"""One fixed candidate versus one frozen baseline; public encoder only."""
import copy,json,sys
from pathlib import Path
import joblib,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,P,SP,load,sha,frozen,candidate_frozen,emit
from candidate import load as candidate
import context_encode as E
sys.path.insert(0,str(P/'hv31-next-round-01a1e479/src'))
from exact_strategy import predict,to_table
from contract import load_range_vector
from pio_upi import COMBO_CARDS
def main():
    stage=sys.argv[1];assert stage in ('DEV','NEW_FINAL');candidate_frozen()
    if stage=='NEW_FINAL':assert load(B/'evidence/DEV-result.json')['verdict']=='IMPROVEMENT_CONTINUE'
    jobs=[j for j in load(B/'spec.json') if j['meta']['role']==stage]
    assert not (B/('evidence/build-'+stage+'.json')).exists()
    items=[]
    for j in jobs:
        s=j['phases'][0]['scenario']
        for h in j['phases'][0]['harvest']:
            items.append(dict(scenario=s,target=dict(target_id=j['id']+'.'+h['name'],machine_id='M1',node=h['node'],board=s['flop_board'],node_role=None,facing_kind=None,facing_size_bucket=None,expected_children=j['meta']['expected_children'][h['name']])))
    enc=B/('encode-'+stage);E.encode(items,enc,tag='context-repair-v1')
    pins=load(P/'hv31-next-round-01a1e479/INPUTS.json');base={sp:joblib.load(pins['spots'][sp]['base_model']['path']) for sp in SP}
    cache={}
    for j in jobs:
        ph=j['phases'][0];s=ph['scenario'];blocked=set(E.cards(s['flop_board']));nodes={h['name']:h for h in ph['harvest']};arms=[]
        for seat,spots in (('ip',('F.cbet','F.vs_xr')),('oop',('F.vs_b33','F.vs_b75'))):
            rp=E.PLAN/'input-root'/s[seat+'_range_path'];assert sha(rp)==s[seat+'_range_checksum'];cache.setdefault(str(rp),load_range_vector(rp));rv=cache[str(rp)]
            pos=[i for i in range(1326) if rv[i]>0 and not blocked.intersection(COMBO_CARDS[i])]
            for name in ('baseline','candidate'):
                writes=[]
                for sp in spots:
                    z=np.load(enc/'rows'/(j['id']+'.'+sp+'.npz'));assert list(map(int,z['combo_indices']))==pos
                    model=base[sp] if name=='baseline' else candidate(s,sp)
                    acts=model['actions'];assert sorted(acts)==sorted(j['meta']['expected_children'][sp])
                    x=z['X'];assert x.shape==(len(pos),246) and np.isfinite(x).all()
                    wr=dict(node=nodes[sp]['node'],actor=seat.upper(),spec={'table':dict(positive=pos,actions=acts,F=to_table(predict(model,x)))})
                    if sp=='F.vs_xr':wr['rootlive']=True
                    writes.append(wr)
                arms.append(dict(name=seat+'_all|'+name,writes=writes))
        ph['arms']=arms
    candidate_frozen();print(json.dumps(emit(jobs,stage)))
if __name__=='__main__':main()
