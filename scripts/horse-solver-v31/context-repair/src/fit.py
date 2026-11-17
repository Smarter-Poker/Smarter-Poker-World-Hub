"""Two fixed TRAIN-only recipes, three rank-group folds; DEV/FINAL never opened."""
import hashlib,json,sys
from pathlib import Path
import joblib,numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
sys.path.insert(0,str(Path(__file__).resolve().parent))
from prepare import B,P,load,write,sha,order
from candidate import domain
sys.path.insert(0,str(P/'hv31-next-round-01a1e479/src'))
from exact_strategy import predict
SP=('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr')
PARAMS=dict(max_iter=150,max_leaf_nodes=31,min_samples_leaf=20,l2_regularization=1.,early_stopping=False,random_state=731)
def weights(mu,q,recipe):
    w=mu/mu.sum()
    if recipe=='balanced_regret':
        w=(.5*w+.5/len(w))*(1+np.minimum(np.ptp(q,axis=1)/6.,10.))
        w=w/w.sum()
    return w
def train(x,y,w,acts,key):
    assert np.isfinite(w).all() and np.all(w>0)
    w=w/w.mean() # preserve original trainer's effective L2/sample-weight scale
    heads=[]
    for k in range(len(acts)):
        h=HistGradientBoostingRegressor(**PARAMS);h.fit(x,y[:,k],sample_weight=w);heads.append(h)
    return dict(heads=heads,actions=acts,domain_sha256=key,recipe='assigned-by-fit-report')
def main():
    for p,h in load(B/'FREEZE.json')['files'].items():assert sha(p)==h
    jobs={j['id']:j for j in load(B/'spec.json') if j['meta']['role']=='TRAIN'}
    provenance=load(B/'features/PROVENANCE.json')
    assert provenance['freeze_sha256']==sha(B/'FREEZE.json') and provenance['source_sha256']==sha(B/'src/features.py') and provenance['role']=='TRAIN'
    assert provenance['job_ids']==sorted(jobs) and len(provenance['harvest'])==len(jobs)
    for p,h in {**provenance['features'],**provenance['harvest']}.items():assert sha(p)==h,'TRAIN feature/source drift'
    datasets={};domains={}
    for sp in SP:
        d=B/'features'/sp;m=load(d/'meta.json');x=np.load(d/'X.npy');y=np.load(d/'Y.npy');mu=np.load(d/'w.npy');offset=0
        assert len(x)==len(y)==len(mu)
        for row in m:
            j=jobs[row['scenario_id']];assert row['split']=='TRAIN'
            k=row['rows'];ix=slice(offset,offset+k);offset+=k;pos=j['meta']['position'];key=domain(j['phases'][0]['scenario'])
            datasets.setdefault((pos,sp),[]).append(dict(x=x[ix],y=y[ix],mu=mu[ix],sig=j['meta']['sig'],id=j['id'],acts=row['actions'],domain=key))
            domains[key]=dict(position=pos)
        assert offset==len(x)
    assert len(datasets)==8
    fold={};ranks=sorted({r['sig'] for rs in datasets.values() for r in rs},key=lambda s:order('cv:'+s))
    for i,s in enumerate(ranks):fold[s]=i%3
    cv={r:[] for r in ('matchup','balanced_regret')}
    for (pos,sp),rs in sorted(datasets.items()):
        assert len({r['sig'] for r in rs})>=6,'insufficient distinct TRAIN support; no fallback'
        acts=rs[0]['acts'];a=len(acts);assert all(r['acts']==acts for r in rs)
        for f in range(3):
            tr=[r for r in rs if fold[r['sig']]!=f];va=[r for r in rs if fold[r['sig']]==f]
            assert len({r['sig'] for r in tr})>=3 and va,'missing grouped support'
            for recipe in cv:
                x=np.concatenate([r['x'] for r in tr]);y=np.concatenate([r['y'][:,1+a:] for r in tr]);w=np.concatenate([weights(r['mu'],r['y'][:,1:1+a],recipe) for r in tr])
                model=train(x,y,w,acts,rs[0]['domain'])
                for r in va:
                    q=r['y'][:,1:1+a];fr=predict(model,r['x']);loss=np.maximum(0,np.max(q,axis=1)-np.sum(fr*q,axis=1))
                    cv[recipe].append(dict(position=pos,spot=sp,id=r['id'],sig=r['sig'],fold=f,regret_bb=float(np.average(loss,weights=r['mu']))))
    means={r:float(np.mean([x['regret_bb'] for x in rows])) for r,rows in cv.items()}
    chosen=min(means,key=lambda r:(means[r],r!='matchup'))
    out=B/'models';out.mkdir();models={}
    for (pos,sp),rs in sorted(datasets.items()):
        acts=rs[0]['acts'];a=len(acts);x=np.concatenate([r['x'] for r in rs]);y=np.concatenate([r['y'][:,1+a:] for r in rs]);w=np.concatenate([weights(r['mu'],r['y'][:,1:1+a],chosen) for r in rs])
        model=train(x,y,w,acts,rs[0]['domain']);model['recipe']=chosen
        d=out/pos;d.mkdir(exist_ok=True);f=d/(sp+'.joblib');joblib.dump(model,f);models[str(f.relative_to(out))]=sha(f)
    report=dict(recipe=chosen,params=PARAMS,cv_mean_regret_bb=means,cv_rows=cv,global_rank_folds=fold,domains=domains,model_sha256=models,training_only=True,DEV_or_FINAL_read=False,freeze_sha256=sha(B/'FREEZE.json'),support={pos+'/'+sp:len({r['sig'] for r in rs}) for (pos,sp),rs in datasets.items()})
    write(out/'fit.json',report);print(json.dumps({k:report[k] for k in ('recipe','cv_mean_regret_bb','support')}))
if __name__=='__main__':main()
