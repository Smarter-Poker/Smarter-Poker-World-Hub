"""One-shot paired comparison. All technical gates precede any metric access."""
import json,math,sys,datetime
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,W,load,write,sha,candidate_frozen,frozen
sys.path.insert(0,str(W/'flop4/A2'))
import f4_results
def memory_bytes(k):
    if type(k) not in (int,float) or not math.isfinite(k) or k<=0:raise ValueError('invalid working-set sample')
    return k*1024
def technical(stage):
    report=load(B/('evidence/build-'+stage+'.json'));jobs=[Path(p) for p in report['files']]
    dirs=[B/'m1'/('F5TAIL-'+stage+'-'+p.stem.rsplit('-',1)[1]) for p in jobs]
    expected=[j for p in jobs for j in load(p)]
    R=f4_results.load(jobs,dirs,expect_driver={sha(B/'driver/f4_lock_driver.py')})
    summary=R.summary()
    assert len(R.sessions)==len(expected) and all(v['state']=='ok_clean' for v in R.sessions.values()),'A2 completeness/state gate'
    assert not summary['stray_files'] and not summary['outputs_without_provenance'],'A2 provenance/stray gate'
    for p,od in zip(jobs,dirs):
        assert sha(p)==report['files'][str(p)]['sha256']
        for j in load(p):
            o=load(od/(j['id']+'.json'));ph=o['phases'][0];s=j['phases'][0]['scenario']
            residual=ph['eq']['exploitability_chips']/s['pot_chips']
            assert math.isfinite(residual) and 0<=residual<=.001+1e-9,'convergence gate'
            assert o['solver_runs']==1 and ph['solve_accuracy']==.001 and ph['rake']==[.1,250]
            for name,key in (('f4_storage.py','storage_sha256'),('f1_readback.py','readback_sha256'),('f4_m1.py','m1helper_sha256'),('context_deadline.py','deadline_sha256')):assert o['provenance'][key]==sha(B/'driver'/name),'source provenance gate'
            cap=1.6e9 if j['meta']['family']=='UNPR' else 1.25e9
            assert all(memory_bytes(k)<cap for k in (ph['ws_kb_after_solve'],o['ws_kb_end'])),'sampled memory gate'
    return R,expected,summary
def endpoint(value,pot):
    raw=100.*value.value/pot;bound=float(value.bound_pct)
    assert math.isfinite(raw) and math.isfinite(bound) and bound>=0
    return raw+bound
def compare(rows):
    base=[r['baseline'] for r in rows];cand=[r['candidate'] for r in rows]
    families=sorted({r['family'] for r in rows})
    means={f:{name:float(np.mean([r[name] for r in rows if r['family']==f])) for name in ('baseline','candidate')} for f in families}
    improved=float(np.mean(cand))<=.9*float(np.mean(base)) and max(cand)<=max(base)+.5 and all(x['candidate']<=x['baseline']+.5 for x in means.values())
    return dict(improved=bool(improved),absolute_pass=max(cand)<=3.,baseline_mean=float(np.mean(base)),candidate_mean=float(np.mean(cand)),baseline_max=max(base),candidate_max=max(cand),family_means=means)
def main():
    stage=sys.argv[1];assert stage=='EVAL';frozen()
    if stage!='TRAIN':candidate_frozen()
    result=B/('evidence/'+stage+'-result.json');assert not result.exists(),'terminal result already exists'
    if stage!='TRAIN':
        # Durable one-shot claim happens before technical/metric reads. Even a
        # crash/technical failure cannot silently grant a second evaluation.
        write(B/('evidence/'+stage+'-consumption.json'),dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),stage=stage,candidate_sha256=sha(B/'CANDIDATE.json'),states=[dict(id=j['id'],sig=j['meta']['sig'],state_key=j['meta']['game_key_sha256']) for j in load(B/'spec.json') if j['meta']['role']==stage]))
    out=dict(stage=stage,verdict='UNVERIFIED',rows=[],live_play=False,original_unseen_flop_qualification='BLOCKED_ZERO')
    try:
        R,js,summary=technical(stage);out['technical_summary']=summary
        if stage=='TRAIN':out['verdict']='PASS_TRAIN_TECHNICAL'
        else:
            rows=[]
            for j in js:
                for seat,key in (('ip','oop_mes_chips'),('oop','ip_mes_chips')):
                    row=dict(id=j['id'],family=j['meta']['family'],position=j['meta']['position'],seat=seat)
                    for name in ('baseline','original','candidate'):row[name]=endpoint(R.delta_vs_eq(j['id'],seat+'_all|'+name,key),j['phases'][0]['scenario']['pot_chips'])
                    rows.append(row)
            out['rows']=rows;out.update(compare(rows))
            original=compare([dict(r,baseline=r['original']) for r in rows]);out['versus_original']=original
            two=out['family_means']['UNP2T'];two_original=original['family_means']['UNP2T']
            out['two_tone_nonregression']=two['candidate']<=two['baseline'] and two_original['candidate']<=two_original['baseline']
            out['improved']=out['improved'] and original['improved'] and out['two_tone_nonregression']
            out['verdict']=('FINITE_CONTEXT_QUALIFIED' if out['absolute_pass'] else 'IMPROVED_NOT_QUALIFIED') if out['improved'] else 'FAIL_CONTEXT_IMPROVEMENT'
    except (AssertionError,ValueError,KeyError,TypeError,OSError,f4_results.ResultsError) as e:out.update(verdict='UNVERIFIED',rows=[],reason=str(e))
    write(result,out);print(json.dumps({k:v for k,v in out.items() if k not in ('rows','technical_summary')}))
if __name__=='__main__':main()
