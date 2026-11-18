"""Exact held-game support and tables, sealed before untouched exact-context EVALUATION."""
import sys,io,json,copy
from pathlib import Path
import joblib,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,SP,RECIPES,config,frozen,read,write,sha,domain
from public_data import public_matrices,ranges_for
from models import predict,table
from runtime import predict_batches
from range_features import features
from context_scope import require_bracket,game_key,stack_only_matrix
def legacy_predict(m,x):
 f=np.column_stack([h.predict(x) for h in m['heads']]);assert np.isfinite(f).all();f=np.clip(f,0,1);assert np.all(f.sum(1)>0);f=f/f.sum(1,keepdims=True);q=np.where(f<.05,0,f);bad=q.sum(1)==0;q[bad]=f[bad];return q/q.sum(1,keepdims=True)
def main():
 frozen();c,g=config();fit={'models':c['models']};assert read('POLICY-IMPORT.json')['fit_games']==104 and len(fit['models'])==8
 actual={}
 for p,v in fit['models'].items():
  actual[p]=joblib.load(io.BytesIO(g.read(v['path'],'MODEL')))
 baseline={k:joblib.load(io.BytesIO(g.read(p,'MODEL'))) for k,p in c['baseline_models'].items()};jobs={};proof=[]
 contexts={};batched={}
 for jid,j in c['evaluation_jobs'].items():
  source=j['meta']['source_train_id'];sc=j['phases'][0]['scenario'];mat=public_matrices(source,c,g)
  for sp in SP:mat[sp]['X']=stack_only_matrix(mat[sp]['X'],c['base_jobs'][source]['phases'][0]['scenario'],sc)
  contexts[jid]=(mat,features(mat,ranges_for(j,mat,c,g)))
 for p,m in actual.items():
  meta=fit['models'][p];ids=[i for i,j in c['evaluation_jobs'].items() if j['meta']['position']==meta['position']];sp=meta['spot'];inputs=[]
  for jid in ids:
   target=c['evaluation_jobs'][jid]['phases'][0]['scenario'];require_bracket(target,[c['fit_jobs'][i]['phases'][0]['scenario'] for i in meta['train_ids']]);assert game_key(target) not in meta['train_game_keys']
   assert set(m['domain_sha256s'])=={domain(c['fit_jobs'][i]['phases'][0]['scenario']) for i in meta['train_ids']}
   inputs.append(contexts[jid][1][sp]['X'])
  for jid,values in zip(ids,predict_batches(m,inputs)):batched[jid,sp]=values
 for jid,j0 in c['evaluation_jobs'].items():
  j=copy.deepcopy(j0);source=j['meta']['source_train_id'];pos=j['meta']['position'];ph=j['phases'][0];s=ph['scenario'];matrices,semantic=contexts[jid]
  nodes={h['name']:h for h in ph['harvest']};predictions={name:{} for name in ('baseline','range_root')};actions={}
  for sp in SP:
   legacy=baseline[pos+'/'+sp+'.joblib'];assert legacy['domain_sha256']==domain(c['base_jobs'][source]['phases'][0]['scenario']);actions[sp]=legacy['actions'];predictions['baseline'][sp]=legacy_predict(legacy,matrices[sp]['X'])
   for recipe in RECIPES:
    p='models/'+recipe+'/'+pos+'-'+sp+'.joblib';m=actual[p];meta=fit['models'][p];require_bracket(s,[c['fit_jobs'][i]['phases'][0]['scenario'] for i in meta['train_ids']]);assert game_key(s) not in meta['train_game_keys'];assert m['actions']==actions[sp] and set(m['domain_sha256s'])=={domain(c['fit_jobs'][i]['phases'][0]['scenario']) for i in meta['train_ids']};assert meta['feature_count']==(246 if recipe=='context_root' else 136)
    predictions[recipe][sp]=batched[jid,sp]
  arms=[]
  for seat,spots in (('ip',('F.cbet','F.vs_xr')),('oop',('F.vs_b33','F.vs_b75'))):
   assert np.array_equal(matrices[spots[0]]['combo_indices'],matrices[spots[1]]['combo_indices'])
   for recipe in ('baseline','range_root'):
    writes=[]
    for sp in spots:
     assert set(actions[sp])==set(j['meta']['expected_children'][sp]);w=dict(node=nodes[sp]['node'],actor=seat.upper(),spec={'table':dict(positive=list(map(int,matrices[sp]['combo_indices'])),actions=actions[sp],F=table(predictions[recipe][sp]))})
     if sp=='F.vs_xr':w['rootlive']=True
     writes.append(w)
    arms.append(dict(name=seat+'_all|'+recipe,writes=writes))
  ph['arms']=arms;jobs[jid]=j;proof.append(dict(id=jid,source_train_id=source,game_key=game_key(s),support=require_bracket(s,[v['phases'][0]['scenario'] for v in c['fit_jobs'].values()]),ROOT_rows={sp:len(matrices[sp]['X']) for sp in SP}))
 files={}
 for tag,co in c['cohorts'].items():
  if co['stage']=='EVALUATION':p=B/('jobs-'+tag+'.json');write(p,[jobs[jid] for jid in co['ids']]);files[str(p)]=sha(p)
 write('EVALUATION-JOBS-SEAL.json',dict(files=files,jobs=16,arms=64,writes=128,proof=proof,policy_import_sha256=sha('POLICY-IMPORT.json'),freeze_sha256=sha('FREEZE.json'),held_out_exact_game_keys=True,held_out_global_ranks=False,live_play=False));print(json.dumps(dict(jobs=16,arms=64,writes=128,files=files)))
if __name__=='__main__':main()
