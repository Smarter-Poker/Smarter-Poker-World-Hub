"""Prospective explicit public TRAIN inputs and untouched exact context identities."""
import json,copy,hashlib,sys
from pathlib import Path
B=Path(__file__).resolve().parents[1];R=B.parent/'hv31-root-diagnosis-01a1e479';sys.path.insert(0,str(B/'src'))
from common import write,sha
from context_scope import at_depth,game_key,require_bracket
from data_access import SafeInputs
from range_admission import range_status
assert not (B/'FREEZE.json').exists();assert hashlib.sha256((R/'FREEZE.json').read_bytes()).hexdigest()=='26771edb53e65c2dbc9ce8eca3a5d140c2b1aa1023fa0b2b78c2e5a3ce591fa1';oldfreeze=json.loads((R/'FREEZE.json').read_bytes());assert hashlib.sha256((R/'INPUTS.json').read_bytes()).hexdigest()==oldfreeze['inputs_sha256'];assert hashlib.sha256((R/'DATA-RELEASE.json').read_bytes()).hexdigest()=='01118f7e8d05cbc66a4faf2f67b6c00ffd2feb9a2bc6fbb5eac3a16c790e7c04';old=json.loads((R/'INPUTS.json').read_bytes());ds=json.loads((R/'DATASET.json').read_bytes());release=json.loads((R/'DATA-RELEASE.json').read_bytes());assert hashlib.sha256((R/'DATASET.json').read_bytes()).hexdigest()==release['dataset_sha256'];assert len(ds)==416
inputs=copy.deepcopy(old['inputs']);records=[]
assert hashlib.sha256((R/'SCREEN-RELEASE.json').read_bytes()).hexdigest()=='930e3ddaadc54c6d83373a180524425a4a2a3fed04968bfc5359ad814fcfc271';oldscreenrelease=json.loads((R/'SCREEN-RELEASE.json').read_bytes());old_jd_jobs={}
for tag in ['V-N00','V-N01','V-R00','V-R01']:
 p=R/('jobs-TRAIN-'+tag+'.json');assert hashlib.sha256(p.read_bytes()).hexdigest()==oldscreenrelease['files'][str(p.relative_to(R))];inputs[str(p)]=dict(role='TRAIN',sha256=hashlib.sha256(p.read_bytes()).hexdigest())
 for j in json.loads(p.read_bytes()):old_jd_jobs[j['meta']['source_train_id']]=j
p=R/'TRAIN-SCREEN.json';assert hashlib.sha256(p.read_bytes()).hexdigest()=='3aa6ee57e23f1c85cc38a973d9313c275df76b818a2183d58256e0aad92f39b6';inputs[str(p)]=dict(role='TRAIN',sha256=hashlib.sha256(p.read_bytes()).hexdigest())
for r in ds:
 t=dict(r);t['x_path']=t.pop('features_path');t['x_sha256']=t.pop('features_sha256');records.append(t)
 for key in ['features_path','label_path']:
  p=r[key];h=r[key.replace('_path','_sha256')];inputs[p]=dict(role='TRAIN',sha256=h)
