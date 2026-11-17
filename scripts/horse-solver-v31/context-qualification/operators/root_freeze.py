"""One prospective method freeze, after actual source/data review and A8 gates."""
import sys,json,datetime,subprocess
from pathlib import Path
B=Path(__file__).resolve().parents[1];sys.path.insert(0,str(B/'src'))
from common import config,read,write,sha
from ops import W,budget,events,idle
assert not (B/'FREEZE.json').exists();c,g=config()
for p,v in c['inputs'].items():g.read(p,v['role'])
review=read('evidence/independent-review-final.json');assert review['accepted'] is True
for p,h in review['files'].items():assert sha(p)==h,'reviewed source drift '+p
assert read('evidence/stack-feature-proof.json')['verdict']=='EXACT_ACTUAL_PUBLIC_PRODUCER_PARITY';assert read('RANGE-STATUS.json')['realistic_preflop_qualification'] is False
b=budget(events());assert b['runs']==737 and b['phase_runs']==0 and not b['open_operations'];assert b['combined_hours']+4<=18 and b['hours']+4<=40
write('evidence/freeze-budget-idle.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),budget=b,**idle()))
preflights={}
for tag,co in c['cohorts'].items():
 if co['stage']!='HARVEST':continue
 jp=B/('jobs-'+tag+'.json');receipt=B/('evidence/freeze-preflight-'+tag+'.json');cmd=[sys.executable,'-I','-B',str(W/'flop4/A8/preflight.py'),'--jobs',str(jp),'--driver',str(B/'driver/f4_lock_driver.py'),'--expect-driver-sha',sha('driver/f4_lock_driver.py'),'--expect-accuracy','.001','--cap','77','--used','0','--reserved','32','--require-stack-binds','--expect-stack-chips',str(co['stack']),'--chips-per-bb','100','--json',str(receipt)]
 with (B/('evidence/freeze-preflight-'+tag+'.log')).open('x') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 assert r.returncode==0 and read(receipt)['verdict']=='GO';preflights[str(receipt.relative_to(B))]=sha(receipt)
source=[*B.joinpath('src').glob('*.py'),*B.joinpath('operators').glob('*.py'),*B.joinpath('driver').glob('*.py'),B/'PLAN.md',B/'RANGE-STATUS.json',B/'safe-padding-v2.json',B/'test_source_contract.py',B/'test_runtime.py',B/'test_range_profile.py',B/'benchmark_runtime.py',B/'evidence/stack-feature-proof.json']
source+=[B/('jobs-'+tag+'.json') for tag,co in c['cohorts'].items() if co['stage']=='HARVEST']
assert all(str(p.relative_to(B)) in review['files'] and review['files'][str(p.relative_to(B))]==sha(p) for p in source),'every computational byte must be reviewed'
write('FREEZE.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),plan='EXPANDED_CONTEXT_QUALIFICATION_V1',inputs_sha256=sha('INPUTS.json'),source_files={str(p.relative_to(B)):sha(p) for p in source},independent_review_sha256=sha('evidence/independent-review-final.json'),preflights=preflights,budget_idle_sha256=sha('evidence/freeze-budget-idle.json'),live_play=False,held_out_global_ranks=False,realistic_preflop_qualification=False))
print(json.dumps(dict(freeze_sha256=sha('FREEZE.json'),source_files=len(source),inputs=len(c['inputs']),preflights=len(preflights))))
