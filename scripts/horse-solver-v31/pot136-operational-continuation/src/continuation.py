"""Explicit operational partition continuation; no training or changed experiment."""
import argparse,datetime,hashlib,importlib,json,math,subprocess,sys
from pathlib import Path

F=Path(__file__).resolve().parents[1]
E=F.parent/'hv31-pot-repair136-20261126-01a1e479'
E_FREEZE='58a978c9f577872908f280a3f4cb2bf9970112b8e94aca7e9431a99e8854de06'
FIT='b4d222fb336cf59f9db144a255cb793fd5276dd6302e25b9eb715b53bb3112cf'
HELPERS=('f4_lock_driver.py','f4_storage.py','f1_readback.py','f4_m1.py','context_deadline.py','native_telemetry.py')
def digest(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def stamp():return datetime.datetime.now(datetime.UTC).isoformat()
def own(path):
    p=Path(path);p=p if p.is_absolute() else F/p
    if p.is_symlink() or not p.resolve().is_relative_to(F):raise PermissionError('owned continuation path required')
    return p
def sha(path):return digest(own(path).read_bytes())
def read(path):return json.loads(own(path).read_bytes())
def write(path,value):
    p=own(path);p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('x') as f:json.dump(value,f,sort_keys=True,indent=2,allow_nan=False);f.write('\n')
def load_e():
    raw=(E/'FREEZE.json').read_bytes()
    if digest(raw)!=E_FREEZE:raise ValueError('original experiment freeze changed')
    original=json.loads(raw)
    for p,h in original['source_files'].items():
        if digest((E/p).read_bytes())!=h:raise ValueError('original frozen source drift')
    sys.path.insert(0,str(E/'src'));ops=importlib.import_module('ops');common=importlib.import_module('common');scorer=importlib.import_module('score');chain=importlib.import_module('candidate_chain')
    if Path(ops.__file__).resolve()!=E/'src/ops.py' or common.B!=E:raise ValueError('original module origin')
    return common,ops,scorer,chain
def split_jobs(jobs):
    if len(jobs)!=16 or len({j['id'] for j in jobs})!=16:raise ValueError('exact16 unique original jobs required')
    normal=sorted((j for j in jobs if j['meta']['family']!='UNPR'),key=lambda j:j['id']);rainbow=sorted((j for j in jobs if j['meta']['family']=='UNPR'),key=lambda j:j['id'])
    if len(normal)!=12 or len(rainbow)!=4:raise ValueError('original family allocation changed')
    return [normal[i:i+3] for i in range(0,12,3)]+[rainbow[:1],rainbow[1:]]
def check_budget(b,n):
    if type(n) is not int or not 1<=n<=3:raise ValueError('partition size')
    reserve=(900*n+600)/3600
    if b['open_operations'] or b['runs']+n>2000 or b['hours']+reserve>40 or b['combined_hours']+reserve>18 or b['phase_runs']+n>39 or b['phase_hours']+reserve>2:raise ValueError('unchanged original experiment budget/reserve refuses launch')
    return reserve
def original_jobs(common,c):
    seal=common.read('EVALUATION-JOBS-SEAL.json')
    if seal['freeze_sha256']!=E_FREEZE or seal['candidate_sha256']!=common.sha('CANDIDATE-SEAL.json') or seal['fit_sha256']!=FIT:raise ValueError('original actual evaluation seal binding')
    audit=common.read('evidence/EVALUATION-table-audit.json')
    if audit['accepted'] is not True or audit['jobs_seal_sha256']!=common.sha('EVALUATION-JOBS-SEAL.json') or audit['fit_sha256']!=FIT:raise ValueError('original actual table audit required')
    files={};jobs=[]
    for tag in c['cohort_order']:
        if c['cohorts'][tag]['stage']!='EVALUATION':continue
        p='jobs-'+tag+'.json';h=common.sha(p)
        if seal['files'].get(p)!=h:raise ValueError('original evaluation jobs changed')
        files[p]=h;jobs.extend(common.read(p))
    split_jobs(jobs)
    if {j['id'] for j in jobs}!=set(c['evaluation_jobs']):raise ValueError('original target identities changed')
    return jobs,files
def train_gate(common,c):
    train=common.read('TRAIN-RESULT.json')
    if train['stats']['eligible'] is not True or train['candidate_sha256']!=common.sha('CANDIDATE-SEAL.json') or train['fit_sha256']!=FIT or train['freeze_sha256']!=E_FREEZE:raise ValueError('once TRAIN pass for same candidate required')
    tags=[t for t in c['cohort_order'] if c['cohorts'][t]['stage']=='TRAIN']
    if sum(len(c['cohorts'][t]['ids']) for t in tags)!=16:raise ValueError('original TRAIN census')
    for tag in tags:
        if common.read('evidence/technical-'+tag+'.json')['verdict']!='PASS_NATIVE_COPY_A2_TECHNICAL':raise ValueError('all16 original TRAIN technical gates required')
    if (E/'EVALUATION-CLAIM.json').exists() or (E/'EVALUATION-RESULT.json').exists():raise ValueError('original evaluation already claimed/consumed')
    return tags
def eval_launches(events):return [e for e in events if not e.get('dry') and e.get('event')=='launch' and e.get('out','').upper().startswith('F5P136-E-')]
def provenance_names(c):
    return ['INPUTS.json','TRAIN-RESULT.json','TRAIN-CLAIM.json','TRAIN-RELEASE.json',*['evidence/technical-'+t+'.json' for t in c['cohort_order'] if c['cohorts'][t]['stage']=='TRAIN']]
def regular_sha(path,base):
    p=Path(path)
    if p.is_symlink() or not p.is_file() or not p.resolve().is_relative_to(base.resolve()):raise ValueError('regular provenance file inside original campaign required')
    return digest(p.read_bytes())
def verify_provenance(f):
    if regular_sha(f['refusal_path'],E/'evidence')!=f['refusal_sha256']:raise ValueError('original admission refusal drift')
    for p,h in f['provenance_files'].items():
        if regular_sha(E/p,E)!=h:raise ValueError('original immutable TRAIN provenance drift: '+p)
def verify_sources(f):
    if not {'PLAN.md','API.md','test_contracts.py','src/continuation.py'}<=set(f['source_files']):raise ValueError('missing frozen review source')
    for p,h in f['source_files'].items():
        if sha(p)!=h:raise ValueError('operational frozen source/job drift')
def verify_chain_files(common,c,g,files):
    # One invocation-local role-bound reader; no retained cache or skipped hashes.
    for p,h in files.items():
        raw=g.read(p,'TRAIN') if p in c['inputs'] else common.own(p).read_bytes()
        if digest(raw)!=h:raise ValueError('original causal chain artifact drift: '+p)
def semantic_chain(common,c,g):
 # Original pinned E candidate_chain semantics; invocation-local reader only.
 B=E;read=common.read;sha=common.sha
 def data_bytes(p,h,role='TRAIN'):
  raw=g.read(p,role) if p in c['inputs'] else common.own(p).read_bytes()
  if digest(raw)!=h:raise ValueError('original causal artifact drift')
  return raw
 freeze=sha('FREEZE.json');data=read('DATA-RELEASE.json');admission=read('FIT-ADMISSION.json');fit=read('FIT.json');candidate=read('CANDIDATE-SEAL.json');reuse=read('REUSED-TRAIN-ADMISSION.json');files={}
 assert data['accepted'] is True and data['freeze_sha256']==freeze and data['dataset_sha256']==sha('DATASET.json') and data['fit_games']==136 and data['nodes']==544
 assert admission['accepted'] is True and admission['freeze_sha256']==freeze and admission['data_release_sha256']==sha('DATA-RELEASE.json') and admission['dataset_sha256']==sha('DATASET.json') and admission['fit_games']==136
 assert fit['freeze_sha256']==freeze and fit['data_release_sha256']==sha('DATA-RELEASE.json') and fit['fit_games']==136 and len(fit['models'])==8
 assert candidate['fit_sha256']==sha('FIT.json') and candidate['models']==8 and candidate['fitted_once'] is True
 assert reuse['accepted'] is True and reuse['games']==32 and reuse['freeze_sha256']==freeze and reuse['mandatory_A2'] is True
 for name in ('DATA-RELEASE.json','DATASET.json','FIT-ADMISSION.json','FIT-CLAIM.json','FIT.json','CANDIDATE-SEAL.json','REUSED-TRAIN-ADMISSION.json'):files[name]=sha(name)
 claim=read('FIT-CLAIM.json');assert claim['freeze_sha256']==freeze and claim['data_release_sha256']==sha('DATA-RELEASE.json')
 # Each external byte read is still explicit TRAIN admission; owned artifacts retain the owned-path guard.
 for p,h in data['files'].items():data_bytes(p,h,'TRAIN');files[p]=h
 dataset=read('DATASET.json');assert len(dataset)==544 and len({r['game_key'] for r in dataset})==136
 for row in dataset:
  for name in ('label','features'):
   p=row[name+'_path'];h=row[name+'_sha256'];data_bytes(p,h,'TRAIN');files[p]=h
 expected={v['path']:v['sha256'] for v in c['reused_native'].values()}
 for tag,co in c['cohorts'].items():
  if co['stage']!='HARVEST':continue
  rp='evidence/technical-'+tag+'.json';receipt=read(rp);assert receipt['verdict']=='PASS_NATIVE_COPY_A2_TECHNICAL';files[rp]=sha(rp)
  for name,h in receipt['local_files'].items():
   p=str(B/'m1'/('F5P136-'+tag)/name);data_bytes(p,h,'TRAIN');files[p]=h
  for jid in co['ids']:
   p=str(B/'m1'/('F5P136-'+tag)/(jid+'.json'));expected[p]=receipt['local_files'][jid+'.json']
 assert data['native_sources']==expected and len(expected)==32
 for p,h in expected.items():data_bytes(p,h,'TRAIN');files[p]=h
 for p,m in fit['models'].items():assert sha(p)==m['sha256'];files[p]=m['sha256']
 return files

def prepare(refusal_path,refusal_sha):
    common,ops,_,chain=load_e();common.frozen();c,g=common.config();train_tags=train_gate(common,c)
    if (F/'OPERATIONAL-FREEZE.json').exists():raise ValueError('already frozen; reconcile existing operation')
    events=ops.events();b=ops.budget(events)
    if eval_launches(events) or b['phase_runs']!=16 or b['open_operations']:raise ValueError('zero original evaluation launches and closed TRAIN required')
    refusal_path=Path(refusal_path)
    if refusal_path.is_symlink() or not refusal_path.resolve().is_relative_to(E/'evidence') or digest(refusal_path.read_bytes())!=refusal_sha:raise ValueError('actual original admission refusal receipt required')
    refusal=json.loads(refusal_path.read_bytes())
    required=dict(verdict='OPERATIONAL_ADMISSION_BLOCKED',freeze_sha256=E_FREEZE,candidate_sha256=common.sha('CANDIDATE-SEAL.json'),stage='EVALUATION',native_launched=False)
    if any(refusal.get(k)!=v for k,v in required.items()) or refusal.get('reason')!='phase_reserve_exceeds_original_2h':raise ValueError('original route must actually refuse, not be predicted to refuse')
    original_chain=semantic_chain(common,c,g)
    original,files=original_jobs(common,c);groups=split_jobs(original);order=[];cohorts={}
    for i,group in enumerate(groups):
        tag='E-S%02d'%i;p='jobs-'+tag+'.json';write(p,group);out='F5P136-'+tag
        cohorts[tag]=dict(ids=[j['id'] for j in group],out=out,job_file=p,job_sha256=sha(p),predecessor=order[-1] if order else None,rainbow_solo=i==4,requires_solo='E-S04' if i==5 else None);order.append(tag)
    assembled=[j for tag in order for j in read(cohorts[tag]['job_file'])]
    if {j['id']:canonical(j) for j in assembled}!={j['id']:canonical(j) for j in original}:raise ValueError('partition changed original job objects')
    write('LAYOUT.json',dict(format='HV31_POT136_OPERATIONAL_PARTITION_V1',cohorts=cohorts,order=order,original_job_object_sha256={j['id']:digest(canonical(j)) for j in original},original_job_files=files,targets=16,arms=64,writes=128,candidate_sha256=common.sha('CANDIDATE-SEAL.json'),fit_sha256=FIT,original_freeze_sha256=E_FREEZE,live_play=False))
    source_files={str(p.relative_to(F)):sha(p) for p in [F/'PLAN.md',F/'API.md',F/'test_contracts.py',*sorted((F/'src').glob('*.py')),*sorted(F.glob('jobs-E-S*.json')),F/'LAYOUT.json']}
    provenance_files={p:regular_sha(E/p,E) for p in provenance_names(c)}
    write('OPERATIONAL-FREEZE.json',dict(at=stamp(),original_freeze_sha256=E_FREEZE,candidate_sha256=common.sha('CANDIDATE-SEAL.json'),fit_sha256=FIT,source_files=source_files,original_files=files,provenance_files=provenance_files,original_chain=original_chain,original_chain_sha256=digest(canonical(original_chain)),refusal_path=str(refusal_path),refusal_sha256=refusal_sha,original_budget_before=b,original_phase_cap_runs=39,original_phase_cap_hours=2,global_cap_runs=2000,global_cap_hours=40,combined_cap_hours=18,reserve_formula='(900*n+600)/3600',same_experiment=True,live_play=False))
    # Freeze alone authorizes no solve. Separate root review/A8/stage release next.
    print(json.dumps(dict(state='FROZEN_OPERATIONAL_LAYOUT_ONLY',freeze_sha256=sha('OPERATIONAL-FREEZE.json'),sizes=[len(g) for g in groups])))
def verify():
    common,ops,scorer,chain=load_e();f=read('OPERATIONAL-FREEZE.json')
    verify_provenance(f);verify_sources(f)
    c,g=common.config()
    original_freeze=common.read('FREEZE.json')
    if common.sha('INPUTS.json')!=original_freeze['inputs_sha256']:raise ValueError('original input manifest drift')
    for p,v in c['inputs'].items():g.read(p,v['role'])
    if set(f['provenance_files'])!=set(provenance_names(c)):raise ValueError('missing frozen TRAIN provenance')
    verify_provenance(f)
    verify_sources(f)
    if digest(canonical(f['original_chain']))!=f['original_chain_sha256']:raise ValueError('sealed original chain identity drift')
    if semantic_chain(common,c,g)!=f['original_chain']:raise ValueError('original causal semantic chain drift')
    if f['original_freeze_sha256']!=E_FREEZE or common.sha('FIT.json')!=FIT or f['candidate_sha256']!=common.sha('CANDIDATE-SEAL.json'):raise ValueError('same original candidate required')
    for p,h in f['original_files'].items():
        if common.sha(p)!=h:raise ValueError('original evaluation job drift')
    train_gate(common,c)
    return common,ops,scorer,chain,c
def release_check():
    common,ops,scorer,chain,c=verify();r=read('NATIVE-RELEASE.json')
    if r['accepted'] is not True or r['operational_freeze_sha256']!=sha('OPERATIONAL-FREEZE.json') or r['candidate_sha256']!=common.sha('CANDIDATE-SEAL.json'):raise ValueError('actual operational release required')
    for p,h in r['files'].items():
        if sha(p)!=h:raise ValueError('operational release drift')
    if r['original_chain']!=read('OPERATIONAL-FREEZE.json')['original_chain']:raise ValueError('original causal candidate chain changed')
    return common,ops,scorer,c
def stage():
    common,ops,_,chain,c=verify();b=ops.budget(ops.events());ops.idle()
    if eval_launches(ops.events()) or b['phase_runs']!=16 or b['open_operations']:raise ValueError('closed TRAIN and no evaluation launch required before operational staging')
    layout=read('LAYOUT.json');files={'LAYOUT.json':sha('LAYOUT.json')};names={n:common.sha('driver/'+n) for n in HELPERS}
    for tag in layout['order']:
        co=layout['cohorts'][tag];p=co['job_file'];receipt='evidence/preflight-stage-'+tag+'.json';cmd=[sys.executable,'-I','-B',str(ops.W/'flop4/A8/preflight.py'),'--jobs',str(F/p),'--driver',str(E/'driver/f4_lock_driver.py'),'--expect-driver-sha',names['f4_lock_driver.py'],'--expect-accuracy','.001','--cap','39','--used',str(b['phase_runs']),'--reserved','0','--require-stack-binds','--expect-stack-chips','20000','--chips-per-bb','100','--role-names','EVALUATION','--ledger',str(ops.LEDGER),'--programme','F5P136-','--json',str(F/receipt)]
        with own('evidence/preflight-stage-'+tag+'.log').open('x') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
        if r.returncode or read(receipt)['verdict']!='GO':raise ValueError('operational A8 refusal')
        target='jobs-'+co['out']+'.json';ops.remote_ps("$p='"+ops.REMOTE+'\\'+target+"';if(Test-Path -LiteralPath $p){throw 'already staged'};@{absent=$true}|ConvertTo-Json -Compress")
        cp=subprocess.run([ops.HELPER,'scp',str(F/p),'danie@192.168.0.51:C:/sp-v31/hv31-pot136-20261126-01a1e479/'+target],capture_output=True,text=True,timeout=60)
        if cp.returncode:raise RuntimeError(cp.stderr)
        names[target]=sha(p);files[p]=sha(p);files[receipt]=sha(receipt)
    script="$p='"+ops.REMOTE+"';$h=@{};@("+','.join("'"+n+"'" for n in names)+")|ForEach-Object{$h[$_]=(Get-FileHash -Algorithm SHA256 -LiteralPath ($p+'\\'+$_)).Hash.ToLower()};@{files=$h;pio_count=@(Get-Process PioSOLVER* -ErrorAction SilentlyContinue).Count}|ConvertTo-Json -Depth 4 -Compress"
    proof=ops.remote_ps(script)
    if proof['files']!=names or proof['pio_count']!=0:raise ValueError('actual remote staged/helper identity')
    write('evidence/stage-proof.json',proof);files['evidence/stage-proof.json']=sha('evidence/stage-proof.json');files.update(read('OPERATIONAL-FREEZE.json')['source_files'])
    write('NATIVE-RELEASE.json',dict(at=stamp(),accepted=True,operational_freeze_sha256=sha('OPERATIONAL-FREEZE.json'),original_freeze_sha256=E_FREEZE,candidate_sha256=common.sha('CANDIDATE-SEAL.json'),files=files,original_chain=read('OPERATIONAL-FREEZE.json')['original_chain'],live_play=False))
    print('Staged and released operational partition; no native launched')
def launch(tag):
    common,ops,_,c=release_check();layout=read('LAYOUT.json');co=layout['cohorts'][tag];events=ops.events();own_outs={v['out'] for v in layout['cohorts'].values()}
    if any(e['out'] not in own_outs for e in eval_launches(events)):raise ValueError('original/foreign evaluation route launched')
    if any(e.get('event')=='launch' and not e.get('dry') and e.get('out','').upper()==co['out'].upper() for e in events):raise ValueError('no retry/duplicate launch')
    if (F/'TERMINAL-TECHNICAL-FAIL.json').exists():raise ValueError('prior technical failure is terminal')
    b=ops.budget(events);reserve=check_budget(b,len(co['ids']))
    if co['predecessor'] and read('evidence/technical-'+co['predecessor']+'.json')['verdict']!='PASS_NATIVE_COPY_A2_TECHNICAL':raise ValueError('closed predecessor technical gate required')
    if co['requires_solo'] and read('evidence/technical-'+co['requires_solo']+'.json')['rainbow_solo_pass'] is not True:raise ValueError('original rainbow solo gate required')
    ops.idle();names={n:common.sha('driver/'+n) for n in HELPERS};target='jobs-'+co['out']+'.json';names[target]=sha(co['job_file'])
    script="$p='"+ops.REMOTE+"';$h=@{};@("+','.join("'"+n+"'" for n in names)+")|ForEach-Object{$h[$_]=(Get-FileHash -Algorithm SHA256 -LiteralPath ($p+'\\'+$_)).Hash.ToLower()};$h|ConvertTo-Json -Compress"
    if ops.remote_ps(script)!=names:raise ValueError('current M1 helper/job drift')
    # Repeat the maintained static preflight at this launch's actual ledger use.
    receipt='evidence/preflight-launch-'+tag+'.json';cmd=[sys.executable,'-I','-B',str(ops.W/'flop4/A8/preflight.py'),'--jobs',str(F/co['job_file']),'--driver',str(E/'driver/f4_lock_driver.py'),'--expect-driver-sha',names['f4_lock_driver.py'],'--expect-accuracy','.001','--cap','39','--used',str(b['phase_runs']),'--reserved','0','--require-stack-binds','--expect-stack-chips','20000','--chips-per-bb','100','--role-names','EVALUATION','--ledger',str(ops.LEDGER),'--programme','F5P136-','--json',str(F/receipt)]
    with own('evidence/preflight-launch-'+tag+'.log').open('x') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
    if r.returncode or read(receipt)['verdict']!='GO':raise ValueError('current launch A8 refusal')
    write('evidence/admission-'+tag+'.json',dict(at=stamp(),out=co['out'],budget_before=b,reserved_hours=reserve,original_freeze_sha256=E_FREEZE,operational_freeze_sha256=sha('OPERATIONAL-FREEZE.json'),job_sha256=sha(co['job_file']),pio_count_before=0,threads=8,processes=1))
    return subprocess.run([sys.executable,'-I','-B',str(E/'src/f5_native_launch.py'),co['out'],'--jobs-src',str(F/co['job_file'])]).returncode
def collect(tag):
    common,ops,_,_=release_check();co=read('LAYOUT.json')['cohorts'][tag];out=co['out'];events=[e for e in ops.events() if e.get('out')==out and not e.get('dry')]
    if len([e for e in events if e['event']=='launch'])!=1 or events[-1]['event']!='exit' or type(events[-1]['rc']) is not int or events[-1]['rc_source'] not in ('m1_marker','m1_marker_tmp'):raise ValueError('reconcile same original native outcome before copy')
    dest=F/'m1'/out;dest.parent.mkdir(exist_ok=True)
    if dest.exists():raise ValueError('existing canonical copy; reconcile, never overwrite')
    script="$p='"+ops.REMOTE+'\\'+out+"';$h=@{};Get-ChildItem -LiteralPath $p -File -Recurse|ForEach-Object{$k=$_.FullName.Substring($p.Length+1).Replace('\\','/');$h[$k]=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLower()};@{files=$h;pio_count=@(Get-Process PioSOLVER* -ErrorAction SilentlyContinue).Count}|ConvertTo-Json -Depth 4 -Compress"
    proof=ops.remote_ps(script)
    if not proof['files'] or proof['pio_count']!=0:raise ValueError('idle native copy proof required')
    cp=subprocess.run([ops.HELPER,'scp','-r','danie@192.168.0.51:C:/sp-v31/hv31-pot136-20261126-01a1e479/'+out,str(dest.parent)+'/'],capture_output=True,text=True,timeout=180)
    if cp.returncode:raise RuntimeError(cp.stderr)
    subprocess.run(['sudo','-n','chown','-R','smarter.poker:staff',str(dest)],check=True)
    local={str(p.relative_to(dest)):sha(p) for p in dest.rglob('*') if p.is_file()};report=dict(at=stamp(),jobs=len(co['ids']),native_exit=events[-1]['rc'],local_files=local,remote_files=proof['files'],pio_count_after=0,rainbow_solo_pass=False,strength_metrics_read=False)
    try:
        if local!=proof['files']:raise ValueError('canonical native byte copy differs')
        _,summary=ops.technical([F/co['job_file']],[dest])
        if events[-1]['rc']!=0:raise ValueError('native nonzero outcome')
        report.update(verdict='PASS_NATIVE_COPY_A2_TECHNICAL',summary=summary,rainbow_solo_pass=co['rainbow_solo'])
    except Exception as error:
        report.update(verdict='TERMINAL_TECHNICAL_FAIL',error=repr(error),summary=None)
        try:report['summary']=ops.results_loader().load([F/co['job_file']],[dest],expect_driver={common.sha('driver/f4_lock_driver.py')}).summary()
        except Exception as loader_error:report['loader_error']=repr(loader_error)
        write('evidence/technical-'+tag+'.json',report);write('TERMINAL-TECHNICAL-FAIL.json',report);raise SystemExit('terminal native/copy/A2 failure; no retry/dependent launch')
    write('evidence/technical-'+tag+'.json',report);print(json.dumps(dict(cohort=tag,verdict=report['verdict'])))
def score():
    common,ops,scorer,c=release_check();layout=read('LAYOUT.json');tags=layout['order']
    if (F/'TERMINAL-TECHNICAL-FAIL.json').exists():raise ValueError('technical failure terminal')
    for tag in tags:
        if read('evidence/technical-'+tag+'.json')['verdict']!='PASS_NATIVE_COPY_A2_TECHNICAL':raise ValueError('all16 clean technical gates before once score')
    events=ops.events();launches=eval_launches(events);expected_outs={layout['cohorts'][t]['out'] for t in tags}
    if len(launches)!=6 or {x['out'] for x in launches}!=expected_outs:raise ValueError('exact original16 jobs through only6 approved partitions required')
    if ops.budget(events)['open_operations']:raise ValueError('native operation still open')
    ops.idle()
    # One globally exclusive claim at ORIGINAL E prevents original/F double use.
    common.write('EVALUATION-CLAIM.json',dict(at=stamp(),route='operational_partition_continuation',original_freeze_sha256=E_FREEZE,operational_freeze_sha256=sha('OPERATIONAL-FREEZE.json'),release_sha256=sha('NATIVE-RELEASE.json'),candidate_sha256=common.sha('CANDIDATE-SEAL.json')))
    result,summary=ops.technical([F/layout['cohorts'][t]['job_file'] for t in tags],[F/'m1'/layout['cohorts'][t]['out'] for t in tags]);rows=[]
    for tag in tags:
        for job in read(layout['cohorts'][tag]['job_file']):
            pot=job['phases'][0]['scenario']['pot_chips']
            for seat,key in (('ip','oop_mes_chips'),('oop','ip_mes_chips')):
                row=dict(id=job['id'],source_train_id=job['meta']['source_train_id'],family=job['meta']['family'],position=job['meta']['position'],seat=seat.upper(),pot=pot)
                for recipe in ('baseline','range_root'):
                    value=result.delta_vs_eq(job['id'],seat+'_all|'+recipe,key);row[recipe]=100*value.value/pot+value.bound_pct
                    if not math.isfinite(row[recipe]):raise ValueError('finite original UPPER metric required')
                rows.append(row)
    stats=scorer.compare(rows);out=dict(at=stamp(),stage='EVALUATION',rows=rows,stats=stats,verdict='POT_CONTEXT_QUALIFICATION_PASS' if stats['eligible'] else 'POT_CONTEXT_QUALIFICATION_FAIL',candidate_sha256=common.sha('CANDIDATE-SEAL.json'),fit_sha256=FIT,original_freeze_sha256=E_FREEZE,operational_freeze_sha256=sha('OPERATIONAL-FREEZE.json'),technical_summary=summary,same_original_job_objects=True,prior_flop_exposure=True,authored80bbproxy_ranges=True,realistic_preflop_qualification=False,legacy_global_final_qualification=False,held_out_global_ranks=False,live_play=False)
    write('EVALUATION-RESULT.json',out)
    if stats['eligible']:
        write('CONTEXT-CERTIFICATE.json',dict(state='POT_CONTEXT_INTERPOLATION_QUALIFIED_PROXY_RANGES',candidate_sha256=common.sha('CANDIDATE-SEAL.json'),fit_sha256=FIT,models=common.read('FIT.json')['models'],result_sha256=sha('EVALUATION-RESULT.json'),original_freeze_sha256=E_FREEZE,operational_freeze_sha256=sha('OPERATIONAL-FREEZE.json'),scope='same16originalE200bb555/585potexactcontexts; only operational partition changed',freshness=c['freshness'],new_candidate_fullpot600_performance='UNVERIFIED_NOT_CERTIFIED',broader_depth_native_qualification=False,prior_flop_exposure=True,authored80bbproxy_ranges=True,realistic_preflop_qualification=False,legacy_global_final_qualification=False,held_out_global_ranks=False,live_play=False))
    print(json.dumps({k:v for k,v in out.items() if k not in ('rows','technical_summary')}))
def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=('prepare','stage','launch','collect','score'));parser.add_argument('tag',nargs='?');parser.add_argument('--refusal');parser.add_argument('--refusal-sha256');args=parser.parse_args()
    if args.action=='prepare':return prepare(args.refusal,args.refusal_sha256)
    if args.action=='stage':return stage()
    if args.action=='launch':return launch(args.tag)
    if args.action=='collect':return collect(args.tag)
    return score()
if __name__=='__main__':sys.exit(main())
