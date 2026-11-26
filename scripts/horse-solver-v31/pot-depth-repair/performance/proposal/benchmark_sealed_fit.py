"""Explicitly admitted new-fit benchmark. Never starts without exact root pins.

No fitting, label/native/evaluation reads, directory discovery, physics rebuild,
retained context cache, registration or live activation.
"""
import argparse, datetime, hashlib, io, json, os
import platform, re, resource, stat, statistics, sys, time
from pathlib import Path
import joblib, numpy as np

PERFORMANCE=Path(__file__).resolve().parents[1]
CAMPAIGN=PERFORMANCE.parent
PUBLIC_INPUTS_SHA='eb2c37d173f901e8f38fb874e156f08dc1ff18113b490dca1bb991296473a9a4'
SPOTS=('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr')
EXPECTED_KEYS={pos+'/'+sp for pos in ('HJ','UTG') for sp in SPOTS}
HEX=re.compile('[0-9a-f]{64}')
EXCLUDED=('DO-NOT-RUN','HOLDOUT','/EXAM','-EXAM','/FINAL','-FINAL','/EVAL','-EVAL','/DEV/','-DEV-')

def sha(raw):return hashlib.sha256(raw).hexdigest()
def validate_path(path,root=None):
    p=Path(path)
    if not p.is_absolute() or '..' in p.parts:raise ValueError('absolute explicit input path required')
    if root is not None and not p.is_relative_to(root):raise PermissionError('input is outside owned campaign')
    tokens=str(p).upper().replace('_','-').replace('.','-')
    if any(x in tokens for x in EXCLUDED):raise PermissionError('excluded payload path refused before open')
    return p
def read_pinned(path,digest,root=None):
    p=validate_path(path,root)
    if not isinstance(digest,str) or not HEX.fullmatch(digest):raise ValueError('explicit SHA256 required')
    directory=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for part in p.parts[1:-1]:
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory);os.close(directory);directory=child
        fd=os.open(p.name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory)
    finally:os.close(directory)
    with os.fdopen(fd,'rb') as f:
        before=os.fstat(f.fileno())
        if not stat.S_ISREG(before.st_mode):raise PermissionError('regular pinned input required')
        raw=f.read();after=os.fstat(f.fileno())
    fields=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns)
    if fields(before)!=fields(after) or sha(raw)!=digest:raise ValueError('pinned input drift')
    return raw
def validate_admission(doc):
    if doc.get('format')!='HV31_SEALED_FIT_RUNTIME_BENCHMARK_V1' or doc.get('live_play') is not False:raise ValueError('dormant runtime admission required')
    if doc.get('public_inputs_sha256')!=PUBLIC_INPUTS_SHA:raise ValueError('only original two public TRAIN cases admitted')
    if doc.get('expected_fit_games')!=168:raise ValueError('exact new168 fit required')
    for field in ('fit','freeze'):
        value=doc[field];validate_path(value['path'],CAMPAIGN)
        if not HEX.fullmatch(value.get('sha256','')):raise ValueError('fit/freeze checksum required')
    if set(doc.get('sources',{}))!={'models','range_features'}:raise ValueError('two numerical source identities required')
    for entry in doc['sources'].values():
        validate_path(entry['path'],CAMPAIGN)
        if not HEX.fullmatch(entry.get('sha256','')):raise ValueError('source checksum required')
    if not isinstance(doc.get('models'),list) or len(doc['models'])!=8:raise ValueError('exactly eight model pins required')
    keys=set()
    for entry in doc['models']:
        key=entry['position']+'/'+entry['spot']
        if key in keys or key not in EXPECTED_KEYS:raise ValueError('duplicate/foreign model head')
        keys.add(key);validate_path(entry['path'],CAMPAIGN)
        if not HEX.fullmatch(entry.get('sha256','')):raise ValueError('model checksum required')
        if not isinstance(entry.get('actions'),list) or not entry['actions'] or len(set(entry['actions']))!=len(entry['actions']):raise ValueError('exact action list required')
    if keys!=EXPECTED_KEYS:raise ValueError('incomplete model heads')
    return doc
def loaded_source(name,entry):
    raw=read_pinned(entry['path'],entry['sha256'],CAMPAIGN)
    # Execute verified bytes, never a second unverified path read.
    module=type(sys)(name);module.__file__=entry['path'];exec(compile(raw,entry['path'],'exec'),module.__dict__);return module
