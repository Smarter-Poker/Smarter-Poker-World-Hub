"""Frozen TRAIN-only target correction and two architecture recipes; no EVAL input."""
import json,sys
from pathlib import Path
import joblib,numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
sys.path.insert(0,str(Path(__file__).resolve().parent))
from prepare import B,P,O,load,write,sha,order
from common import frozen
from candidate import domain
from targets import project_teacher,ROOT_SOLVE_TOLERANCE_BB
sys.path.insert(0,str(P/'hv31-next-round-01a1e479/src'))
from exact_strategy import predict
SP=('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr')
PARAMS=dict(max_iter=200,max_leaf_nodes=31,min_samples_leaf=20,l2_regularization=1.,early_stopping=False,random_state=731)
RECIPES=('projected_pool','projected_two_tone')
def train(rows,key):
 acts=rows[0]['acts'];x=np.concatenate([r['x'] for r in rows]);y=np.concatenate([r['target'] for r in rows]);w=np.concatenate([r['mu']/r['mu'].sum() for r in rows]);w=w/w.mean()
 heads=[]
 for k in range(len(acts)):
  h=HistGradientBoostingRegressor(**PARAMS);h.fit(x,y[:,k],sample_weight=w);heads.append(h)
 return dict(heads=heads,actions=acts,domain_sha256=key)
def loss(model,row):
 q=row['q'];fr=predict(model,row['x']);return float(np.average(np.maximum(0,np.max(q,axis=1)-np.sum(fr*q,axis=1)),weights=row['mu']))
def selection(rows):
 means={f:float(np.mean([r['regret_bb'] for r in rows if r['family']==f])) for f in ('PAIR','MONO','UNP2T','UNPR')}
 return (max(means.values()),float(np.mean([r['regret_bb'] for r in rows])))
def main():
 frozen();release=load(B/'PREFIT-RELEASE.json');assert release['accepted'] is True and release['freeze_sha256']==sha(B/'FREEZE.json')
 review=Path(release['reviewer_path']);assert sha(review)==release['reviewer_sha256'] and 'ACCEPT' in review.read_text()
 for path,digest in release['files'].items():assert sha(path)==digest,'prefit release drift'
 inputs=load(B/'TRAIN-INPUTS.json');assert inputs['source_role']=='TRAIN_ONLY'
 for p,h in inputs['input_pins'].items():assert sha(p)==h,'TRAIN source drift'
 allowed=set(inputs['job_ids']);jobs={j['id']:j for j in load(O/'spec.json') if j['meta']['role']=='TRAIN' and j['id'] in allowed};assert set(jobs)==allowed
 assert load(O/'evidence/TRAIN-result.json')['verdict']=='PASS_TRAIN_TECHNICAL'
 datasets={};domains={};coverage={};target_audit=[]
 for sp in SP:
  d=O/'features'/sp;meta=load(d/'meta.json');x=np.load(d/'X.npy');y=np.load(d/'Y.npy');mu=np.load(d/'w.npy');offset=0
  for row in meta:
   count=row['rows'];ix=slice(offset,offset+count);offset+=count
   if row['scenario_id'] not in jobs:continue
   j=jobs[row['scenario_id']];assert row['split']=='TRAIN' and j['meta']['sig'] not in inputs['excluded_new_eval_ranks'];pos=j['meta']['position'];key=domain(j['phases'][0]['scenario']);a=len(row['actions']);q=y[ix,1:1+a];f=y[ix,1+a:];target=project_teacher(q,f)
   r=dict(x=x[ix],q=q,target=target,mu=mu[ix],sig=j['meta']['sig'],id=j['id'],family=j['meta']['family'],acts=row['actions'],domain=key)
   datasets.setdefault((pos,sp),[]).append(r);domains[key]=dict(position=pos)
   target_audit.append(dict(id=j['id'],spot=sp,rows=count,corrected_rows=int(np.any(abs(target-f)>1e-12,axis=1).sum()),teacher_regret_bb=float(np.average(q.max(axis=1)-(q*f).sum(axis=1),weights=r['mu'])),projected_regret_bb=float(np.average(q.max(axis=1)-(q*target).sum(axis=1),weights=r['mu']))))
  assert offset==len(x)==len(y)==len(mu)
 assert len(datasets)==8
 ranks=sorted({r['sig'] for rs in datasets.values() for r in rs},key=lambda s:order('cv:'+s));fold={s:i%3 for i,s in enumerate(ranks)};cv={k:[] for k in RECIPES}
 for (pos,sp),rs in sorted(datasets.items()):
  assert len({r['sig'] for r in rs})>=6 and len({tuple(r['acts']) for r in rs})==1
  for k in range(3):
   tr=[r for r in rs if fold[r['sig']]!=k];va=[r for r in rs if fold[r['sig']]==k];assert va and len({r['sig'] for r in tr})>=3
   pooled=train(tr,rs[0]['domain']);special=None
   if sp!='F.vs_xr':
    two=[r for r in tr if r['family']=='UNP2T'];assert len({r['sig'] for r in two})>=3
    special=train(two,rs[0]['domain'])
   for r in va:
    for rec in RECIPES:
     model=special if rec=='projected_two_tone' and r['family']=='UNP2T' and sp!='F.vs_xr' else pooled
     cv[rec].append(dict(position=pos,spot=sp,id=r['id'],sig=r['sig'],family=r['family'],fold=k,regret_bb=loss(model,r)))
 scores={k:selection(v) for k,v in cv.items()};chosen=min(RECIPES,key=lambda k:(scores[k],k!='projected_pool'))
 out=B/'models';out.mkdir();models={}
 for (pos,sp),rs in sorted(datasets.items()):
  groups={'':rs}
  if chosen=='projected_two_tone' and sp!='F.vs_xr':groups['-UNP2T']=[r for r in rs if r['family']=='UNP2T']
  for suffix,subset in groups.items():
   assert len({r['sig'] for r in subset})>=6
   model=train(subset,rs[0]['domain']);model['recipe']=chosen;d=out/pos;d.mkdir(exist_ok=True);p=d/(sp+suffix+'.joblib');joblib.dump(model,p);models[str(p.relative_to(out))]=sha(p);coverage[pos+'/'+sp+suffix]=len({r['sig'] for r in subset})
 report=dict(recipe=chosen,params=PARAMS,cv_selection_scores=scores,cv_rows=cv,global_rank_folds=fold,domains=domains,model_sha256=models,support=coverage,training_only=True,EVAL_read=False,freeze_sha256=sha(B/'FREEZE.json'),train_inputs_sha256=sha(B/'TRAIN-INPUTS.json'),target_tolerance_bb=ROOT_SOLVE_TOLERANCE_BB,target_audit=target_audit,prefit_release_sha256=sha(B/'PREFIT-RELEASE.json'))
 write(out/'fit.json',report);print(json.dumps({k:report[k] for k in ('recipe','cv_selection_scores','support')}))
if __name__=='__main__':main()
