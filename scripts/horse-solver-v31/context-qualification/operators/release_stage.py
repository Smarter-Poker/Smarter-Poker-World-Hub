"""Explicit stagepreflight and actualhash release; never startsnative."""
import sys,json,subprocess,datetime
from pathlib import Path
B=Path(__file__).resolve().parents[1];sys.path.insert(0,str(B/'src'))
from common import frozen,read,write,sha,config
from ops import W,REMOTE,HELPER,remote_ps,idle,budget,events
stage=sys.argv[1];assert stage in ['HARVEST','EVALUATION','JD'];frozen();c,g=config();b=budget(events());assert not b['open_operations'];idle();files={};names={p.name:sha(p) for p in (B/'driver').glob('*.py')}
if stage=='HARVEST':
 proof=remote_ps("$p='"+REMOTE+"';if(Test-Path -LiteralPath $p){throw 'namespace exists'};New-Item -ItemType Directory -Path $p|Out-Null;@{created=$true}|ConvertTo-Json -Compress");assert proof['created']
 for p in (B/'driver').glob('*.py'):
  r=subprocess.run([HELPER,'scp',str(p),'danie@192.168.0.51:C:/sp-v31/hv31-nextq-01a1e479/'+p.name],capture_output=True,text=True,timeout=60);assert r.returncode==0,r.stderr
else:
 assert read('evidence/'+stage+'-table-audit.json')['accepted'] is True
 assert read('CANDIDATE-SEAL.json')['fit_sha256']==sha('FIT.json');assert len(read('FIT.json')['models'])==8
 for p,v in read('FIT.json')['models'].items():assert sha(p)==v['sha256'];files[p]=sha(p)
 assert read(stage+'-JOBS-SEAL.json')['freeze_sha256']==sha('FREEZE.json')
 for p,h in read(stage+'-JOBS-SEAL.json')['files'].items():assert sha(p)==h
for tag,co in c['cohorts'].items():
 if co['stage']!=stage:continue
 jp=B/('jobs-'+tag+'.json');receipt=B/('evidence/release-preflight-'+tag+'.json');cmd=[sys.executable,'-I','-B',str(W/'flop4/A8/preflight.py'),'--jobs',str(jp),'--driver',str(B/'driver/f4_lock_driver.py'),'--expect-driver-sha',sha('driver/f4_lock_driver.py'),'--expect-accuracy','.001','--cap','77','--used',str(b['phase_runs']),'--reserved',str({'HARVEST':32,'EVALUATION':16,'JD':0}[stage]),'--require-stack-binds','--chips-per-bb','100','--role-names','EVALUATION','--json',str(receipt)]
 if co['stack'] is not None:cmd+=['--expect-stack-chips',str(co['stack'])]
 with (B/('evidence/release-preflight-'+tag+'.log')).open('x') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 assert r.returncode==0 and read(receipt)['verdict']=='GO';files[str(jp.relative_to(B))]=sha(jp);files[str(receipt.relative_to(B))]=sha(receipt);target='jobs-F5NQ-'+tag+'.json'
 remote_ps("$p='"+REMOTE+'\\'+target+"';if(Test-Path -LiteralPath $p){throw 'already exists'};@{absent=$true}|ConvertTo-Json -Compress")
 r=subprocess.run([HELPER,'scp',str(jp),'danie@192.168.0.51:C:/sp-v31/hv31-nextq-01a1e479/'+target],capture_output=True,text=True,timeout=60);assert r.returncode==0,r.stderr;names[target]=sha(jp)
script="$p='"+REMOTE+"';$h=@{};@("+','.join("'"+n+"'" for n in names)+")|ForEach-Object{$h[$_]=(Get-FileHash -Algorithm SHA256 -LiteralPath ($p+'\\'+$_)).Hash.ToLower()};@{files=$h;pio_count=@(Get-Process PioSOLVER* -ErrorAction SilentlyContinue).Count}|ConvertTo-Json -Depth 4 -Compress"
proof=remote_ps(script);assert proof['files']==names and proof['pio_count']==0;write('evidence/stage-'+stage+'.json',proof);files['evidence/stage-'+stage+'.json']=sha('evidence/stage-'+stage+'.json')
for p,h in read('FREEZE.json')['source_files'].items():files[p]=h
files['INPUTS.json']=sha('INPUTS.json');files['RANGE-STATUS.json']=sha('RANGE-STATUS.json')
if stage!='HARVEST':
 for p in ['evidence/'+stage+'-table-audit.json','FIT.json','FIT-ADMISSION.json','CANDIDATE-SEAL.json','DATA-RELEASE.json','DATASET.json',stage+'-JOBS-SEAL.json','evidence/'+stage+'-table-audit.json']:files[p]=sha(p)
 for p,h in read('DATA-RELEASE.json')['native_sources'].items():
  assert sha(p)==h;files[str(Path(p).relative_to(B))]=h
 for tag,co in c['cohorts'].items():
  if co['stage']=='HARVEST':p='evidence/technical-'+tag+'.json';files[p]=sha(p)
 for p,h in read('DATA-RELEASE.json')['files'].items():files[str(Path(p).relative_to(B))]=h
 for p,h in read('DATA-RELEASE.json')['native_sources'].items():
  assert sha(p)==h;files[str(Path(p).relative_to(B))]=h
 for tag,co in c['cohorts'].items():
  if co['stage']=='HARVEST':
   p='evidence/technical-'+tag+'.json';assert read(p)['verdict']=='PASS_NATIVE_COPY_A2_TECHNICAL';files[p]=sha(p)
r=dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,freeze_sha256=sha('FREEZE.json'),files=files,live_play=False)
if stage!='HARVEST':r.update(candidate_sha256=sha('CANDIDATE-SEAL.json'),jobs_seal_sha256=sha(stage+'-JOBS-SEAL.json'))
write(stage+'-RELEASE.json',r);print(json.dumps(dict(stage=stage,release_sha256=sha(stage+'-RELEASE.json'),files=len(files),staged=len(names))))
