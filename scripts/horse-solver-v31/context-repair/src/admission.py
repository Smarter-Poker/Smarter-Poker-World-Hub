"""Reuse pinned structural proof, join all global launches; never read answers."""
import hashlib,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from prepare import B,P,W,A,load,write,sha
sys.path.insert(0,str(A/'src'))
from context_provenance import source_paths
def game_key(s):return hashlib.sha256(json.dumps({k:v for k,v in s.items() if k not in ('scenario_id','depth_bucket','purpose')},sort_keys=True,separators=(',',':')).encode()).hexdigest()
def inspect():
    prior=A/'evidence/context-admission-v2.json';base=A/'evidence/context-provenance-v3.json'
    assert sha(prior)=='8d9c52ab3e4678ff04579bcaa3f96d6c6d21ae8db1f327ea7e7541edd98909b4'
    proof=load(prior);assert proof['verdict']=='PASS_CONTEXT_INPUT_PROVENANCE' and not proof['errors'] and not proof['previous_context_matches']
    public=load(base);paths,omitted,aliases=source_paths()
    for p in paths:assert str(p) in public['files'] and sha(p)==public['files'][str(p)],'historical public inputs changed'
    for p,v in proof['solver_input_shapes'].items():assert sha(p)==v['sha256'],'public direct input changed'
    design=load(B/'evidence/design.json')
    for p,h in design['input_pins'].items():assert sha(p)==h,'role identity input drift'
    specs=load(B/'spec.json');keys={j['meta']['game_key_sha256'] for j in specs}
    assert all(game_key(j['phases'][0]['scenario'])==j['meta']['game_key_sha256'] for j in specs)
    ledger=W/'flop5/logs/budget.jsonl';events=[json.loads(s) for s in ledger.read_text().splitlines() if s.strip()]
    joined={};protected=[];matches=[];opened={}
    for e in events:
        if e.get('dry'):continue
        k=(e.get('out'),e.get('tag','first'))
        if e.get('event')=='launch':
            assert k not in opened;opened[k]=e
            p=Path(e['jobs_src'])
            own_public_job=p.parent==B and p.name.startswith('jobs-')
            if not own_public_job and any(x in str(p).upper() for x in ('FINAL','EXAM','SELECT','HOLDOUT','RESERVED','M2')):
                assert p.is_relative_to(W),'unknown protected source outside role proof'
                protected.append(dict(path=str(p),ledger_sha256=e['jobs_sha256_mac'],excluded_by='new global signatures proven historical TRAIN-only; D2 rank exclusions'))
                continue
            assert sha(p)==e['jobs_sha256_mac'],'ledger source drift'
            js=load(p);assert isinstance(js,list) and js
            joined[str(p)]=sha(p)
            for j in js:
                assert isinstance(j.get('phases'),list) and j['phases']
                for ph in j['phases']:
                    s=ph['scenario'];assert isinstance(s,dict)
                    if game_key(s) in keys:matches.append(dict(id=j['id'],state_key=game_key(s)))
        elif e.get('event')=='exit':
            assert k in opened;opened.pop(k)
    assert not opened,'global operation unresolved'
    # During later launch admission our own TRAIN/DEV matches are intentional;
    # only the exact next frozen cohort must be untouched.
    return dict(verdict='PASS_CONTEXT_INPUT_PROVENANCE',prior_proof_sha256=sha(prior),prior_structural_proof_sha256=sha(base),public_programme_inputs=len(paths),public_direct_solver_inputs=len(proof['solver_input_shapes']),ledger_sha256=sha(ledger),ledger_jobs=joined,protected_sources_not_opened=protected,previous_context_matches=matches,errors=[],public_metadata_only=True)
if __name__=='__main__':
    result=inspect();assert not result['previous_context_matches'],'new planned state previously launched';write(B/'evidence/admission.json',result);print(json.dumps({k:result[k] for k in ('verdict','public_programme_inputs','public_direct_solver_inputs','previous_context_matches')}))
