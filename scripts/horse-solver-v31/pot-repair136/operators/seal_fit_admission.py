"""Actual ROOT alignment/admission for104sealed plus32reused TRAIN games."""
import sys,datetime
from pathlib import Path
import numpy as np
D=Path(__file__).resolve().parents[1];sys.path.insert(0,str(D/'src'))
from common import frozen,read,write,sha,config,array,probability
from dataset import load_dataset,public_matrices,ranges_for
from range_features import ACTOR,features
import json
from context_scope import game_key
from pot_scope import require_pot_bracket
frozen();c,g=config();d=load_dataset();seal=read('DATA-RELEASE.json');assert seal['accepted'] is True and seal['freeze_sha256']==sha('FREEZE.json') and seal['fit_games']==136 and seal['nodes']==544 and len(seal['native_sources'])==32
trainkeys={game_key(j['phases'][0]['scenario']) for j in c['fit_jobs'].values()};evalkeys={game_key(j['phases'][0]['scenario']) for j in c['evaluation_jobs'].values()};assert len(trainkeys)==136 and len(evalkeys)==16 and not trainkeys&evalkeys
rows=0;counts={};contexts={}
for jid,j in c['fit_jobs'].items():
 m=public_matrices(j,c,g);rg=ranges_for(j,m,c,g);contexts[jid]=(m,rg,features(m,rg))
for r in d:
 assert r['game_key'] in trainkeys and r['game_key'] not in evalkeys
 job=c['fit_jobs'][r['id']];m,rg,sem=contexts[r['id']];assert r['game_key']==game_key(job['phases'][0]['scenario']);assert r['actions']==sorted(job['meta']['expected_children'][r['spot']])
 x=array(r['features_path'],r['features_sha256']);y=array(r['label_path'],r['label_sha256']);ci=x['combo_indices'];assert np.array_equal(ci,y['combo_indices']) and x['X'].shape==(len(ci),246) and x['S'].shape==(len(ci),136) and np.isfinite(x['S']).all() and np.all(x['public_root_mass']>0) and np.all(y['root_weight']>0);assert np.array_equal(x['X'],m[r['spot']]['X']) and np.array_equal(x['S'],sem[r['spot']]['X']) and np.array_equal(x['public_root_mass'],sem[r['spot']]['public_root_mass'])
 probability(y['frequency']);assert np.array_equal(ci,m[r['spot']]['combo_indices']) and np.array_equal(y['root_weight'],rg[ACTOR[r['spot']]][ci])
 if r['id'] in c['reused_native'] or r['id'] in c['harvest_jobs']:
  if r['id'] in c['reused_native']:native=json.loads(g.read(c['reused_native'][r['id']]['path'],'TRAIN'))
  else:
   tag=next(t for t,v in c['cohorts'].items() if r['id'] in v['ids']);native=read(D/'m1'/('F5P136-'+tag)/(r['id']+'.json'))
  h=native['phases'][0]['harvest'][r['spot']];freq=np.column_stack([h['frequencies'][a] for a in r['actions']])[ci];freq=freq/freq.sum(1,keepdims=True);assert np.array_equal(y['frequency'],freq),'teacher/action/combo label mismatch'
 rows+=len(ci);key=str((r['pot'],r['stack']));counts[key]=counts.get(key,0)+1
assert counts=={'(600, 20000)':352,'(600, 18000)':64,'(600, 22000)':64,'(540, 20000)':32,'(575, 20000)':32}
for j in c['evaluation_jobs'].values():require_pot_bracket(j['phases'][0]['scenario'],[v['phases'][0]['scenario'] for v in c['fit_jobs'].values()])
write('FIT-ADMISSION.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,data_release_sha256=sha('DATA-RELEASE.json'),freeze_sha256=sha('FREEZE.json'),dataset_sha256=sha('DATASET.json'),fit_games=136,held_exact_games=16,nodes=544,rows=rows,context_node_counts=counts,live_play=False))
print('Actual136game ROOT labels/features/heldkeys admitted for one fixed fit')
