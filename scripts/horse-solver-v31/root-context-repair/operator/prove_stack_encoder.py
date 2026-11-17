"""Six actual public-producer comparisons; no native labels or fitting."""
import json,sys,io,copy,hashlib
from pathlib import Path
import numpy as np
B=Path(__file__).resolve().parents[1];R=B.parent/'hv31-root-replacement-01a1e479';sys.path.insert(0,str(B/'src'))
from data_access import SafeInputs
from context_scope import at_depth,stack_only_matrix
c=json.loads((R/'INPUTS.json').read_bytes());entries={p:v for p,v in c['inputs'].items() if v['role']=='SOURCE'}
ds=json.loads((R/'DATASET.json').read_bytes());source={(r['id'],r['spot']):r for r in ds}
# Fixed probes cover both positions, both stacks, all four decision nodes,
# and paired, monotone and two-tone geometry. Metadata selection only.
choices=[]
for pos,fam,sp,depth in (('HJ','PAIR','F.cbet',18000),('UTG','PAIR','F.vs_xr',22000),('HJ','MONO','F.vs_b33',22000),('UTG','UNP2T','F.vs_b75',18000),('HJ','UNPR','F.vs_xr',18000),('UTG','MONO','F.cbet',22000)):
 jid=sorted(i for i,j in c['jobs'].items() if j['meta']['position']==pos and j['meta']['family']==fam)[0];r=source[jid,sp];entries[r['x_path']]=dict(role='TRAIN',sha256=r['x_sha256']);choices.append((jid,sp,depth))
g=SafeInputs(entries)
for p,v in entries.items():g.read(p,v['role'])
import context_encode as E
items=[];probes=[]
for number,(jid,sp,depth) in enumerate(choices):
 j=c['jobs'][jid];base=j['phases'][0]['scenario'];s=at_depth(base,depth);s['scenario_id']='stack-proof-%d'%number;s['purpose']='TRAIN public feature proof';h=next(h for h in j['phases'][0]['harvest'] if h['name']==sp);tid='stack-proof-%d.target'%number
 items.append(dict(scenario=s,target=dict(target_id=tid,machine_id='M1',node=h['node'],board=s['flop_board'],node_role=None,facing_kind=None,facing_size_bucket=None,expected_children=j['meta']['expected_children'][sp])))
 probes.append(dict(jid=jid,spot=sp,depth=depth,target_id=tid,source=source[jid,sp],base=base,target=s))
out=B/'public-stack-proof';E.encode(items,out,tag='root-context-depth-proof-TRAIN')
proof=[]
for p in probes:
 r=p['source'];old=np.load(io.BytesIO(g.read(r['x_path'],'TRAIN')),allow_pickle=False);new=np.load(out/'rows'/(p['target_id']+'.npz'),allow_pickle=False);expected=stack_only_matrix(old['X'],p['base'],p['target'])
 assert np.array_equal(old['combo_indices'],new['combo_indices']);assert expected.dtype==new['X'].dtype and expected.tobytes()==new['X'].tobytes(),'producer differs from public stack-only transform'
 proof.append(dict(source_id=p['jid'],spot=p['spot'],stack=p['depth'],rows=len(expected),sha256=hashlib.sha256(expected.tobytes()).hexdigest()))
with (B/'evidence/stack-feature-proof.json').open('x') as f:json.dump(dict(verdict='EXACT_ACTUAL_PUBLIC_PRODUCER_PARITY',probes=proof,labels_read=False,features=246,only_changed_column=98),f,indent=2);f.write('\n')
print('Six actual public-producer stack transforms matched every feature and combo byte')
