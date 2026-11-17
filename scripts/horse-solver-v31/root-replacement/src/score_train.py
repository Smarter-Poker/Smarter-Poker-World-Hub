"""Frozen whole-seat TRAIN screen; no final evaluation admission or activation."""
import sys,math,json,datetime
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,read,write,sha,frozen,config
from models import RECIPES
from ops import release,technical
def compare(rows,name):
 base=np.array([r['baseline'] for r in rows]);cand=np.array([r[name] for r in rows]);means={f:dict(baseline=float(np.mean([r['baseline'] for r in rows if r['family']==f])),candidate=float(np.mean([r[name] for r in rows if r['family']==f]))) for f in ('PAIR','MONO','UNP2T','UNPR')}
 relative=float(cand.mean())<=.9*float(base.mean()) and float(cand.max())<=float(base.max())+.5 and all(v['candidate']<=v['baseline']+.5 for v in means.values()) and means['UNP2T']['candidate']<=means['UNP2T']['baseline']
 absolute=bool(np.all(cand<=3));return dict(eligible=bool(relative and absolute),relative_pass=bool(relative),absolute_pass=absolute,breaches=int((cand>3).sum()),mean=float(cand.mean()),max=float(cand.max()),baseline_mean=float(base.mean()),baseline_max=float(base.max()),family_means=means,selection_key=[max(v['candidate'] for v in means.values()),float(cand.mean()),float(cand.max())])
def main():
 release();assert not (B/'TRAIN-SCREEN.json').exists() and not (B/'TRAIN-SCREEN-CLAIM.json').exists();write('TRAIN-SCREEN-CLAIM.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),release_sha256=sha('NATIVE-RELEASE.json'),role='TRAIN_SCREEN'))
 jobs=[B/('jobs-TRAIN-'+s+'.json') for s in ('N00','N01','R00','R01')];dirs=[B/'m1'/('F5ROOT-TRAIN-'+s) for s in ('N00','N01','R00','R01')];r,summary=technical(jobs,dirs);rows=[]
 for p in jobs:
  for j in json.loads(p.read_bytes()):
   for seat,key in (('ip','oop_mes_chips'),('oop','ip_mes_chips')):
    row=dict(id=j['id'],source_train_id=j['meta']['source_train_id'],family=j['meta']['family'],position=j['meta']['position'],seat=seat.upper(),fold=j['meta']['held_out_fold'])
    for name in ('baseline',*RECIPES):
     v=r.delta_vs_eq(j['id'],seat+'_all|'+name,key);value=100*v.value/j['phases'][0]['scenario']['pot_chips']+v.bound_pct;assert math.isfinite(value);row[name]=value
    rows.append(row)
 assert len(rows)==32;stats={name:compare(rows,name) for name in RECIPES};eligible=[n for n in RECIPES if stats[n]['eligible']];selected=min(eligible,key=lambda n:(stats[n]['selection_key'],n!='independent_root')) if eligible else None
 out=dict(at=datetime.datetime.now(datetime.UTC).isoformat(),verdict='TRAIN_SCREEN_PASS' if selected else 'TRAIN_SCREEN_FAIL',selected_recipe=selected,stats=stats,rows=rows,technical_summary=summary,live_play=False,final_qualification=False,old_evaluations_used=False)
 write('TRAIN-SCREEN.json',out);print(json.dumps({k:v for k,v in out.items() if k not in ('rows','technical_summary')}))
 if selected:
  from fit_roots import training_rows,fit_set
  models=fit_set(training_rows(),selected,None);write('REPLACEMENT-CANDIDATE.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),recipe=selected,models=models,screen_sha256=sha('TRAIN-SCREEN.json'),freeze_sha256=sha('FREEZE.json'),state='UNQUALIFIED_FINAL_REFIT',live_play=False));print('Selected all88 refit sealed; no final qualification performed')
if __name__=='__main__':main()
