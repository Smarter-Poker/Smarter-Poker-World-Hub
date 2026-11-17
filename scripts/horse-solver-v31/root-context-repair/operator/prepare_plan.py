"""Prospective TRAIN contexts and exact fitting exclusion, before any labels."""
import sys,io,json,hashlib,copy,shutil
from pathlib import Path
B=Path(__file__).resolve().parents[1];R=B.parent/'hv31-root-replacement-01a1e479';sys.path.insert(0,str(B/'src'))
from data_access import SafeInputs
from context_scope import at_depth,game_key,require_bracket
from common import write,sha
assert not (B/'FREEZE.json').exists();raw=(R/'INPUTS.json').read_bytes();assert hashlib.sha256(raw).hexdigest()=='c9b9d63ee7b777a684cf5c6356535d6c4cc9b5ba49eff5e082fca28dba385e70';c=json.loads(raw)
raw=(R/'DATASET.json').read_bytes();assert hashlib.sha256(raw).hexdigest()=='464edbba157aa02ca9870b97b9df5434fe76682b884576c36e30b2ea3498efa4';records=json.loads(raw)
assert (B/'evidence/stack-feature-proof.json').is_file();assert json.loads((B/'evidence/stack-feature-proof.json').read_bytes())['verdict']=='EXACT_ACTUAL_PUBLIC_PRODUCER_PARITY'
val_ids=c['selected_ids'];assert len(val_ids)==16;old_ids=sorted(set(c['job_ids'])-set(val_ids));assert len(old_ids)==72
inputs={p:v for p,v in c['inputs'].items() if v['role']=='SOURCE'}
for p in c['baseline_models'].values():inputs[p]=c['inputs'][p]
for ranges in c['ranges'].values():
 for p in ranges.values():inputs[p]=c['inputs'][p]
