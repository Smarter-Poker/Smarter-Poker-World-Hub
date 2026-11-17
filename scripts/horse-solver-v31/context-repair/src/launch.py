"""One explicit cohort; unchanged global ledger and original remote guards."""
import datetime,fcntl,json,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,P,W,load,write,sha,frozen,candidate_frozen
from admission import inspect
from context_deadline import reserve_hours
HELPER='/Users/smarter.poker/.smarter-poker/ops/solver-host.sh'
def budgets(events):
    opened={};runs=0;seconds=0.;repair=0.;repair_runs=0;d3=0.
    for e in events:
        if e.get('dry'):continue
        key=(e.get('out'),e.get('tag','first'))
        if e.get('event')=='launch':
            assert key not in opened;opened[key]=e;runs+=e['solver_runs_max']
            if e['out'].upper().startswith('F5TAIL-'):repair_runs+=e['solver_runs_max']
        elif e.get('event')=='exit':
            assert key in opened;l=opened.pop(key);assert e['rc']==0,'prior failed operation requires diagnosis'
            elapsed=(datetime.datetime.fromisoformat(e['at'].replace('Z','+00:00'))-datetime.datetime.fromisoformat(l['at'].replace('Z','+00:00'))).total_seconds();assert elapsed>=0
            seconds+=elapsed
            if e['out'].upper().startswith('F5TAIL-'):repair+=elapsed
            if e['out'].upper().startswith(('F5D3-','F5CTX-','F5REPAIR-','F5TAIL-')):d3+=elapsed
    return dict(runs=runs,hours=seconds/3600,repair_runs=repair_runs,repair_hours=repair/3600,d3_hours=d3/3600,open_operations=list(opened))
def idle():
    code='@{pio_count=@(Get-Process PioSOLVER* -ErrorAction SilentlyContinue).Count} | ConvertTo-Json -Compress'
    r=subprocess.run([HELPER,'m1','powershell -NoProfile -Command "'+code+'"'],capture_output=True,text=True,timeout=45)
    assert r.returncode==0 and json.loads(r.stdout)['pio_count']==0,'M1 is not idle'
def main():
    assert len(sys.argv)==3;stage,suffix=sys.argv[1:];assert stage=='EVAL'
    out='F5TAIL-'+stage+'-'+suffix;jp=B/('jobs-'+stage+'-'+suffix+'.json')
    with (B/'launch.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);frozen()
        if stage!='TRAIN':candidate_frozen()
        release=load(B/('RELEASE-'+stage+'.json'));assert release['accepted'] is True and release['freeze_sha256']==sha(B/'FREEZE.json')
        for p,h in release['files'].items():assert sha(p)==h,'release drift: '+p
        report=load(B/('evidence/build-'+stage+'.json'));assert str(jp) in report['files']
        assert set(release['job_files'])==set(report['files'])
        review=Path(release['reviewer_path']).read_text();assert sha(release['reviewer_path'])==release['reviewer_sha256'] and 'ACCEPT' in review
        assert sha(B/'driver/f4_lock_driver.py') in review and all(p in review and release['files'][p] in review for p in release['job_files'])
        pre=load(release['preflight_path']);assert pre['verdict']=='GO' and pre['driver_sha256']==sha(B/'driver/f4_lock_driver.py')
        assert pre['job_sha256']=={p:release['files'][p] for p in release['job_files']}
        js=load(jp);assert js and all(j['meta']['role']==stage and len(j['phases'])==1 and 'exploit' not in j['phases'][0] for j in js)
        current=inspect();keys={j['meta']['game_key_sha256'] for j in js}
        assert not any(x['state_key'] in keys for x in current['previous_context_matches']),'cohort already consumed/launched'
        events=[json.loads(s) for s in (W/'flop5/logs/budget.jsonl').read_text().splitlines() if s.strip()]
        budget=budgets(events);assert not budget['open_operations'];reserve=reserve_hours(len(js))
        assert budget['runs']+len(js)<=2000 and budget['repair_runs']+len(js)<=360
        assert budget['hours']+reserve<=40 and budget['repair_hours']+reserve<=6 and budget['d3_hours']+reserve<=18
        rainbow=suffix.startswith('R');assert all((j['meta']['family']=='UNPR')==rainbow for j in js)
        if rainbow and suffix!='R00':
            trial=B/'m1/F5TAIL-EVAL-R00'
            trialjob=load(B/'jobs-EVAL-R00.json')[0];o=load(trial/(trialjob['id']+'.json'));ph=o['phases'][0]
            assert o['status']=='ok' and all(type(k) in (int,float) and 0<k*1024<1.6e9 for k in (ph['ws_kb_after_solve'],o['ws_kb_end'])),'declared rainbow trial not passed'
            assert (B/'evidence/idle-after-EVAL-R00.json').exists()
        idle()
        write(B/('evidence/admission-'+stage+'-'+suffix+'.json'),dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),out=out,freeze_sha256=sha(B/'FREEZE.json'),release_sha256=sha(B/('RELEASE-'+stage+'.json')),jobs_sha256=sha(jp),budget_before=budget,reserved_process_hours=reserve,pio_count_before=0,provenance=current))
        script='source /Users/smarter.poker/claude-work/v31/ssh_env.sh\nexec sudo -n /usr/bin/env F4_M1="$M1" F4_SSHO="$SSHO" "$1" -I -B "$2" "$3" --jobs-src "$4"'
        py=P/'hv31-flop5-recovery-01a1e479/venv/bin/python'
        rc=subprocess.run(['/bin/bash','-c',script,'repair-admission',str(py),str(B/'src/f5_context_launch.py'),out,str(jp)]).returncode
        if rc==0 and rainbow:
            idle();write(B/('evidence/idle-after-'+stage+'-'+suffix+'.json'),dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),pio_count=0))
        return rc
if __name__=='__main__':raise SystemExit(main())