def stats(fn,repetitions):
    values=[];result=None
    for _ in range(repetitions):
        start=time.perf_counter_ns();result=fn();values.append((time.perf_counter_ns()-start)/1e6)
    return result,dict(samples_ms=values,median_ms=statistics.median(values),min_ms=min(values),max_ms=max(values))
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--admission',type=Path,required=True);parser.add_argument('--admission-sha256',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    if os.environ.get('OMP_NUM_THREADS')!='1' or os.environ.get('OPENBLAS_NUM_THREADS')!='1':raise ValueError('OMP1 and BLAS1 required before process startup')
    output=validate_path(args.output,PERFORMANCE)
    if output.exists() or not output.parent.is_dir():raise PermissionError('new existing-parent owned output required')
    doc=validate_admission(json.loads(read_pinned(args.admission,args.admission_sha256,PERFORMANCE)))
    public_path=PERFORMANCE/'evidence/public-runtime-inputs.json';public=json.loads(read_pinned(public_path,PUBLIC_INPUTS_SHA,PERFORMANCE))
    if public['format']!='HV31_PUBLIC_TRAIN_RUNTIME_INPUTS_V1' or public['live_play'] is not False:raise ValueError('public input manifest')
    fitraw=read_pinned(doc['fit']['path'],doc['fit']['sha256'],CAMPAIGN);fit=json.loads(fitraw)
    freeze=json.loads(read_pinned(doc['freeze']['path'],doc['freeze']['sha256'],CAMPAIGN))
    if fit['freeze_sha256']!=doc['freeze']['sha256'] or fit['fit_games']!=168 or len(fit['models'])!=8:raise ValueError('actual new168 fit/freeze binding')
    for name,old_pin in [('models','prediction_source_sha256'),('range_features','public_feature_source_sha256')]:
        entry=doc['sources'][name]
        if entry['sha256']!=public[old_pin] or freeze['source_files'].get('src/'+Path(entry['path']).name)!=entry['sha256']:raise ValueError('frozen numerical source differs from original public feature proof')
    predictor=loaded_source('_sealed_predict',doc['sources']['models']);feature_module=loaded_source('_sealed_features',doc['sources']['range_features'])
    # Decode only the same explicit public feature/range closure used before.
    prepared={};feature_times=[];input_pins={str(public_path):PUBLIC_INPUTS_SHA}
    for case in public['cases']:
        if case['position'] in prepared or set(case['features'])!=set(SPOTS) or set(case['ranges'])!={'IP','OOP'}:raise ValueError('explicit two-case public closure')
        matrices={}
        for spot,pin in case['features'].items():
            raw=read_pinned(pin['path'],pin['sha256']);input_pins[pin['path']]=pin['sha256'];matrices[spot]=dict(np.load(io.BytesIO(raw),allow_pickle=False))
        ranges={}
        for actor,pin in case['ranges'].items():
            text=read_pinned(pin['path'],pin['sha256']).decode().strip();input_pins[pin['path']]=pin['sha256'];v=np.asarray(json.loads(text) if text.startswith('[') else list(map(float,text.split())),float)
            if v.shape!=(1326,) or not np.isfinite(v).all() or np.min(v)<0:raise ValueError('authored ROOT vector contract')
            ci=matrices['F.cbet' if actor=='IP' else 'F.vs_b33']['combo_indices'];z=np.zeros(1326);z[ci]=v[ci];ranges[actor]=z
        result,timing=stats(lambda:feature_module.features(matrices,ranges),7)
        for spot in SPOTS:np.testing.assert_array_equal(result[spot]['X'],matrices[spot]['S'])
        prepared[case['position']]=result;feature_times.append(dict(source_id=case['source_id'],position=case['position'],exact_public_feature_parity=True,**timing))
    if set(prepared)!={'HJ','UTG'}:raise ValueError('both original positions required')
    raw_models={};fitroot=Path(doc['fit']['path']).parent
    for pin in doc['models']:
        relative=str(Path(pin['path']).relative_to(fitroot));meta=fit['models'].get(relative)
        if meta is None or any(meta[k]!=pin[k] for k in ('sha256','position','spot','actions')):raise ValueError('model pin is not the actual FIT artifact')
        raw_models[relative]=read_pinned(pin['path'],pin['sha256'],CAMPAIGN)
    # Load once. First load includes first-use sklearn imports; record separately.
    loaded={};loads=[]
    for pin in doc['models']:
        key=pin['position']+'/'+pin['spot'];relative=str(Path(pin['path']).relative_to(fitroot));raw=raw_models[relative];start=time.perf_counter_ns();model=joblib.load(io.BytesIO(raw));elapsed=(time.perf_counter_ns()-start)/1e6
        if model['feature_count']!=136 or model.get('live_play') is not False or model['position']!=pin['position'] or model['spot']!=pin['spot'] or model['actions']!=pin['actions'] or len(model['heads'])!=len(pin['actions']):raise ValueError('actual model contract')
        loaded[key]=model;loads.append(dict(key=key,path=pin['path'],sha256=pin['sha256'],serialized_bytes=len(raw),verified_byte_deserialization_ms=elapsed))
    inference=[]
    for pin in doc['models']:
        key=pin['position']+'/'+pin['spot'];model=loaded[key];x=prepared[pin['position']][pin['spot']]['X'];expected=predictor.predict(model,x)
        if not np.isfinite(expected).all() or np.min(expected)<0 or not np.allclose(expected.sum(1),1,atol=1e-15,rtol=0):raise ValueError('nonfinite/unnormalized real model output')
        probe=x[np.linspace(0,len(x)-1,min(16,len(x)),dtype=int)];serial,serial_time=stats(lambda:[predictor.predict(model,row[None,:]) for row in probe],3);batch,batch_time=stats(lambda:predictor.predict(model,probe),7)
        np.testing.assert_array_equal(np.concatenate(serial),batch);parts=np.concatenate([predictor.predict(model,v) for v in np.array_split(x,2)]);np.testing.assert_array_equal(parts,expected)
        _,full_time=stats(lambda:predictor.predict(model,x),7)
        inference.append(dict(key=key,ROOT_rows=len(x),serial_requests=len(probe),serial_single_requests=serial_time,batched_requests=batch_time,full_ROOT=full_time,serial_batch_and_partition_byte_parity=True))
    prior=public['full246_profile'];prior_raw=read_pinned(prior['path'],prior['sha256'],PERFORMANCE);prior_result=json.loads(prior_raw)
    if prior_result['verdict']!='PASS_PUBLIC246_PROFILE_PARITY_AFTER_LAUNCH_FIX':raise ValueError('unchanged full246 profile reuse proof')
    from importlib.metadata import version
    rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss;peak_bytes=int(rss if sys.platform=='darwin' else rss*1024)
    report=dict(at=datetime.datetime.now(datetime.UTC).isoformat(),verdict='PASS_NEW168_SEALED_RUNTIME_BENCHMARK',admission_sha256=args.admission_sha256,fit_sha256=doc['fit']['sha256'],fit_games=168,loads=loads,inference=inference,public136_preparation=feature_times,input_pins=input_pins,full246_profile_reused=dict(path=prior['path'],sha256=prior['sha256'],not_repeated=True),peak_whole_process_rss_bytes=peak_bytes,serialized_model_bytes=sum(x['serialized_bytes'] for x in loads),environment=dict(python=platform.python_version(),numpy=np.__version__,sklearn=version('scikit-learn'),joblib=joblib.__version__,system=platform.system(),machine=platform.machine(),OMP_NUM_THREADS=os.environ['OMP_NUM_THREADS'],OPENBLAS_NUM_THREADS=os.environ['OPENBLAS_NUM_THREADS']),limits=['Mac local in-process measurement, not serving or network latency.','Cold first deserialization includes first-use sklearn imports; disk read/hash time excluded.','136 feature prep uses cached246 public inputs; unchanged full246 profile reused.','RSS includes libraries, feature matrices, loaded model bytes and all eight objects; not incremental model memory.','Sixteen ready requests per head; no live batching/wait queue or retained context cache.'],labels_read=False,native_outputs_read=False,evaluations_read=False,model_training=False,model_qualification=False,live_play=False)
    with output.open('x') as f:json.dump(report,f,indent=2,sort_keys=True,allow_nan=False);f.write('\n')
    print(json.dumps({k:report[k] for k in ('verdict','at','fit_sha256','fit_games','peak_whole_process_rss_bytes','serialized_model_bytes','live_play')}))

if __name__=='__main__':main()
