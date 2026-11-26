"""Full public246 encoding for32reduced-pot contexts, before labels/freeze."""
import copy,hashlib,io,json,sys
from pathlib import Path
import numpy as np
D=Path(__file__).resolve().parents[1];sys.path.insert(0,str(D/'src'))
from common import config,SP,sha
from context_scope import game_key

def main():
 assert not (D/'FREEZE.json').exists();c,g=config();assert 'context_public_records' not in c
 import context_encode as E
 items=[];lookup={};contexts={}
 for stage in ('training_jobs','evaluation_jobs'):
  for jid,j in c[stage].items():
   key=game_key(j['phases'][0]['scenario']);assert key not in contexts;contexts[key]=j
   for h in j['phases'][0]['harvest']:
    sp=h['name'];tid=jid+'.'+sp+'.public.target';s=copy.deepcopy(j['phases'][0]['scenario']);items.append(dict(scenario=s,target=dict(target_id=tid,machine_id='M1',node=h['node'],board=s['flop_board'],node_role=None,facing_kind=None,facing_size_bucket=None,expected_children=j['meta']['expected_children'][sp])));lookup[tid]=(key,sp,jid)
 # Two actual unchanged600pot controls per position, allfour nodes: byte parity anchors the producer and ROOT mapping.
 controls=[]
 for pos in ('HJ','UTG'):
  j=next(j for j in c['reference_jobs'].values() if j['meta']['position']==pos);source=j['meta']['source_train_id']
  for h in j['phases'][0]['harvest']:
   sp=h['name'];tid='control.'+pos+'.'+sp+'.target';s=copy.deepcopy(j['phases'][0]['scenario']);s.update(scenario_id='control.'+pos,purpose='unchanged TRAIN public parity');items.append(dict(scenario=s,target=dict(target_id=tid,machine_id='M1',node=h['node'],board=s['flop_board'],node_role=None,facing_kind=None,facing_size_bucket=None,expected_children=j['meta']['expected_children'][sp])));controls.append((tid,source,sp))
 out=D/'src/public-inputs-v2';out.mkdir(exist_ok=False);paths={}
 groups={}
 for item in items:
  sn=item['scenario'];t=item['target'];key=(sn['pot_chips'],sn['ranges']['IP'] if isinstance(sn.get('ranges'),dict) else str(sn.get('ranges')),t['node'])
  # Split exact repeated boards, preserving the producer's distinct-board sampling contract.
  buckets=groups.setdefault(key,[])
  bucket=next((b for b in buckets if sn['flop_board'] not in {x['scenario']['flop_board'] for x in b}),None)
  if bucket is None:bucket=[];buckets.append(bucket)
  bucket.append(item)
 for number,chunk in enumerate(b for buckets in groups.values() for b in buckets):
  target=out/('g%03d'%number);E.encode(chunk,target,tag='followthrough-public-only')
  for item in chunk:paths[item['target']['target_id']]=target/'rows'/(item['target']['target_id']+'.npz')
 proof=[]
 for tid,source,sp in controls:
  r=next(r for r in c['public_records'] if r['id']==source and r['spot']==sp);old=np.load(io.BytesIO(g.read(r['x_path'],'TRAIN')),allow_pickle=False);new=np.load(paths[tid],allow_pickle=False);assert np.array_equal(old['combo_indices'],new['combo_indices']) and old['X'].dtype==new['X'].dtype and old['X'].tobytes()==new['X'].tobytes(),'public600control differs'
  proof.append(dict(id=source,spot=sp,rows=len(new['X']),bytes_equal=True))
 records={};differences=[]
 for tid,(key,sp,jid) in lookup.items():
  p=paths[tid];z=np.load(p,allow_pickle=False);j=contexts[key];s=j['phases'][0]['scenario'];source=j['meta']['source_train_id'];r=next(r for r in c['public_records'] if r['id']==source and r['spot']==sp);old=np.load(io.BytesIO(g.read(r['x_path'],'TRAIN')),allow_pickle=False)
  assert np.array_equal(z['combo_indices'],old['combo_indices']) and z['X'].shape==old['X'].shape and np.isfinite(z['X']).all()
  assert np.allclose(z['X'][:,94],s['pot_chips']/100,atol=1e-12,rtol=0) and np.all(z['X'][:,98]==200)
  c['inputs'][str(p)]=dict(role='SOURCE',sha256=sha(p));records.setdefault(key,[]).append(dict(id=jid,spot=sp,x_path=str(p),x_sha256=sha(p)))
  changed=np.flatnonzero(np.any(old['X']!=z['X'],axis=0)).tolist();assert 94 in changed;differences.append(dict(id=jid,spot=sp,pot=s['pot_chips'],rows=len(z['X']),changed_columns=changed,full246_producer=True))
 assert len(records)==32 and all(len(v)==4 for v in records.values())
 c['context_public_records']=records;c['public_proof']=dict(control_parity=proof,contexts=32,nodes=128,labels_read=False,differences=differences,full_producer=True)
 # Prospective input finalization, never modify a frozen config.
 tmp=D/'INPUTS.public-prepared.json';tmp.write_text(json.dumps(c,sort_keys=True,indent=2,allow_nan=False)+'\n');assert not (D/'FREEZE.json').exists();tmp.replace(D/'INPUTS.json')
 print(json.dumps(dict(contexts=32,nodes=128,controls=8,labels_read=False,full246=True,input_sha256=sha('INPUTS.json'))))
if __name__=='__main__':main()
