"""One explicit stage release/stage copy. Never launches a cohort."""
import sys,subprocess,datetime
from pathlib import Path
D=Path(__file__).resolve().parents[1];sys.path.insert(0,str(D/'src'))
from common import frozen,config,read,write,sha
from ops import W,REMOTE,HELPER,remote_ps,idle,budget,events,reserved_runs
from stage_namespace import ensure_namespace
from candidate_chain import candidate_chain
stage=sys.argv[1];assert stage in ('HARVEST','TRAIN','EVALUATION');frozen();c,g=config();b=budget(events());assert not b['open_operations'];idle();files={};helpers=[D/'driver'/n for n in ('f4_lock_driver.py','f4_storage.py','f1_readback.py','f4_m1.py','context_deadline.py','native_telemetry.py')];names={p.name:sha(p) for p in helpers};assert len(names)==6
if stage!='HARVEST':
 files.update(candidate_chain())
 assert read('evidence/'+stage+'-table-audit.json')['accepted'] is True
 seal=read(stage+'-JOBS-SEAL.json');assert seal['freeze_sha256']==sha('FREEZE.json') and seal['candidate_sha256']==sha('CANDIDATE-SEAL.json')
 for p,h in seal['files'].items():assert sha(p)==h
 if stage=='EVALUATION':assert read('TRAIN-RESULT.json')['stats']['eligible'] is True
created=ensure_namespace(remote_ps,REMOTE,sha('FREEZE.json'))
if created:
 for p in helpers:
  r=subprocess.run([HELPER,'scp',str(p),'danie@192.168.0.51:C:/sp-v31/hv31-follow-20261126-01a1e479/'+p.name],capture_output=True,text=True,timeout=60);assert r.returncode==0,r.stderr
for tag,co in c['cohorts'].items():
 if co['stage']!=stage:continue
 jp=D/('jobs-'+tag+'.json');receipt=D/('evidence/release-preflight-'+tag+'.json');cmd=[sys.executable,'-I','-B',str(W/'flop4/A8/preflight.py'),'--jobs',str(jp),'--driver',str(D/'driver/f4_lock_driver.py'),'--expect-driver-sha',sha('driver/f4_lock_driver.py'),'--expect-accuracy','.001','--cap','45','--used',str(b['phase_runs']),'--reserved',str(reserved_runs(stage,events())),'--require-stack-binds','--chips-per-bb','100','--role-names','EVALUATION','--expect-stack-chips',str(co['stack']),'--json',str(receipt)]
 with (D/('evidence/release-preflight-'+tag+'.log')).open('x') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 assert r.returncode==0 and read(receipt)['verdict']=='GO';files[str(jp.relative_to(D))]=sha(jp);files[str(receipt.relative_to(D))]=sha(receipt);target='jobs-F5FOLLOW-'+tag+'.json'
 remote_ps("$p='"+REMOTE+'\\'+target+"';if(Test-Path -LiteralPath $p){throw 'already exists'};@{absent=$true}|ConvertTo-Json -Compress")
 r=subprocess.run([HELPER,'scp',str(jp),'danie@192.168.0.51:C:/sp-v31/hv31-follow-20261126-01a1e479/'+target],capture_output=True,text=True,timeout=60);assert r.returncode==0,r.stderr;names[target]=sha(jp)
script="$p='"+REMOTE+"';$h=@{};@("+','.join("'"+n+"'" for n in names)+")|ForEach-Object{$h[$_]=(Get-FileHash -Algorithm SHA256 -LiteralPath ($p+'\\'+$_)).Hash.ToLower()};@{files=$h;pio_count=@(Get-Process PioSOLVER* -ErrorAction SilentlyContinue).Count}|ConvertTo-Json -Depth 4 -Compress"
proof=remote_ps(script);assert proof['files']==names and proof['pio_count']==0;write('evidence/stage-'+stage+'.json',proof);files['evidence/stage-'+stage+'.json']=sha('evidence/stage-'+stage+'.json')
files.update(read('FREEZE.json')['source_files']);files['INPUTS.json']=sha('INPUTS.json');files['RANGE-STATUS.json']=sha('RANGE-STATUS.json')
r=dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,freeze_sha256=sha('FREEZE.json'),files=files,live_play=False)
if stage!='HARVEST':
 for p in ['CANDIDATE-SEAL.json','FIT.json',stage+'-JOBS-SEAL.json','evidence/'+stage+'-table-audit.json']:files[p]=sha(p)
 r.update(candidate_sha256=sha('CANDIDATE-SEAL.json'),jobs_seal_sha256=sha(stage+'-JOBS-SEAL.json'))
 if stage=='EVALUATION':files['TRAIN-RESULT.json']=sha('TRAIN-RESULT.json')
write(stage+'-RELEASE.json',r);print(stage+' release SHA '+sha(stage+'-RELEASE.json'))
