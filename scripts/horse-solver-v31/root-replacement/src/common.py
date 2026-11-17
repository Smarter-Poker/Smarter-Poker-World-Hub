import hashlib,io,json,sys
from pathlib import Path
import numpy as np
from data_access import SafeInputs
B=Path(__file__).resolve().parents[1];P=B.parent
SP=('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr')
def own(p):
 p=Path(p)
 if not p.is_absolute():p=B/p
 if not p.resolve().is_relative_to(B) or p.is_symlink():raise PermissionError('owned path required')
 return p
def read(p):return json.loads(own(p).read_bytes())
def write(p,x):
 p=own(p);p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('x') as f:json.dump(x,f,indent=2,sort_keys=True,allow_nan=False);f.write('\n')
def sha(p):return hashlib.sha256(own(p).read_bytes()).hexdigest()
def domain(s):return hashlib.sha256(json.dumps({k:v for k,v in s.items() if k not in ('scenario_id','flop_board','purpose')},sort_keys=True,separators=(',',':')).encode()).hexdigest()
def config():
 c=read('INPUTS.json');return c,SafeInputs(c['inputs'])
def frozen():
 f=read('FREEZE.json');c,g=config()
 assert sha('INPUTS.json')==f['inputs_sha256'],'input manifest drift'
 for p,h in f['source_files'].items():assert sha(p)==h,'source drift '+p
 for p,v in c['inputs'].items():g.read(p,v['role'])
 return f
def bytes_for(path,digest,role='TRAIN'):
 c,g=config();p=str(Path(path))
 if p in c['inputs']:raw=g.read(p,role)
 else:raw=own(p).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=digest:raise ValueError('artifact checksum changed')
 return raw
def array(path,digest):return np.load(io.BytesIO(bytes_for(path,digest)),allow_pickle=False)
def dataset():
 frozen();seal=read('DATASET-SEAL.json');assert sha('DATASET.json')==seal['dataset_sha256'];d=read('DATASET.json');c,_=config();assert len(d)==352
 for r in d:
  assert r['id'] in c['job_ids'] and r['fold']==c['folds'][c['jobs'][r['id']]['meta']['sig']]
 return d
