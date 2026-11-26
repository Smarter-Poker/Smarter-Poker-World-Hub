"""Once-only TRAIN admission and conditional once-only fresh-context evaluation."""
import sys,json,datetime,math
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,read,write,sha,config,frozen

def compare(rows):
 assert len(rows)==32
 b=np.array([r['baseline'] for r in rows]);v=np.array([r['range_root'] for r in rows]);assert np.isfinite(b).all() and np.isfinite(v).all()
 families={f:dict(baseline=float(np.mean([r['baseline'] for r in rows if r['family']==f])),candidate=float(np.mean([r['range_root'] for r in rows if r['family']==f]))) for f in ['PAIR','MONO','UNP2T','UNPR']}
 relative=bool(v.mean()<=.9*b.mean() and v.max()<=b.max()+.5 and all(x['candidate']<=x['baseline']+.5 for x in families.values()) and families['UNP2T']['candidate']<=families['UNP2T']['baseline']);absolute=bool(np.all(v<=3))
 return dict(eligible=relative and absolute,relative_pass=relative,absolute_pass=absolute,mean=float(v.mean()),max=float(v.max()),baseline_mean=float(b.mean()),baseline_max=float(b.max()),breaches=int((v>3).sum()),family_means=families)

def main(stage):
 from ops import release,technical
 assert stage in ('TRAIN','EVALUATION');frozen();c,g=config();tags=[t for t in c['cohort_order'] if c['cohorts'][t]['stage']==stage];release(tags[0]);claim=stage+'-CLAIM.json';assert not (B/claim).exists()
 if stage=='EVALUATION':assert read('TRAIN-RESULT.json')['stats']['eligible'] is True and read('TRAIN-RESULT.json')['candidate_sha256']==sha('CANDIDATE-SEAL.json')
 for tag in tags:assert read('evidence/technical-'+tag+'.json')['verdict']=='PASS_NATIVE_COPY_A2_TECHNICAL'
 write(claim,dict(at=datetime.datetime.now(datetime.UTC).isoformat(),release_sha256=sha(stage+'-RELEASE.json'),candidate_sha256=sha('CANDIDATE-SEAL.json'),freeze_sha256=sha('FREEZE.json')))
 result,summary=technical([B/('jobs-'+t+'.json') for t in tags],[B/'m1'/('F5P136-'+t) for t in tags]);rows=[]
 for tag in tags:
  for j in read('jobs-'+tag+'.json'):
   pot=j['phases'][0]['scenario']['pot_chips']
   for seat,key in [('ip','oop_mes_chips'),('oop','ip_mes_chips')]:
    row=dict(id=j['id'],source_train_id=j['meta']['source_train_id'],family=j['meta']['family'],position=j['meta']['position'],seat=seat.upper(),pot=pot)
    for recipe in ('baseline','range_root'):
     value=result.delta_vs_eq(j['id'],seat+'_all|'+recipe,key);row[recipe]=100*value.value/pot+value.bound_pct;assert math.isfinite(row[recipe])
    rows.append(row)
 stats=compare(rows);out=dict(at=datetime.datetime.now(datetime.UTC).isoformat(),stage=stage,rows=rows,stats=stats,verdict=('TRAIN_REGRESSION_PASS' if stats['eligible'] else 'TERMINAL_TRAIN_REGRESSION_FAIL') if stage=='TRAIN' else ('POT_CONTEXT_QUALIFICATION_PASS' if stats['eligible'] else 'POT_CONTEXT_QUALIFICATION_FAIL'),candidate_sha256=sha('CANDIDATE-SEAL.json'),fit_sha256=sha('FIT.json'),freeze_sha256=sha('FREEZE.json'),technical_summary=summary,training_exposure=stage=='TRAIN',new_candidate_fullpot600_performance='UNVERIFIED_NOT_CERTIFIED',broader_depth_native_qualification=False,baseline='prior104fit600potpolicytransferredunchanged;historicalTRAINexposure;unqualifiedoffpotcontrol',prior_flop_exposure=True,authored80bbproxy_ranges=True,realistic_preflop_qualification=False,legacy_global_final_qualification=False,held_out_global_ranks=False,live_play=False)
 write(stage+'-RESULT.json',out)
 if stage=='EVALUATION' and stats['eligible']:
  write('CONTEXT-CERTIFICATE.json',dict(state='POT_CONTEXT_INTERPOLATION_QUALIFIED_PROXY_RANGES',candidate_sha256=sha('CANDIDATE-SEAL.json'),fit_sha256=sha('FIT.json'),models=read('FIT.json')['models'],result_sha256=sha('EVALUATION-RESULT.json'),freeze_sha256=sha('FREEZE.json'),scope='16fixed200bb555/585potexactcontexts;fourflopfamiliesHJUTG;laterstreetscurrentequilibrium',freshness=c['freshness'],training_regression_not_qualification=True,new_candidate_fullpot600_performance='UNVERIFIED_NOT_CERTIFIED',broader_depth_native_qualification=False,prior_flop_exposure=True,authored80bbproxy_ranges=True,realistic_preflop_qualification=False,legacy_global_final_qualification=False,held_out_global_ranks=False,live_play=False))
 print(json.dumps({k:v for k,v in out.items() if k not in ('rows','technical_summary')}))
if __name__=='__main__':main(sys.argv[1])