# The previously selected weights and104TRAIN data are admissible; previous screen answers are not read.
fit_jobs=copy.deepcopy(old['fit_jobs']);base_jobs=old['base_jobs'];public_records=old['public_records'];ranges=old['ranges'];new={};ev={};jd={};cohorts={};order=[]
for depth in [16000,24000]:
 for source in old['validation_base_ids']:
  j=copy.deepcopy(base_jobs[source]);jid='f5nq.TRAIN.d%d.'%(depth//100)+source.split('.TRAIN.',1)[1];s=at_depth(j['phases'][0]['scenario'],depth);s.update(scenario_id=jid,purpose='prospective TRAIN depth support');j['id']=jid;j['phases'][0]['scenario']=s;j['phases'][0].pop('arms',None);j['meta'].update(role='TRAIN',source_train_id=source,depth_bb=depth//100);new[jid]=j;fit_jobs[jid]=j
position_counts={}
for source in old['validation_base_ids']:
 j=copy.deepcopy(base_jobs[source]);pos=j['meta']['position'];idx=position_counts.get(pos,0);position_counts[pos]=idx+1;depth=(19000,21000)[idx%2];jid='f5nq.EVALUATION.'+source.split('.TRAIN.',1)[1];s=at_depth(j['phases'][0]['scenario'],depth);s.update(scenario_id=jid,purpose='untouched exact context evaluation');j['id']=jid;j['phases'][0]['scenario']=s;j['phases'][0].pop('arms',None);j['meta'].update(role='EVALUATION',source_train_id=source,depth_bb=depth//100,prior_flop_exposure=True);ev[jid]=j
 j=copy.deepcopy(base_jobs[source]);jid='f5nq.JD.'+source.split('.TRAIN.',1)[1];j['id']=jid;s=j['phases'][0]['scenario'];s.update(scenario_id=jid,purpose='TRAIN JD transfer only');drop=(60,25)[idx%2];s['pot_chips']=600-drop;j['phases'][0].pop('arms',None);j['meta'].update(role='TRAIN',source_train_id=source,drop_chips=drop,qualification_use=False);jd[jid]=j
fence_path=R/'evidence/additional-TRAIN-public-metadata.json';fence=json.loads(fence_path.read_bytes());blocked=set(fence['blocked_global_rank_signatures'])|set(fence['old_reserved_eval_ranks'])
for j in [*new.values(),*ev.values()]:
 sig=j['meta']['sig'];sig=sig if sig.startswith('3:') else '3:'+sig;assert sig not in blocked
inputs[str(fence_path)]=dict(role='SOURCE',sha256=hashlib.sha256(fence_path.read_bytes()).hexdigest())
keys={game_key(j['phases'][0]['scenario']) for j in fit_jobs.values()};assert len(keys)==136;assert not keys&{game_key(j['phases'][0]['scenario']) for j in ev.values()}
for j in ev.values():require_bracket(j['phases'][0]['scenario'],[v['phases'][0]['scenario'] for v in fit_jobs.values()])
def groups(stage,prefix,jobs,stack):
 normal=[j for j in jobs if j['meta']['family']!='UNPR'];rain=[j for j in jobs if j['meta']['family']=='UNPR']
 for suffix,group in [('N00',normal[:6]),('N01',normal[6:]),('R00',rain[:1]),('R01',rain[1:])]:
  tag=prefix+'-'+suffix;assert len(group)=={'N00':6,'N01':6,'R00':1,'R01':3}[suffix];p=B/('jobs-'+tag+'.json');cohorts[tag]=dict(stage=stage,stack=stack,jobs=str(p),ids=[j['id'] for j in group],predecessor=order[-1] if order else None,rainbow_solo=suffix=='R00',requires_solo=prefix+'-R00' if suffix=='R01' else None);order.append(tag)
  if stage=='HARVEST':write(p,group)
for d in [16000,24000]:groups('HARVEST','H%d'%(d//100),[j for j in new.values() if j['phases'][0]['scenario']['effective_stack_chips']==d],d)
groups('EVALUATION','E',list(ev.values()),None);groups('JD','J',list(jd.values()),20000)
# Mixed190/210 cohort stack admission must use eachscenario rather than a false singleexpectedstack.
for v in cohorts.values():
 if v['stage']=='EVALUATION':v['stack']=None
g=SafeInputs(inputs)
for p,v in inputs.items():g.read(p,v['role'])
write('RANGE-STATUS.json',range_status())
write('INPUTS.json',dict(format='HV31_NEXT_CONTEXT_QUALIFICATION_V1',inputs=inputs,fit_old_records=records,public_records=public_records,base_jobs=base_jobs,fit_jobs=fit_jobs,harvest_jobs=new,evaluation_jobs=ev,jd_jobs=jd,cohorts=cohorts,cohort_order=order,ranges=ranges,baseline_models=old['baseline_models'],jd_reference_jobs=old_jd_jobs,jd_reference_result=str(R/'TRAIN-SCREEN.json'),live_play=False,held_out_global_ranks=False,old_dataset_sha256=release['dataset_sha256']))
print(json.dumps(dict(old_fit_games=104,new_fit_games=32,total_fit=136,evaluation_games=16,jd_games=16,native_planned=64,inputs=len(inputs))))
