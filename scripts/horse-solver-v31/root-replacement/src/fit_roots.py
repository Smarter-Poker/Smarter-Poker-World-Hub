"""Two predeclared replacements; held-out global ranks never enter fold fitting."""
import sys,json
from pathlib import Path
import numpy as np,joblib
from sklearn.ensemble import HistGradientBoostingRegressor
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,SP,config,frozen,dataset,array,write,sha,read
from models import RECIPES,PARAMS,probability,joint_targets
def train(rows,actions,recipe,position,spot):
 x=np.concatenate([r['x'] for r in rows]);y=np.concatenate([r['f'] for r in rows]);w=np.concatenate([r['w']/r['w'].sum() for r in rows]);w=w/w.mean();heads=[]
 assert len({r['sig'] for r in rows})>=3 and len({r['domain'] for r in rows})==1
 for k in range(y.shape[1]):
  h=HistGradientBoostingRegressor(**PARAMS);h.fit(x,y[:,k],sample_weight=w);heads.append(h)
 return dict(heads=heads,actions=actions,recipe=recipe,position=position,spot=spot,domain_sha256=rows[0]['domain'],feature_count=246,input_contract='PUBLIC_ROOT_CBET' if spot=='IP.joint' else 'PUBLIC_ROOT_SPOT')
def training_rows():
 records=dataset();out={}
 for r in records:
  z=array(r['x_path'],r['x_sha256']);y=array(r['label_path'],r['label_sha256']);f=probability(y['frequency']);w=y['root_weight'];assert np.all(w>0) and np.isfinite(w).all()
  out[(r['id'],r['spot'])]=dict(r,x=z['X'],f=f,w=w,combo_indices=z['combo_indices'])
 return out
def fit_set(data,recipe,fold):
 chosen=[r for r in data.values() if fold is None or r['fold']!=fold];report={};folder=B/'models'/recipe/('all' if fold is None else 'fold%d'%fold);folder.mkdir(parents=True,exist_ok=False)
 for pos in ('HJ','UTG'):
  spots=SP if recipe=='independent_root' else ('IP.joint','F.vs_b33','F.vs_b75')
  for sp in spots:
   if sp=='IP.joint':
    rs=[]
    for r in chosen:
     if r['position']!=pos or r['spot']!='F.cbet':continue
     xr=data[(r['id'],'F.vs_xr')];assert xr['fold']==r['fold'] and np.array_equal(xr['combo_indices'],r['combo_indices'])
     rs.append(dict(r,f=joint_targets(r['f'],xr['f'],r['actions'],xr['actions'])))
    acts=['check','b75','b33_call','b33_fold']
   else:
    rs=[r for r in chosen if r['position']==pos and r['spot']==sp];acts=rs[0]['actions'];assert all(r['actions']==acts for r in rs)
   assert rs and (fold is None or all(r['fold']!=fold for r in rs));model=train(rs,acts,recipe,pos,sp);p=folder/(pos+'-'+sp+'.joblib');joblib.dump(model,p)
   report[str(p.relative_to(B))]=dict(sha256=sha(p),position=pos,spot=sp,train_ids=sorted({r['id'] for r in rs}),train_ranks=sorted({r['sig'] for r in rs}),held_out_fold=fold,rows=sum(len(r['f']) for r in rs))
 return report
def main():
 frozen();assert not (B/'models').exists();data=training_rows();report={}
 for recipe in RECIPES:
  for fold in range(3):report.update(fit_set(data,recipe,fold))
 write('FOLD-MODELS.json',dict(models=report,params=PARAMS,dataset_sha256=sha('DATASET.json'),freeze_sha256=sha('FREEZE.json'),recipes=list(RECIPES),live_play=False));write('FOLD-MODELS-SEAL.json',dict(sha256=sha('FOLD-MODELS.json'),models=len(report),fitted_once=True,TRAIN_only=True));print(json.dumps(read('FOLD-MODELS-SEAL.json')))
if __name__=='__main__':main()
