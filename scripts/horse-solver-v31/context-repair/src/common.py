import json
from pathlib import Path
from prepare import B,P,W,load,write,sha
SP=('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr')
def validate_train_paths(job_paths,harvest_paths):
    report=load(B/'evidence/build-TRAIN.json')
    expected_jobs={Path(p).resolve() for p in report['files']}
    expected_dirs={(B/'m1'/('F5TAIL-TRAIN-'+Path(p).stem.rsplit('-',1)[1])).resolve() for p in report['files']}
    actual_jobs=[Path(p).resolve() for p in job_paths];actual_dirs=[Path(p).resolve() for p in harvest_paths]
    assert len(actual_jobs)==len(expected_jobs) and set(actual_jobs)==expected_jobs,'exact canonical TRAIN job paths required'
    assert len(actual_dirs)==len(expected_dirs) and set(actual_dirs)==expected_dirs,'exact canonical validated TRAIN harvest paths required'
def frozen():
    f=load(B/'FREEZE.json')
    for p,h in f['files'].items():assert sha(p)==h,'frozen input drift: '+p
    return f
def candidate_frozen():
    frozen();f=load(B/'CANDIDATE.json')
    assert f['freeze_sha256']==sha(B/'FREEZE.json')
    for p,h in f['files'].items():assert sha(p)==h,'candidate drift: '+p
    return f
def group_jobs(jobs,stage):
    assert stage=='EVAL'
    normal=[j for j in jobs if j['meta']['family']!='UNPR'];rainbow=[j for j in jobs if j['meta']['family']=='UNPR']
    groups={**{'N%02d'%k:normal[i:i+6] for k,i in enumerate(range(0,len(normal),6))}}
    groups['R00']=rainbow[:1];rainbow=rainbow[1:];start=1
    groups.update({'R%02d'%(k+start):rainbow[i:i+6] for k,i in enumerate(range(0,len(rainbow),6))})
    return {k:v for k,v in groups.items() if v}
def emit(jobs,stage):
    report=dict(stage=stage,freeze_sha256=sha(B/'FREEZE.json') if (B/'FREEZE.json').exists() else None,files={},jobs=len(jobs))
    for suffix,js in group_jobs(jobs,stage).items():
        p=B/('jobs-%s-%s.json'%(stage,suffix));write(p,js);report['files'][str(p)]=dict(jobs=len(js),sha256=sha(p))
    write(B/('evidence/build-'+stage+'.json'),report)
    return report
