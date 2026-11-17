"""One label-free benchmark of the already sealed range_root artifacts.

Uses only explicit public TRAIN feature matrices and authored ROOT ranges.
Never opens teacher labels, native outputs, evaluations or holdout payloads.
"""
import argparse, datetime, hashlib, io, json, os, platform, re, resource
import statistics, subprocess, sys, time
from pathlib import Path
import joblib, numpy as np, sklearn

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'src'))
from runtime import predict_batches
from models import predict

SP=('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr')

def digest(raw): return hashlib.sha256(raw).hexdigest()
def sample(fn,n):
    times=[]; result=None
    for _ in range(n):
        start=time.perf_counter_ns();result=fn();times.append((time.perf_counter_ns()-start)/1e6)
    return result,dict(samples_ms=times,median_ms=statistics.median(times),min_ms=min(times),max_ms=max(times))
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--campaign',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--fit-sha256',required=True);parser.add_argument('--candidate-seal',choices=('CONTEXT-CANDIDATE.json','CANDIDATE-SEAL.json'),required=True);parser.add_argument('--source-pins',type=Path,required=True);args=parser.parse_args()
    B=args.campaign.resolve();out=args.output.resolve()
    if not re.fullmatch('[0-9a-f]{64}',args.fit_sha256):raise ValueError('explicit sealed fit SHA256 required')
    FIT_SHA=args.fit_sha256
    if not out.is_relative_to(HERE) or out.exists(): raise PermissionError('new owned evidence output required')
    fitraw=(B/'FIT.json').read_bytes()
    if digest(fitraw)!=FIT_SHA: raise ValueError('unrecognized sealed TRAIN fit')
    fit=json.loads(fitraw);candidate=json.loads((B/args.candidate_seal).read_bytes())
    if candidate['fit_sha256']!=FIT_SHA or candidate.get('recipe','range_root')!='range_root' or candidate['live_play'] is not False:raise ValueError('candidate binding')
    releaseraw=(B/'DATA-RELEASE.json').read_bytes();release=json.loads(releaseraw);dsraw=(B/'DATASET.json').read_bytes()
    freezeraw=(B/'FREEZE.json').read_bytes();freeze=json.loads(freezeraw);configraw=(B/'INPUTS.json').read_bytes()
    if release.get('accepted') is not True or fit['data_release_sha256']!=digest(releaseraw) or fit['freeze_sha256']!=digest(freezeraw) or release['freeze_sha256']!=digest(freezeraw) or freeze['inputs_sha256']!=digest(configraw):raise ValueError('fit/data/freeze/input manifest binding mismatch')
    if digest(dsraw)!=release['dataset_sha256']:raise ValueError('public dataset metadata drift')
    data=json.loads(dsraw);config=json.loads(configraw)
    pinpath=args.source_pins.resolve()
    if not pinpath.is_relative_to(HERE):raise PermissionError('owned source pin manifest required')
    sourcepins=json.loads(pinpath.read_bytes())
    if set(sourcepins)!={str(B/'src'/n) for n in ('models.py','range_features.py','data_access.py')}:raise ValueError('exact canonical numerical source pins required')
    for p,h in sourcepins.items():
        if digest(Path(p).read_bytes())!=h:raise ValueError('source drift')
        if freeze['source_files'].get('src/'+Path(p).name)!=h:raise ValueError('numerical source is not frozen')
    if digest((HERE/'src/models.py').read_bytes())!=sourcepins[str(B/'src/models.py')]:raise ValueError('benchmark predictor differs from sealed source')
    sys.path.insert(0,str(B/'src'))
    from data_access import SafeInputs
    from range_features import features
    # Explicit feature/range list excludes every label/native/evaluation path.
    chosen={pos:min(r['id'] for r in data if r['position']==pos) for pos in ('HJ','UTG')}
    selected=[r for r in data if r['id'] in chosen.values()];assert len(selected)==8
    entries={r['features_path']:dict(role='TRAIN',sha256=r['features_sha256']) for r in selected}
    for r in selected:
        for p in config['ranges'][r['source_train_id']].values():entries[p]=config['inputs'][p]
    for p,v in fit['models'].items():
        if p.startswith('models/range_root/'):entries[str(B/p)]=dict(role='MODEL',sha256=v['sha256'])
    guard=SafeInputs(entries);raws={p:guard.read(p,v['role']) for p,v in entries.items()}
    arrays={r['id']+'/'+r['spot']:dict(np.load(io.BytesIO(raws[r['features_path']]),allow_pickle=False)) for r in selected}
    prepared={};featuretimes={}
    for pos,jid in chosen.items():
        rows=[r for r in selected if r['id']==jid];matrices={sp:arrays[jid+'/'+sp] for sp in SP};ranges={}
        for actor,p in config['ranges'][rows[0]['source_train_id']].items():
            t=raws[p].decode().strip();v=np.asarray(json.loads(t) if t.startswith('[') else list(map(float,t.split())),float);ci=matrices['F.cbet' if actor=='IP' else 'F.vs_b33']['combo_indices'];z=np.zeros(1326);z[ci]=v[ci];ranges[actor]=z
        result,times=sample(lambda:features(matrices,ranges),7)
        for sp in SP:np.testing.assert_array_equal(result[sp]['X'],matrices[sp]['S'])
        prepared[pos]=result;featuretimes[pos]=dict(times,rows=sum(len(result[sp]['X']) for sp in SP),byte_parity_with_sealed_public_features=True)
    models={};loads={};resultrows=[]
    for p,v in fit['models'].items():
        if not p.startswith('models/range_root/'):continue
        raw=raws[str(B/p)];start=time.perf_counter_ns();m=joblib.load(io.BytesIO(raw));load_ms=(time.perf_counter_ns()-start)/1e6
        assert m['feature_count']==136 and m['live_play'] is False and v['sha256']==digest(raw)
        pos,sp=v['position'],v['spot'];x=prepared[pos][sp]['X'];full=predict(m,x)
        np.testing.assert_allclose(full.sum(1),1,rtol=0,atol=1e-15);assert np.isfinite(full).all() and np.min(full)>=0
        indices=np.linspace(0,len(x)-1,min(16,len(x)),dtype=int);probe=x[indices];parts=[probe[i:i+1] for i in range(len(probe))]
        serial,serialtime=sample(lambda:[predict(m,a) for a in parts],3)
        batched,batchtime=sample(lambda:predict_batches(m,parts),7)
        for a,b in zip(serial,batched):np.testing.assert_array_equal(a,b)
        cuts=[x[:len(x)//2],x[len(x)//2:]];chunks=predict_batches(m,cuts);np.testing.assert_array_equal(np.concatenate(chunks),full)
        _,fulltime=sample(lambda:predict(m,x),7)
        resultrows.append(dict(model=p,sha256=v['sha256'],serialized_bytes=len(raw),load_from_verified_bytes_ms=load_ms,full_ROOT_rows=len(x),actions=v['actions'],single_requests_per_group=len(probe),serial_single_requests=serialtime,batched_single_requests=batchtime,full_ROOT_batch=fulltime,serial_to_batched_median_ratio=serialtime['median_ms']/batchtime['median_ms'],batch_single_and_full_partition_byte_parity=True))
        models[p]=m;loads[p]=load_ms
    assert len(resultrows)==8
    def sysctl(key):
        r=subprocess.run(['sysctl','-n',key],capture_output=True,text=True);return r.stdout.strip() if r.returncode==0 else None
    rss=subprocess.run(['ps','-p',str(os.getpid()),'-o','rss='],capture_output=True,text=True)
    peak=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss;peakbytes=int(peak if sys.platform=='darwin' else peak*1024)
    report=dict(at=datetime.datetime.now(datetime.UTC).isoformat(),verdict='PASS_SEALED_TRAIN_INFERENCE_PARITY',live_play=False,final_qualification=False,fit_sha256=FIT_SHA,model_recipe='range_root',models=8,total_serialized_bytes=sum(x['serialized_bytes'] for x in resultrows),max_loaded_model_ms=max(loads.values()),process_peak_rss_bytes=peakbytes,current_process_rss_bytes=int(rss.stdout.strip())*1024 if rss.returncode==0 else None,environment=dict(python=sys.version,numpy=np.__version__,sklearn=sklearn.__version__,joblib=joblib.__version__,system=platform.system(),machine=platform.machine(),processor=sysctl('machdep.cpu.brand_string'),physical_memory_bytes=sysctl('hw.memsize'),physical_cpu_count=sysctl('hw.physicalcpu'),OPENBLAS_NUM_THREADS=os.environ.get('OPENBLAS_NUM_THREADS'),OMP_NUM_THREADS=os.environ.get('OMP_NUM_THREADS')),method=dict(feature_samples=7,batch_samples=7,serial_samples=3,single_rows_per_model=16,warmup='one full ROOT prediction before timing',model_load='in-process deserialization from verified bytes, excludes disk reads',memory='whole-process RSS including numerical libraries, all8models and public features; not incremental model memory',scope='Mac CPU in-process numerical inference on2publicTRAINgames; no solver, labels, production serving or latency SLA',feature_preparation='four-node range features from cached246 public encoder output and authored ROOT ranges; full246 encoder cost excluded',batching='within one admitted model and context; applicability/support gate must run before caller inference; no retained cache'),input_pins={p:v['sha256'] for p,v in entries.items()},source_pins=sourcepins,public_feature_preparation=featuretimes,measurements=resultrows)
    with out.open('x') as f:json.dump(report,f,indent=2,sort_keys=True,allow_nan=False);f.write('\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ('input_pins','source_pins','measurements','environment','method','public_feature_preparation')}))

if __name__=='__main__':main()
