import sys,json,datetime,io
from pathlib import Path
import numpy as np
B=Path(__file__).resolve().parents[1];sys.path.insert(0,str(B/'src'))
from common import frozen,read,write,sha,config,array,SP,probability
from dataset import load_dataset
from context_scope import game_key,require_bracket
frozen();c,g=config();d=load_dataset();seal=read('DATA-RELEASE.json');assert seal['accepted'] is True and seal['freeze_sha256']==sha('FREEZE.json')
assert seal['fit_games']==104 and seal['nodes']==416 and len(seal['native_sources'])==32
for p,h in seal['native_sources'].items():assert sha(p)==h
assert len(c['fit_old_records'])==288 and len(c['validation_jobs'])==16 and len(c['harvest_jobs'])==32
valkeys={game_key(j['phases'][0]['scenario']) for j in c['validation_jobs'].values()};fitkeys={game_key(j['phases'][0]['scenario']) for j in c['fit_jobs'].values()};assert len(valkeys)==16 and len(fitkeys)==104 and not valkeys&fitkeys
rows=0;counts={}
for r in d:
 assert r['game_key'] in fitkeys and r['game_key'] not in valkeys and r['id'] in c['fit_jobs']
 x=array(r['features_path'],r['features_sha256']);y=array(r['label_path'],r['label_sha256']);ci=x['combo_indices'];assert np.array_equal(ci,y['combo_indices']) and x['X'].shape==(len(ci),246) and x['S'].shape==(len(ci),136)
 assert np.isfinite(x['X']).all() and np.isfinite(x['S']).all() and np.all(x['public_root_mass']>0) and np.all(y['root_weight']>0);probability(y['frequency']);rows+=len(ci);counts[r['stack']]=counts.get(r['stack'],0)+1
for j in c['validation_jobs'].values():require_bracket(j['phases'][0]['scenario'],[v['phases'][0]['scenario'] for v in c['fit_jobs'].values()])
assert counts=={20000:288,18000:64,22000:64}
write('FIT-ADMISSION.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,review='root owner actual data and native provenance; no independent review claimed',data_release_sha256=sha('DATA-RELEASE.json'),freeze_sha256=sha('FREEZE.json'),dataset_sha256=sha('DATASET.json'),fit_games=104,held_exact_games=16,nodes=416,rows=rows,stack_node_counts=counts,held_out_global_ranks=False,live_play=False))
print(json.dumps(read('FIT-ADMISSION.json')))
