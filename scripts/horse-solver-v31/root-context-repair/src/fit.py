"""Two fixed models, one fit each, identical held-exact-context exclusion."""
import sys,io,json
from pathlib import Path
import numpy as np,joblib
from sklearn.ensemble import HistGradientBoostingRegressor
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,SP,RECIPES,config,frozen,read,write,sha,array
from dataset import load_dataset
from models import PARAMS,conditional_targets
from context_scope import require_bracket,game_key
def main():
 frozen();c,g=config();admission=read('FIT-ADMISSION.json');assert admission['accepted'] is True and admission['data_release_sha256']==sha('DATA-RELEASE.json') and admission['freeze_sha256']==sha('FREEZE.json');d=load_dataset();assert not (B/'models').exists();data=[]
 valkeys={game_key(j['phases'][0]['scenario']) for j in c['validation_jobs'].values()}
 for r in d:
  assert r['game_key'] not in valkeys
  z=array(r['features_path'],r['features_sha256']);lab=array(r['label_path'],r['label_sha256']);assert np.array_equal(z['combo_indices'],lab['combo_indices'])
  data.append(dict(r,X=z['X'],S=z['S'],root_mass=z['public_root_mass'],root_weight=lab['root_weight'],F=conditional_targets(lab['frequency'])))
 report={}
 for recipe in RECIPES:
  for pos in ('HJ','UTG'):
   for sp in SP:
    rows=[r for r in data if r['position']==pos and r['spot']==sp];assert len(rows)==52
    for fam in ('PAIR','MONO','UNP2T','UNPR'):assert len({r['sig'] for r in rows if r['family']==fam})>=3,'family rank support'
    for j in c['validation_jobs'].values():
     if j['meta']['position']==pos:require_bracket(j['phases'][0]['scenario'],[c['fit_jobs'][r['id']]['phases'][0]['scenario'] for r in rows])
    feature='X' if recipe=='context_root' else 'S';x=np.concatenate([r[feature] for r in rows]);y=np.concatenate([r['F'] for r in rows]);weights=[]
    for r in rows:
     w=r['root_weight'] if recipe=='context_root' else r['root_mass'];assert np.isfinite(w).all() and np.min(w)>0;w=w/w.sum()
     if recipe=='range_root':w=w/sum(t['family']==r['family'] for t in rows)
     weights.append(w)
    w=np.concatenate(weights);w=w/w.mean();actions=rows[0]['actions'];assert all(r['actions']==actions for r in rows)
    heads=[]
    for k in range(y.shape[1]):h=HistGradientBoostingRegressor(**PARAMS);h.fit(x,y[:,k],sample_weight=w);heads.append(h)
    model=dict(heads=heads,recipe=recipe,position=pos,spot=sp,actions=actions,feature_count=x.shape[1],domain_sha256s=sorted({r['domain'] for r in rows}),input_contract='TRAIN_CONTEXT_RAW246_V1' if recipe=='context_root' else 'TRAIN_CONTEXT_ROOT_RANGE136_V1',live_play=False)
    p=B/'models'/recipe/(pos+'-'+sp+'.joblib');p.parent.mkdir(parents=True,exist_ok=True);assert not p.exists();joblib.dump(model,p)
    report[str(p.relative_to(B))]=dict(sha256=sha(p),train_ids=sorted({r['id'] for r in rows}),train_game_keys=sorted({r['game_key'] for r in rows}),train_global_ranks=sorted({r['sig'] for r in rows}),family_game_counts={f:sum(r['family']==f for r in rows) for f in ('PAIR','MONO','UNP2T','UNPR')},feature_count=x.shape[1],rows=len(x),actions=actions,position=pos,spot=sp)
    print('Fitted',recipe,pos,sp,flush=True)
 frozen();write('FIT.json',dict(models=report,params=PARAMS,fit_games=104,held_exact_games=16,data_release_sha256=sha('DATA-RELEASE.json'),freeze_sha256=sha('FREEZE.json'),held_out_global_ranks=False,held_out_exact_game_keys=True,live_play=False))
 write('CANDIDATE-SEAL.json',dict(fit_sha256=sha('FIT.json'),models=len(report),state='UNQUALIFIED_TRAIN_CONTEXT_CANDIDATES',recipes=list(RECIPES),fitted_once=True,live_play=False));print(json.dumps(read('CANDIDATE-SEAL.json')))
if __name__=='__main__':main()
