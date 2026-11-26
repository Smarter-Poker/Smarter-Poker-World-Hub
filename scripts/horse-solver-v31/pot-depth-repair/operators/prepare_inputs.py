"""Explicit TRAIN closure plus label-free prospective context identities. No solves."""
import copy,hashlib,json,sys
from pathlib import Path
D=Path(__file__).resolve().parents[1];P=D.parent;sys.path.insert(0,str(D/'src'))
from common import write
from data_access import SafeInputs
from context_scope import at_depth,game_key
from pot_scope import at_pot,require_pot_bracket
from range_admission import range_status
R=P/'hv31-root-diagnosis-01a1e479';B=P/'hv31-next-qualification-01a1e479';C=P/'hv31-context-fallback-01a1e479'
H=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def pinned(p,h):
 assert H(p)==h,str(p);return json.loads(Path(p).read_bytes())
def main():
 assert not (D/'FREEZE.json').exists() and not (D/'INPUTS.json').exists()
 rf=pinned(R/'FREEZE.json','26771edb53e65c2dbc9ce8eca3a5d140c2b1aa1023fa0b2b78c2e5a3ce591fa1');old=pinned(R/'INPUTS.json',rf['inputs_sha256'])
 dr=pinned(R/'DATA-RELEASE.json','01118f7e8d05cbc66a4faf2f67b6c00ffd2feb9a2bc6fbb5eac3a16c790e7c04');ds=pinned(R/'DATASET.json',dr['dataset_sha256']);assert len(ds)==416
 ci=pinned(C/'INPUTS.json','cc6aded48b3c028779569881a50a26dc2a1cae961af3213df94e94fed51877b7');bi=pinned(B/'INPUTS.json','74363237014920a12a29edd689d7356bcd19790d4a0abe746d3ad189bfde420d')
 report=json.loads((D/'evidence/train-reuse-admission-review.json').read_bytes());assert report['additional_clean_games']==59
 inputs=copy.deepcopy(old['inputs'])
 def admit(p,role,h=None):inputs[str(p)]=dict(role=role,sha256=h or H(p))
 for p in [R/'FREEZE.json',R/'INPUTS.json',R/'DATA-RELEASE.json',R/'DATASET.json',B/'INPUTS.json',C/'INPUTS.json',D/'evidence/train-reuse-admission-review.json',D/'evidence/new-plan-admission-review.json']:admit(p,'SOURCE')
 for r in ds:
  for k in ('features_path','label_path'):admit(r[k],'TRAIN',r[k.replace('_path','_sha256')])
 fit_jobs=copy.deepcopy(old['fit_jobs']);native={};old_groups={};jd_jobs={};reference={}
 for tag in ('V-N00','V-N01','V-R00','V-R01'):
  p=R/('jobs-TRAIN-'+tag+'.json');admit(p,'TRAIN',report['pins'][str(p)]);jobs=json.loads(p.read_bytes())
  for j in jobs:reference[j['meta']['source_train_id']]=j
 # Only the fourteen explicitly reviewed TRAIN job files; no C consumed EVALUATION artifacts.
 for rec in report['records']:
  base=Path(rec['base']);tag=rec['cohort'];prefix='jobs-TRAIN-' if base==R else 'jobs-';jp=base/(prefix+tag+'.json');admit(jp,'TRAIN',report['pins'][str(jp)])
  jobs=json.loads(jp.read_bytes());j=next(x for x in jobs if x['id']==rec['id']);assert j['meta']['role']=='TRAIN';fit_jobs[j['id']]=j
  admit(rec['native_path'],'TRAIN',rec['native_sha256']);native[j['id']]=dict(path=rec['native_path'],sha256=rec['native_sha256'],jobs=str(jp),directory=str(Path(rec['native_path']).parent))
  old_groups[str(jp)]=str(Path(rec['native_path']).parent)
  if base==C:jd_jobs[j['meta']['source_train_id']]=j
 assert len(fit_jobs)==163 and len(native)==59 and len(jd_jobs)==16
 harvest={}
 for source in old['validation_base_ids']:
  base=old['base_jobs'][source];sc=at_depth(base['phases'][0]['scenario'],24000)
  if game_key(sc) in {game_key(j['phases'][0]['scenario']) for j in fit_jobs.values()}:continue
  j=copy.deepcopy(base);jid='f5follow.TRAIN.d240.'+source.split('.TRAIN.',1)[1];j['id']=jid;j['phases'][0]['scenario']=sc;sc.update(scenario_id=jid,purpose='new frozen instrumented TRAIN support');j['phases'][0].pop('arms',None);j['meta'].update(role='TRAIN',source_train_id=source,depth_bb=240,game_key_sha256=game_key(sc));harvest[jid]=j;fit_jobs[jid]=j
 assert len(harvest)==5 and len(fit_jobs)==168
 screen={};evaluation={}
 for source,j0 in jd_jobs.items():
  for stage,pot,dest in [('TRAIN',j0['phases'][0]['scenario']['pot_chips'],screen),('EVALUATION',555 if j0['phases'][0]['scenario']['pot_chips']==540 else 585,evaluation)]:
   j=copy.deepcopy(j0);jid='f5follow.'+stage+'.p'+str(pot)+'.'+source.split('.TRAIN.',1)[1];j['id']=jid;j['phases'][0].pop('arms',None);s=at_pot(j['phases'][0]['scenario'],pot);s.update(scenario_id=jid,purpose='fitted TRAIN regression' if stage=='TRAIN' else 'untouched exact pot interpolation');j['phases'][0]['scenario']=s;j['meta'].update(role=stage,source_train_id=source,training_exposure=stage=='TRAIN',qualification_use=stage=='EVALUATION',game_key_sha256=game_key(s));dest[jid]=j
 trainkeys={game_key(j['phases'][0]['scenario']) for j in fit_jobs.values()};assert len(trainkeys)==168
 metadata_keys=set(trainkeys)
 for conf in [old,bi,ci]:
  for k in ('fit_jobs','harvest_jobs','evaluation_jobs','jd_jobs'):
   metadata_keys.update(game_key(j['phases'][0]['scenario']) for j in conf.get(k,{}).values())
 for j in evaluation.values():
  assert game_key(j['phases'][0]['scenario']) not in metadata_keys
  require_pot_bracket(j['phases'][0]['scenario'],[x['phases'][0]['scenario'] for x in fit_jobs.values()])
 fence=R/'evidence/additional-TRAIN-public-metadata.json';admit(fence,'SOURCE');f=json.loads(fence.read_bytes());blocked=set(f['blocked_global_rank_signatures'])|set(f['old_reserved_eval_ranks'])
 for j in list(harvest.values())+list(evaluation.values()):assert j['meta']['sig'] not in blocked
 cohorts={};order=[]
 def group(stage,tag,jobs,pred=None,solo=False,required=None):
  assert jobs;cohorts[tag]=dict(stage=stage,ids=[j['id'] for j in jobs],jobs=str(D/('jobs-'+tag+'.json')),predecessor=pred,rainbow_solo=solo,requires_solo=required,stack=24000 if stage=='HARVEST' else 20000);order.append(tag)
 diagnostic=[j for j in harvest.values() if j['meta']['family']!='UNPR'];rain=[j for j in harvest.values() if j['meta']['family']=='UNPR'];assert len(diagnostic)==1 and len(rain)==4 and diagnostic[0]['meta']['position']=='UTG' and diagnostic[0]['meta']['sig']=='3:245'
 group('HARVEST','H-D00',diagnostic);group('HARVEST','H-R00',rain[:1],'H-D00',True);group('HARVEST','H-R01',rain[1:],'H-R00',False,'H-R00')
 for stage,prefix,jobs in [('TRAIN','T',screen),('EVALUATION','E',evaluation)]:
  normal=[j for j in jobs.values() if j['meta']['family']!='UNPR'];rain=[j for j in jobs.values() if j['meta']['family']=='UNPR'];pred='H-R01' if stage=='TRAIN' else None
  for suffix,seq in [('N00',normal[:6]),('N01',normal[6:]),('R00',rain[:1]),('R01',rain[1:])]:
   tag=prefix+'-'+suffix;group(stage,tag,seq,pred,suffix=='R00',prefix+'-R00' if suffix=='R01' else None);pred=tag
 for tag,co in cohorts.items():
  if co['stage']=='HARVEST':write('jobs-'+tag+'.json',[harvest[i] for i in co['ids']])
 for j in reference.values():
  assert len(j['phases'][0]['arms'])==6
 for p,v in inputs.items():SafeInputs(inputs).read(p,v['role'])
 write('RANGE-STATUS.json',range_status())
 write('INPUTS.json',dict(format='HV31_FOLLOWTHROUGH_168_V1',inputs=inputs,fit_old_records=ds,public_records=old['public_records'],base_jobs=old['base_jobs'],fit_jobs=fit_jobs,reused_native=native,reused_groups=old_groups,harvest_jobs=harvest,training_jobs=screen,evaluation_jobs=evaluation,cohorts=cohorts,cohort_order=order,ranges=old['ranges'],reference_jobs=reference,freshness=dict(scope='absence from admitted TRAIN and known R/B/C public frozen identity metadata',universal_old_history_proof=False,known_keys=sorted(metadata_keys)),live_play=False))
 print(json.dumps(dict(fit_games=168,reused_native=59,harvest_games=5,training_regression=16,evaluation_games=16,planned_native=37,inputs=len(inputs))))
if __name__=='__main__':main()
