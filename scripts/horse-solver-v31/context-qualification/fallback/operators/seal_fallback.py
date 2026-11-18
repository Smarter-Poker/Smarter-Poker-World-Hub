"""Freeze an explicitly imported candidate and untouched exact contexts; no fit."""
import datetime,hashlib,json,sys
from pathlib import Path
C=Path(__file__).resolve().parents[1];sys.path.insert(0,str(C/'src'))
from common import config,read,write,sha
from context_scope import game_key,require_bracket
from range_admission import range_status
from ops import budget,events,idle

def source_paths():
 return sorted([*C.glob('src/*.py'),*C.glob('operators/*.py'),*C.glob('driver/*.py'),*C.glob('test_*.py'),C/'PLAN.md',C/'POLICY-IMPORT.json',C/'RANGE-STATUS.json'])
def main():
 assert not (C/'FREEZE.json').exists()
 c,g=config();R=C.parent/'hv31-root-diagnosis-01a1e479';B=C.parent/'hv31-next-qualification-01a1e479'
 def admitted(p):return g.json(str(p),'SOURCE')
 fit=admitted(R/'FIT.json');rf=admitted(R/'FREEZE.json');ri=admitted(R/'INPUTS.json');dr=admitted(R/'DATA-RELEASE.json');cs=admitted(R/'CANDIDATE-SEAL.json');selected=admitted(R/'CONTEXT-CANDIDATE.json');bf=admitted(B/'FREEZE.json');bi=admitted(B/'INPUTS.json')
 def pin(p):return c['inputs'][str(p)]['sha256']
 assert pin(R/'FIT.json')=='0ccadcea5d4f8b67a9fc6ffbb72d5d2661cde3a0059a70e8f6bbb40d9a61df9c'
 assert pin(R/'FREEZE.json')=='26771edb53e65c2dbc9ce8eca3a5d140c2b1aa1023fa0b2b78c2e5a3ce591fa1'
 assert rf['inputs_sha256']==pin(R/'INPUTS.json') and bf['inputs_sha256']==pin(B/'INPUTS.json')
 assert fit['freeze_sha256']==pin(R/'FREEZE.json') and fit['data_release_sha256']==pin(R/'DATA-RELEASE.json') and dr['freeze_sha256']==pin(R/'FREEZE.json') and dr['accepted'] is True
 assert cs['fit_sha256']==pin(R/'FIT.json') and selected['fit_sha256']==pin(R/'FIT.json') and selected['candidate_seal_sha256']==pin(R/'CANDIDATE-SEAL.json') and selected['recipe']=='range_root' and selected['live_play'] is False
 assert fit['fit_games']==104 and fit['live_play'] is False and read('POLICY-IMPORT.json')['fit_sha256']==pin(R/'FIT.json')
 assert read('POLICY-IMPORT.json')['models']==c['models'] and len(c['models'])==8
 for name in ('fit_jobs','base_jobs','public_records','ranges','baseline_models'):assert c[name]==ri[name],name
 for rel,m in c['models'].items():
  assert {k:v for k,v in m.items() if k!='path'}==fit['models'][rel] and m['path']==str(R/rel)
  assert c['inputs'][m['path']]==dict(role='MODEL',sha256=m['sha256']);g.read(m['path'],'MODEL')
 for name in ('evaluation_jobs','jd_jobs'):
  expected={}
  for j in bi[name].values():
   j=json.loads(json.dumps(j));j['id']=j['id'].replace('f5nq.','f5fb.');j['phases'][0]['scenario']['scenario_id']=j['id'];expected[j['id']]=j
  assert c[name]==expected and len(expected)==16
 assert c['jd_reference_jobs']==bi['jd_reference_jobs'] and c['jd_reference_result']==bi['jd_reference_result']
 for j in c['evaluation_jobs'].values():
  target=j['phases'][0]['scenario'];require_bracket(target,[v['phases'][0]['scenario'] for v in c['fit_jobs'].values()])
  assert all(game_key(target) not in m['train_game_keys'] for m in c['models'].values())
 assert read('RANGE-STATUS.json')==range_status()
 proof=admitted(B/'evidence/stack-feature-proof.json');assert proof['verdict']=='EXACT_ACTUAL_PUBLIC_PRODUCER_PARITY' and len(proof['probes'])==6 and proof['only_changed_column']==98 and proof['labels_read'] is False
 ev=events();assert not any(e.get('event')=='launch' and not e.get('dry') and e.get('out','').upper().startswith(('F5NQ-E','F5FB-')) for e in ev),'evaluation already admitted'
 assert not (B/'EVALUATION-CLAIM.json').exists() and not (C/'EVALUATION-CLAIM.json').exists()
 b=budget(ev);assert not b['open_operations'];state=idle()
 for p,v in c['inputs'].items():g.read(p,v['role'])
 files={str(p.relative_to(C)):sha(p) for p in source_paths()}
 review=read('evidence/independent-review-final.json');assert review['accepted'] is True
 assert review['files']==dict(files,**{'INPUTS.json':sha('INPUTS.json')})
 write('evidence/freeze-budget-idle.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),budget=b,**state))
 write('FREEZE.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),source_files=files,inputs_sha256=sha('INPUTS.json'),policy_import_sha256=sha('POLICY-IMPORT.json'),independent_review_sha256=sha('evidence/independent-review-final.json'),fit_games=104,new_training=False,exact_contexts_unconsumed=True,live_play=False))
 print(json.dumps(dict(freeze_sha256=sha('FREEZE.json'),source_files=len(files),role_inputs=len(c['inputs']))))
if __name__=='__main__':main()
