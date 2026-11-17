import json,hashlib,io,sys
from pathlib import Path
import numpy as np
from data_access import SafeInputs
B=Path(__file__).resolve().parents[1];P=B.parent
SP=('F.cbet','F.vs_b33','F.vs_b75','F.vs_xr');RECIPES=('context_root','range_root')
def own(p):
 p=Path(p);p=p if p.is_absolute() else B/p
 if p.is_symlink() or not p.resolve().is_relative_to(B):raise PermissionError('owned artifact required')
 return p
def read(p):return json.loads(own(p).read_bytes())
def write(p,v):
 p=own(p);p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('x') as f:json.dump(v,f,sort_keys=True,indent=2,allow_nan=False);f.write('\n')
def sha(p):return hashlib.sha256(own(p).read_bytes()).hexdigest()
def config():
 c=read('INPUTS.json');return c,SafeInputs(c['inputs'])
def frozen():
 f=read('FREEZE.json');c,g=config();assert sha('INPUTS.json')==f['inputs_sha256']
 for p,h in f['source_files'].items():assert sha(p)==h,'frozen source drift '+p
 for p,v in c['inputs'].items():g.read(p,v['role'])
 return f
def data_bytes(p,h,role='TRAIN'):
 c,g=config();p=str(Path(p));raw=g.read(p,role) if p in c['inputs'] else own(p).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=h:raise ValueError('artifact drift')
 return raw
def array(p,h):return np.load(io.BytesIO(data_bytes(p,h)),allow_pickle=False)
def probability(x):
 x=np.asarray(x,float)
 if x.ndim!=2 or not np.isfinite(x).all() or np.min(x)<0 or not np.allclose(x.sum(1),1,atol=1e-7,rtol=0):raise ValueError('invalid frequencies')
 return x
def domain(s):return hashlib.sha256(json.dumps({k:v for k,v in s.items() if k not in ('scenario_id','purpose','flop_board')},sort_keys=True,separators=(',',':')).encode()).hexdigest()
