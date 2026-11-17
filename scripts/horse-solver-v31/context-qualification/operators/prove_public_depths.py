"""Actual unchanged public producer parity at all four new physical depths."""
import json,sys,io,copy,hashlib
from pathlib import Path
import numpy as np
B=Path(__file__).resolve().parents[1];R=B.parent/'hv31-root-replacement-01a1e479';sys.path.insert(0,str(B/'src'))
from data_access import SafeInputs
raw=(R/'INPUTS.json').read_bytes();assert hashlib.sha256(raw).hexdigest()=='c9b9d63ee7b777a684cf5c6356535d6c4cc9b5ba49eff5e082fca28dba385e70';c=json.loads(raw)
raw=(R/'DATASET.json').read_bytes();assert hashlib.sha256(raw).hexdigest()=='464edbba157aa02ca9870b97b9df5434fe76682b884576c36e30b2ea3498efa4';ds=json.loads(raw);source={(r['id'],r['spot']):r for r in ds};entries={p:v for p,v in c['inputs'].items() if v['role']=='SOURCE'}
choices=[]
for pos,fam,sp,depth in (('HJ','PAIR','F.cbet',16000),('UTG','PAIR','F.vs_xr',24000),('HJ','MONO','F.vs_b33',19000),('UTG','UNP2T','F.vs_b75',21000),('HJ','UNPR','F.vs_xr',19000),('UTG','MONO','F.cbet',21000)):
 jid=sorted(i for i,j in c['jobs'].items() if j['meta']['position']==pos and j['meta']['family']==fam)[0];r=source[jid,sp];entries[r['x_path']]=dict(role='TRAIN',sha256=r['x_sha256']);choices.append((jid,sp,depth))
g=SafeInputs(entries)
for p,v in entries.items():g.read(p,v['role'])
import context_encode as E
items=[];probes=[]
for number,(jid,sp,depth) in enumerate(choices):
 j=c['jobs'][jid];base=j['phases'][0]['scenario'];s=copy.deepcopy(base);assert s['effective_stack_chips']==20000 and max(n for ln in s['tree_lines'] for n in ln)==20000;s['effective_stack_chips']=depth;s['tree_lines']=[[depth if n==20000 else n for n in ln] for ln in s['tree_lines']];s['scenario_id']='nq-depth-proof-%d'%number;s['purpose']='public feature proof';h=next(h for h in j['phases'][0]['harvest'] if h['name']==sp);tid='nq-depth-proof-%d.target'%number
 items.append(dict(scenario=s,target=dict(target_id=tid,machine_id='M1',node=h['node'],board=s['flop_board'],node_role=None,facing_kind=None,facing_size_bucket=None,expected_children=j['meta']['expected_children'][sp])));probes.append(dict(jid=jid,spot=sp,depth=depth,target_id=tid,source=source[jid,sp]))
out=B/'public-depth-proof';E.encode(items,out,tag='next-context-depth-proof-TRAIN');proof=[]
for p in probes:
 r=p['source'];old=np.load(io.BytesIO(g.read(r['x_path'],'TRAIN')),allow_pickle=False);new=np.load(out/'rows'/(p['target_id']+'.npz'),allow_pickle=False);expected=old['X'].copy();assert np.all(expected[:,98]==200);expected[:,98]=p['depth']/100
 assert np.array_equal(old['combo_indices'],new['combo_indices']);assert expected.dtype==new['X'].dtype and expected.tobytes()==new['X'].tobytes(),'actual producer differs'
 proof.append(dict(source_id=p['jid'],spot=p['spot'],stack=p['depth'],rows=len(expected),sha256=hashlib.sha256(expected.tobytes()).hexdigest()))
with (B/'evidence/stack-feature-proof.json').open('x') as f:json.dump(dict(verdict='EXACT_ACTUAL_PUBLIC_PRODUCER_PARITY',probes=proof,labels_read=False,features=246,only_changed_column=98),f,indent=2);f.write('\n')
print('Six actual public-producer transforms matched every feature and combo byte at160/190/210/240bb')
