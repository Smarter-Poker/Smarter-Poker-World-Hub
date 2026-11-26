"""Root runs only after actual public proof, focused tests and independent review."""
import sys,datetime,json
from pathlib import Path
D=Path(__file__).resolve().parents[1];sys.path.insert(0,str(D/'src'))
from common import config,read,write,sha
from context_scope import game_key
from pot_scope import require_pot_bracket
assert not (D/'FREEZE.json').exists();c,g=config();assert c['public_proof']['full_producer'] is True and c['public_proof']['nodes']==128 and len(c['public_proof']['control_parity'])==8
for p,v in c['inputs'].items():g.read(p,v['role'])
assert len(c['fit_jobs'])==136 and len(c['harvest_jobs'])==0 and len(c['training_jobs'])==16 and len(c['evaluation_jobs'])==16 and len(c['reused_native'])==32
train={game_key(j['phases'][0]['scenario']) for j in c['fit_jobs'].values()};held={game_key(j['phases'][0]['scenario']) for j in c['evaluation_jobs'].values()};assert len(train)==136 and len(held)==16 and not train&held
for j in c['evaluation_jobs'].values():require_pot_bracket(j['phases'][0]['scenario'],[x['phases'][0]['scenario'] for x in c['fit_jobs'].values()])
review=read('evidence/final-independent-review.json');assert review['verdict']=='ACCEPT' and review['inputs_sha256']==sha('INPUTS.json')
source=[*sorted((D/'src').glob('*.py')),*sorted((D/'driver').glob('*.py')),*sorted((D/'operators').glob('*.py')),D/'PLAN.md',D/'test_source_contract.py',D/'src/safe-padding-v2.json'];files={str(p.relative_to(D)):sha(p) for p in source}
for p,h in files.items():assert review['source_files'][p]==h,'review source drift '+p
write('FREEZE.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),format='HV31_FINITE_136_POT_DEPTH_FREEZE_V1',inputs_sha256=sha('INPUTS.json'),source_files=files,review_sha256=sha('evidence/final-independent-review.json'),fit_games=136,native_planned=32,native_cap=39,unused_spares=7,phase_cap_hours=2,combined_cap_hours=18,global_cap_hours=40,context_eval_exact_keys=sorted(held),authored80bbproxy_ranges=True,realistic_preflop_qualification=False,legacy_global_final_qualification=False,live_play=False))
print('NEW FREEZE '+sha('FREEZE.json'))
