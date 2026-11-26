"""Independent scalar predictions, exact transferred baseline tables and wire audit."""
import sys,copy,datetime
from pathlib import Path
import numpy as np,joblib
D=Path(__file__).resolve().parents[1];sys.path.insert(0,str(D/'src'))
from common import frozen,read,write,sha,config,SP
from models import predict,table
from dataset import public_matrices,ranges_for,load_dataset
from range_features import features
from pot_scope import require_pot_bracket
from context_scope import game_key
from build_tables import baseline_writes
from candidate_chain import candidate_chain
stage=sys.argv[1];assert stage in ('TRAIN','EVALUATION');frozen();c,g=config();load_dataset();candidate_chain();seal=read(stage+'-JOBS-SEAL.json');assert seal['freeze_sha256']==sha('FREEZE.json') and seal['candidate_sha256']==sha('CANDIDATE-SEAL.json') and seal['fit_sha256']==sha('FIT.json');fit=read('FIT.json');models={}
for p,m in fit['models'].items():assert sha(p)==m['sha256'];models[p]=joblib.load(D/p)
seen=set();count=0;rows=0
for tag,co in c['cohorts'].items():
 if co['stage']!=stage:continue
 assert sha('jobs-'+tag+'.json')==seal['files']['jobs-'+tag+'.json'];jobs=read('jobs-'+tag+'.json');assert [j['id'] for j in jobs]==co['ids']
 for j in jobs:
  assert j['id'] not in seen;seen.add(j['id']);source=j['meta']['source_train_id'];pos=j['meta']['position'];s=j['phases'][0]['scenario'];template=c['training_jobs' if stage=='TRAIN' else 'evaluation_jobs'][j['id']];assert game_key(s)==game_key(template['phases'][0]['scenario']);require_pot_bracket(s,[v['phases'][0]['scenario'] for v in c['fit_jobs'].values()],allow_fitted=stage=='TRAIN');mat=public_matrices(j,c,g);sem=features(mat,ranges_for(j,mat,c,g));arms=j['phases'][0]['arms'];assert len(arms)==4 and len({a['name'] for a in arms})==4
  for seat,spots in [('ip',('F.cbet','F.vs_xr')),('oop',('F.vs_b33','F.vs_b75'))]:
   baseline=next(a for a in arms if a['name']==seat+'_all|baseline');assert baseline['writes']==baseline_writes(c,source,seat),'old policy table changed'
   candidate=next(a for a in arms if a['name']==seat+'_all|range_root');assert len(candidate['writes'])==2
   for sp,w in zip(spots,candidate['writes']):
    m=models['models/range_root/'+pos+'-'+sp+'.joblib'];t=w['spec']['table'];assert t['F']==table(predict(m,sem[sp]['X'])) and t['positive']==list(map(int,mat[sp]['combo_indices'])) and t['actions']==m['actions'];assert bool(w.get('rootlive'))==(sp=='F.vs_xr') and w['actor']==seat.upper() and w['node']==next(h['node'] for h in j['phases'][0]['harvest'] if h['name']==sp);assert np.max(np.abs(np.round(np.array(t['F']),8)-t['F']))<=5.000001e-9
   for a in [baseline,candidate]:
    for w in a['writes']:count+=1;rows+=len(w['spec']['table']['F'])
assert len(seen)==16 and count==128
write('evidence/'+stage+'-table-audit.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,jobs=16,arms=64,writes=count,rows=rows,scalar_batch_wire_ROOT_mask_baseline_identity='PASS',jobs_seal_sha256=sha(stage+'-JOBS-SEAL.json'),fit_sha256=sha('FIT.json'),live_play=False));print(stage+' actual scalar/batched/table/wire/baseline audit PASS')
