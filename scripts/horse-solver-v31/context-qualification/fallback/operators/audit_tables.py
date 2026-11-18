import sys,json,datetime,subprocess,io
from pathlib import Path
import numpy as np,joblib
B=Path(__file__).resolve().parents[1];sys.path.insert(0,str(B/'src'))
from common import config,frozen,read,write,sha,domain,SP,RECIPES
from public_data import public_matrices,ranges_for
from range_features import features
from models import predict,table
from build_evaluation import legacy_predict
from context_scope import game_key,require_bracket,stack_only_matrix
from ops import budget,events,idle,remote_ps,REMOTE,HELPER,W
frozen();c,g=config();fit={'models':c['models']};seal=read('EVALUATION-JOBS-SEAL.json');assert seal['policy_import_sha256']==sha('POLICY-IMPORT.json') and seal['freeze_sha256']==sha('FREEZE.json')
models={}
for p,v in fit['models'].items():models[p]=joblib.load(io.BytesIO(g.read(v['path'],'MODEL')))
legacy={k:joblib.load(io.BytesIO(g.read(p,'MODEL'))) for k,p in c['baseline_models'].items()};total_rows=0;total_writes=0;seen=set()
for tag,co in c['cohorts'].items():
 if co['stage']!='EVALUATION':continue
 p=B/('jobs-'+tag+'.json');assert sha(p)==seal['files'][str(p)];jobs=read(p);assert [j['id'] for j in jobs]==co['ids']
 for j in jobs:
  assert j['id'] not in seen;seen.add(j['id']);source=j['meta']['source_train_id'];pos=j['meta']['position'];s=j['phases'][0]['scenario'];assert game_key(s)==game_key(c['evaluation_jobs'][j['id']]['phases'][0]['scenario']);require_bracket(s,[v['phases'][0]['scenario'] for v in c['fit_jobs'].values()])
  mats=public_matrices(source,c,g)
  for sp in SP:mats[sp]['X']=stack_only_matrix(mats[sp]['X'],c['base_jobs'][source]['phases'][0]['scenario'],s)
  sem=features(mats,ranges_for(j,mats,c,g));expected={};actions={};nodes={v['name']:v['node'] for v in j['phases'][0]['harvest']}
  for sp in SP:
   lm=legacy[pos+'/'+sp+'.joblib'];actions[sp]=lm['actions'];assert lm['domain_sha256']==domain(c['base_jobs'][source]['phases'][0]['scenario']);expected['baseline',sp]=table(legacy_predict(lm,mats[sp]['X']))
   for recipe in RECIPES:
    p='models/'+recipe+'/'+pos+'-'+sp+'.joblib';m=models[p];v=fit['models'][p];require_bracket(s,[c['fit_jobs'][i]['phases'][0]['scenario'] for i in v['train_ids']]);assert game_key(s) not in v['train_game_keys'] and m['actions']==actions[sp] and set(m['domain_sha256s'])=={domain(c['fit_jobs'][i]['phases'][0]['scenario']) for i in v['train_ids']};expected[recipe,sp]=table(predict(m,mats[sp]['X'] if recipe=='context_root' else sem[sp]['X']))
  arms=j['phases'][0]['arms'];assert len(arms)==4 and len({a['name'] for a in arms})==4
  for a in arms:
   seat,recipe=a['name'].split('_all|');spots=('F.cbet','F.vs_xr') if seat=='ip' else ('F.vs_b33','F.vs_b75');assert len(a['writes'])==2
   for w,sp in zip(a['writes'],spots):
    t=w['spec']['table'];assert w['node']==nodes[sp] and w['actor']==seat.upper() and t['actions']==actions[sp] and t['positive']==list(map(int,mats[sp]['combo_indices'])) and t['F']==expected[recipe,sp]
    assert bool(w.get('rootlive'))==(sp=='F.vs_xr');assert np.max(np.abs(np.round(np.array(t['F']),8)-t['F']))<=5.000001e-9;total_rows+=len(t['F']);total_writes+=1
assert len(seen)==16 and total_writes==128
write('evidence/EVALUATION-table-audit.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,jobs=16,arms=64,writes=128,rows=total_rows,actual_predictions_ROOT_masks_actions_wire_and_support='PASS',live_play=False))
print(json.dumps(dict(accepted=True,jobs=16,arms=64,writes=128,rows=total_rows)))
