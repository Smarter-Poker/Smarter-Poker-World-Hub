"""One TRAIN context screen; never a final evaluation or live release."""
import sys,json,math,datetime
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,RECIPES,config,read,write,sha
from ops import release,technical
def compare(rows,name):
 base=np.array([r['baseline'] for r in rows]);v=np.array([r[name] for r in rows]);families={f:dict(baseline=float(np.mean([r['baseline'] for r in rows if r['family']==f])),candidate=float(np.mean([r[name] for r in rows if r['family']==f]))) for f in ('PAIR','MONO','UNP2T','UNPR')}
 relative=float(v.mean())<=.9*float(base.mean()) and float(v.max())<=float(base.max())+.5 and all(x['candidate']<=x['baseline']+.5 for x in families.values()) and families['UNP2T']['candidate']<=families['UNP2T']['baseline'];absolute=bool(np.all(v<=3))
 return dict(eligible=bool(relative and absolute),relative_pass=bool(relative),absolute_pass=absolute,mean=float(v.mean()),max=float(v.max()),baseline_mean=float(base.mean()),baseline_max=float(base.max()),breaches=int((v>3).sum()),family_means=families,selection_key=[max(x['candidate'] for x in families.values()),float(v.mean()),float(v.max())])
def main():
 release('V-N00');assert not (B/'TRAIN-SCREEN-CLAIM.json').exists() and not (B/'TRAIN-SCREEN.json').exists();write('TRAIN-SCREEN-CLAIM.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),role='TRAIN_CONTEXT_SCREEN',release_sha256=sha('SCREEN-RELEASE.json')))
 c,_=config();tags=[t for t in c['cohort_order'] if c['cohorts'][t]['stage']=='SCREEN']
 for t in tags:assert read('evidence/technical-'+t+'.json')['verdict']=='PASS_NATIVE_COPY_A2_TECHNICAL'
 result,summary=technical([B/('jobs-TRAIN-'+t+'.json') for t in tags],[B/'m1'/('F5RCTX-'+t) for t in tags]);rows=[]
 for tag in tags:
  for j in read('jobs-TRAIN-'+tag+'.json'):
   for seat,key in (('ip','oop_mes_chips'),('oop','ip_mes_chips')):
    row=dict(id=j['id'],source_train_id=j['meta']['source_train_id'],family=j['meta']['family'],position=j['meta']['position'],seat=seat.upper())
    for recipe in ('baseline',*RECIPES):
     v=result.delta_vs_eq(j['id'],seat+'_all|'+recipe,key);value=100*v.value/j['phases'][0]['scenario']['pot_chips']+v.bound_pct;assert math.isfinite(value);row[recipe]=value
    rows.append(row)
 assert len(rows)==32;stats={r:compare(rows,r) for r in RECIPES};eligible=[r for r in RECIPES if stats[r]['eligible']];selected=min(eligible,key=lambda r:(stats[r]['selection_key'],r!='context_root')) if eligible else None
 out=dict(at=datetime.datetime.now(datetime.UTC).isoformat(),verdict='TRAIN_CONTEXT_SCREEN_PASS' if selected else 'TRAIN_CONTEXT_SCREEN_FAIL',selected_recipe=selected,stats=stats,rows=rows,technical_summary=summary,held_out_exact_game_keys=True,held_out_global_ranks=False,prior_TRAIN_design_exposure=True,final_qualification=False,live_play=False,consumed_evaluations_used=False)
 write('TRAIN-SCREEN.json',out)
 if selected:write('CONTEXT-CANDIDATE.json',dict(recipe=selected,fit_sha256=sha('FIT.json'),candidate_seal_sha256=sha('CANDIDATE-SEAL.json'),screen_sha256=sha('TRAIN-SCREEN.json'),state='TRAIN_CONTEXT_VALIDATED_UNQUALIFIED',scope='stack-bracketed exact-context development TRAIN proof; not global-rank proof',live_play=False,final_evaluation_authorized=False))
 print(json.dumps({k:v for k,v in out.items() if k not in ('rows','technical_summary')}))
if __name__=='__main__':main()