for r in records:inputs[r['x_path']]=dict(role='TRAIN',sha256=r['x_sha256'])
old_records=[r for r in records if r['id'] in old_ids]
for r in old_records:inputs[r['label_path']]=dict(role='TRAIN',sha256=r['label_sha256'])
inputs[str(R/'safe-padding-v2.json')]=c['inputs'][str(R/'safe-padding-v2.json')]
fit_jobs={jid:copy.deepcopy(c['jobs'][jid]) for jid in old_ids};harvest_jobs={};validation={};cohorts={};order=[];support={};job_files={}
for depth in (18000,22000):
 for jid in val_ids:
  j=copy.deepcopy(c['jobs'][jid]);suffix=jid.split('.TRAIN.',1)[1];newid='f5rctx.TRAIN.d%d.'%(depth//100)+suffix
  s=at_depth(j['phases'][0]['scenario'],depth);s.update(scenario_id=newid,purpose='TRAIN bracket support');j['id']=newid;j['phases'][0]['scenario']=s;j['phases'][0].pop('arms',None)
  j['meta'].update(role='TRAIN',training_role='STACK_SUPPORT',source_train_id=jid,depth_bb=depth//100,game_key_sha256=game_key(s))
  harvest_jobs[newid]=j;fit_jobs[newid]=j;support.setdefault(jid,[]).append(s)
 for kind in ('normal','rainbow'):
  js=[j for j in harvest_jobs.values() if j['phases'][0]['scenario']['effective_stack_chips']==depth and (j['meta']['family']=='UNPR')==(kind=='rainbow')]
  groups=(('N00',js[:6]),('N01',js[6:])) if kind=='normal' else (('R00',js[:1]),('R01',js[1:]))
  for suffix,group in groups:
   tag='H%d-'%(depth//100)+suffix;assert len(group)==({'N00':6,'N01':6,'R00':1,'R01':3}[suffix]);p=B/('jobs-TRAIN-'+tag+'.json');write(p,group);job_files[str(p)]=sha(p)
   cohorts[tag]=dict(stage='HARVEST',stack=depth,jobs=str(p),ids=[j['id'] for j in group],predecessor=order[-1] if order else None,rainbow_solo=suffix=='R00',requires_solo=('H%d-R00'%(depth//100) if suffix=='R01' else None));order.append(tag)
for jid in val_ids:
 j=copy.deepcopy(c['jobs'][jid]);newid='f5rctx.TRAIN.validation.'+jid.split('.TRAIN.',1)[1];j['id']=newid;s=j['phases'][0]['scenario'];s.update(scenario_id=newid,purpose='TRAIN held exact context screen');j['meta'].update(role='TRAIN',training_role='EXACT_CONTEXT_SCREEN',source_train_id=jid,game_key_sha256=game_key(s),global_rank_exposed=True)
 require_bracket(s,[x['phases'][0]['scenario'] for x in fit_jobs.values()]);validation[newid]=j
normal=[j for j in validation.values() if j['meta']['family']!='UNPR'];rainbow=[j for j in validation.values() if j['meta']['family']=='UNPR']
for suffix,group in (('N00',normal[:6]),('N01',normal[6:]),('R00',rainbow[:1]),('R01',rainbow[1:])):
 tag='V-'+suffix;cohorts[tag]=dict(stage='SCREEN',stack=20000,jobs=str(B/('jobs-TRAIN-'+tag+'.json')),ids=[j['id'] for j in group],predecessor=order[-1],rainbow_solo=suffix=='R00',requires_solo='V-R00' if suffix=='R01' else None);order.append(tag)
assert len(fit_jobs)==104 and len(harvest_jobs)==32 and len(validation)==16
assert len({game_key(j['phases'][0]['scenario']) for j in fit_jobs.values()})==104
assert not {game_key(j['phases'][0]['scenario']) for j in fit_jobs.values()}&{game_key(j['phases'][0]['scenario']) for j in validation.values()}
# No 200bb regression teacher labels are admitted to the fitting manifest.
assert all(r['label_path'] not in inputs for r in records if r['id'] in val_ids)
g=SafeInputs(inputs)
for p,v in inputs.items():g.read(p,v['role'])
(B/'driver').mkdir()
hashes={'f4_lock_driver.py':'6da40e5fa1e4a90dd6712bf5e0c39b35ac5c15f16506e62b949325ce56d73880','f4_storage.py':'ca9af4bedd31efbadb92c9677f07337c77744a1d1ff80c515c9cfac8f1f37a44','f1_readback.py':'311b428fd3443c7dff2530ceff02d9748d0083cf5af4d3046da8236e0271a1fb','f4_m1.py':'e60c95183a36bac8ae53e62ff312df3ae98e559b5b2a124738a0222c5bf4fa8e','context_deadline.py':'6cd7a49c25df3e7a2c99c1334beb18e6acb2d4e15607630967374e2d06bb801b'}
for name,h in hashes.items():
 raw=(R/'driver'/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==h;(B/'driver'/name).write_bytes(raw)
raw=(R/'src/f5_native_launch.py').read_text();raw=raw.replace(str(R/'driver'),str(B/'driver')).replace('hv31-root-01a1e479','hv31-rctx-01a1e479');(B/'src/f5_native_launch.py').write_text(raw);(B/'src/f5_native_launch.py').chmod(0o755)
public_records=[{k:v for k,v in r.items() if k not in ('label_path','label_sha256')} for r in records]
write('INPUTS.json',dict(format='HV31_TRAIN_CONTEXT_REPAIR_V1',inputs=inputs,fit_old_ids=old_ids,fit_old_records=old_records,public_records=public_records,base_jobs=c['jobs'],fit_jobs=fit_jobs,harvest_jobs=harvest_jobs,validation_jobs=validation,validation_base_ids=val_ids,cohorts=cohorts,cohort_order=order,harvest_job_files=job_files,ranges=c['ranges'],baseline_models=c['baseline_models'],live_play=False,held_out_global_ranks=False,held_out_exact_game_keys=True))
print(json.dumps(dict(fit_old=72,fit_new=32,fit_total=104,validation=16,harvest_cohorts=8,fitting_inputs=len(inputs),held_exact_state_exclusion=True,held_out_global_ranks=False)))
