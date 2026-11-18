"""Import priorselected104TRAINfit; no fit or oldevaluationpayload access."""
from pathlib import Path
import sys,json,hashlib,copy
C=Path(__file__).resolve().parents[1];P=C.parent;B=P/'hv31-next-qualification-01a1e479';R=P/'hv31-root-diagnosis-01a1e479';sys.path.insert(0,str(C/'src'))
from common import write,sha
from range_admission import range_status
from context_scope import game_key,require_bracket
from data_access import SafeInputs
assert not (C/'FREEZE.json').exists();assert hashlib.sha256((B/'FREEZE.json').read_bytes()).hexdigest()=='812fe4c5c72a8356ad4548aa8d1c99f0be7e8a3b77e5856134de42477bb0313b';bf=json.loads((B/'FREEZE.json').read_bytes());assert hashlib.sha256((B/'INPUTS.json').read_bytes()).hexdigest()==bf['inputs_sha256'];b=json.loads((B/'INPUTS.json').read_bytes())
assert hashlib.sha256((R/'FREEZE.json').read_bytes()).hexdigest()=='26771edb53e65c2dbc9ce8eca3a5d140c2b1aa1023fa0b2b78c2e5a3ce591fa1';rf=json.loads((R/'FREEZE.json').read_bytes());assert hashlib.sha256((R/'INPUTS.json').read_bytes()).hexdigest()==rf['inputs_sha256'];r=json.loads((R/'INPUTS.json').read_bytes());fitpath=R/'FIT.json';assert hashlib.sha256(fitpath.read_bytes()).hexdigest()=='0ccadcea5d4f8b67a9fc6ffbb72d5d2661cde3a0059a70e8f6bbb40d9a61df9c';fit=json.loads(fitpath.read_bytes());assert fit['fit_games']==104
inputs={};wanted={p for v in r['ranges'].values() for p in v.values()}|set(r['baseline_models'].values())|{x['x_path'] for x in r['public_records']}
for p in wanted:inputs[p]=r['inputs'][p]
models={}
for rel,meta in fit['models'].items():
 if rel.startswith('models/range_root/'):
  p=str(R/rel);assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==meta['sha256'];inputs[p]=dict(role='MODEL',sha256=meta['sha256']);models[rel]=dict(meta,path=p)
assert len(models)==8
for p in [fitpath,R/'CANDIDATE-SEAL.json',R/'CONTEXT-CANDIDATE.json',R/'FREEZE.json',R/'INPUTS.json',R/'DATA-RELEASE.json',B/'FREEZE.json',B/'INPUTS.json',B/'evidence/stack-feature-proof.json']:
 inputs[str(p)]=dict(role='SOURCE',sha256=hashlib.sha256(p.read_bytes()).hexdigest())
for tag in ['V-N00','V-N01','V-R00','V-R01']:
 p=str(R/('jobs-TRAIN-'+tag+'.json'));inputs[p]=b['inputs'][p]
p=str(R/'TRAIN-SCREEN.json');inputs[p]=b['inputs'][p] # JDreferenceonly, never evaluationstrength.
fp=P/'hv31-root-diagnosis-01a1e479/evidence/additional-TRAIN-public-metadata.json';inputs[str(fp)]=b['inputs'][str(fp)];fence=json.loads(fp.read_bytes());blocked=set(fence['blocked_global_rank_signatures'])|set(fence['old_reserved_eval_ranks'])
ev=copy.deepcopy(b['evaluation_jobs']);jd=copy.deepcopy(b['jd_jobs']);cohorts={};order=[]
for stage,source,prefix in [('EVALUATION',ev,'E'),('JD',jd,'J')]:
 for j in source.values():
  sig=j['meta']['sig'];assert (sig if sig.startswith('3:') else '3:'+sig) not in blocked
  j['id']=j['id'].replace('f5nq.','f5fb.');j['phases'][0]['scenario']['scenario_id']=j['id']
  if stage=='EVALUATION':require_bracket(j['phases'][0]['scenario'],[x['phases'][0]['scenario'] for x in r['fit_jobs'].values()])
 normal=[j for j in source.values() if j['meta']['family']!='UNPR'];rain=[j for j in source.values() if j['meta']['family']=='UNPR']
 for suffix,group in [('N00',normal[:6]),('N01',normal[6:]),('R00',rain[:1]),('R01',rain[1:])]:
  tag=prefix+'-'+suffix;cohorts[tag]=dict(stage=stage,stack=None if stage=='EVALUATION' else 20000,ids=[j['id'] for j in group],predecessor=order[-1] if order else None,rainbow_solo=suffix=='R00',requires_solo=prefix+'-R00' if suffix=='R01' else None);order.append(tag)
# JDindependentofEVALoutcome; firstJDonlyrequiresidle/release, notEVALtechnicalsuccess.
cohorts['J-N00']['predecessor']=None
for p,v in inputs.items():SafeInputs(inputs).read(p,v['role'])
write('INPUTS.json',dict(inputs=inputs,public_records=r['public_records'],base_jobs=r['base_jobs'],fit_jobs=r['fit_jobs'],ranges=r['ranges'],baseline_models=r['baseline_models'],evaluation_jobs={j['id']:j for j in ev.values()},jd_jobs={j['id']:j for j in jd.values()},jd_reference_jobs=b['jd_reference_jobs'],jd_reference_result=b['jd_reference_result'],models=models,cohorts=cohorts,cohort_order=order,live_play=False))
write('POLICY-IMPORT.json',dict(policy='prior104TRAINfitselectedrange_root',fit_path=str(fitpath),fit_sha256=inputs[str(fitpath)]['sha256'],original_freeze_sha256='26771edb53e65c2dbc9ce8eca3a5d140c2b1aa1023fa0b2b78c2e5a3ce591fa1',models=models,fit_games=104,new_training=False,authored80bbproxy_ranges=True,realistic_preflop_qualification=False,global_final_qualified=False,live_play=False))
write('RANGE-STATUS.json',range_status())
print(json.dumps(dict(imported_models=8,fit_games=104,evaluation=16,jd=16,pins=len(inputs))))
