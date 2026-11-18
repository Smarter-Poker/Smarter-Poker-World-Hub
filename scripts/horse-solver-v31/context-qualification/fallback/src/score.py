"""One context evaluation claim; JD diagnostic has no candidate influence."""
import sys,json,datetime,math
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,read,write,sha,config

def compare(rows):
 b=np.array([r['baseline'] for r in rows]);v=np.array([r['range_root'] for r in rows]);families={f:dict(baseline=float(np.mean([r['baseline'] for r in rows if r['family']==f])),candidate=float(np.mean([r['range_root'] for r in rows if r['family']==f]))) for f in ['PAIR','MONO','UNP2T','UNPR']};relative=bool(v.mean()<=.9*b.mean() and v.max()<=b.max()+.5 and all(x['candidate']<=x['baseline']+.5 for x in families.values()) and families['UNP2T']['candidate']<=families['UNP2T']['baseline']);absolute=bool(np.all(v<=3));return dict(eligible=relative and absolute,relative_pass=relative,absolute_pass=absolute,mean=float(v.mean()),max=float(v.max()),baseline_mean=float(b.mean()),baseline_max=float(b.max()),breaches=int((v>3).sum()),family_means=families)
def main(stage):
 from ops import release,technical
 assert stage in ['EVALUATION','JD'];range_profile_status=read('RANGE-STATUS.json');assert range_profile_status['realistic_preflop_qualification'] is False;c,g=config();tags=[t for t in c['cohort_order'] if c['cohorts'][t]['stage']==stage];release(tags[0]);claim=stage+'-CLAIM.json';assert not (B/claim).exists()
 for t in tags:assert read('evidence/technical-'+t+'.json')['verdict']=='PASS_NATIVE_COPY_A2_TECHNICAL'
 write(claim,dict(at=datetime.datetime.now(datetime.UTC).isoformat(),release_sha256=sha(stage+'-RELEASE.json')));r,summary=technical([B/('jobs-'+t+'.json') for t in tags],[B/'m1'/('F5FB-'+t) for t in tags]);rows=[]
 reference={}
 if stage=='JD':
  old=g.json(c['jd_reference_result'],'TRAIN');reference={(x['source_train_id'],x['seat']):x for x in old['rows']}
 for t in tags:
  for j in read('jobs-'+t+'.json'):
   pot=j['phases'][0]['scenario']['pot_chips']
   for seat,key in [('ip','oop_mes_chips'),('oop','ip_mes_chips')]:
    row=dict(id=j['id'],source_train_id=j['meta']['source_train_id'],family=j['meta']['family'],position=j['meta']['position'],seat=seat.upper(),pot=pot)
    for recipe in (['baseline','range_root'] if stage=='EVALUATION' else ['range_root']):
     v=r.delta_vs_eq(j['id'],seat+'_all|'+recipe,key);value=100*v.value/pot+v.bound_pct;assert math.isfinite(value);row[recipe]=value
    if stage=='JD':
     loss=r.delta_vs_eq(j['id'],seat+'_all|range_root','ev_'+seat+'_chips');row['loss_pct']=-100*loss.value/pot;row['loss_bound_pct']=loss.bound_pct;row['drop_chips']=j['meta']['drop_chips'];row['reference_fullpot_X_pct']=reference[row['source_train_id'],seat.upper()]['range_root'];row['reference_X_renormalized_to_JD_pot']=row['reference_fullpot_X_pct']*600/pot;row['delta_vs_reference_X_pct']=row['range_root']-row['reference_X_renormalized_to_JD_pot']
    rows.append(row)
 assert len(rows)==32;out=dict(at=datetime.datetime.now(datetime.UTC).isoformat(),stage=stage,rows=rows,range_profile_status=range_profile_status,technical_summary=summary,live_play=False,held_out_global_ranks=False,prior_flop_exposure=True,authored80bbproxy_ranges=True,realistic_preflop_qualification=False,legacy_global_final_qualification=False)
 if stage=='EVALUATION':
  stats=compare(rows);out.update(stats=stats,verdict='CONTEXT_QUALIFICATION_PASS' if stats['eligible'] else 'CONTEXT_QUALIFICATION_FAIL',policy_import_sha256=sha('POLICY-IMPORT.json'))
 else:out.update(verdict='JD_TRANSFER_MEASURED',qualification_use=False,causal_JD_certificate=False,policy='old sealed range_root tables',scope='200bb HJ/UTG fourflopfamilies25/60chipdrops;notturnriver/50drop')
 write(stage+'-RESULT.json',out)
 if stage=='EVALUATION' and out['stats']['eligible']:write('CONTEXT-CERTIFICATE.json',dict(state='CONTEXT_INTERPOLATION_QUALIFIED_PROXY_RANGES',policy_import_sha256=sha('POLICY-IMPORT.json'),original_fit_sha256=read('POLICY-IMPORT.json')['fit_sha256'],models=read('POLICY-IMPORT.json')['models'],result_sha256=sha('EVALUATION-RESULT.json'),freeze_sha256=sha('FREEZE.json'),scope='190/210bb16exactpubliccontexts;priorflopexposure;authored80bbzerorakeproxyranges',held_out_global_ranks=False,authored80bbproxy_ranges=True,realistic_preflop_qualification=False,legacy_global_final_qualification=False,live_play=False))
 print(json.dumps({k:v for k,v in out.items() if k not in ['rows','technical_summary']}))
if __name__=='__main__':main(sys.argv[1])
