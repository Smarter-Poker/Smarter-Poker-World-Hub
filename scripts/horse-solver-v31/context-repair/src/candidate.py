"""Exact-domain dispatcher; no implicit cross-context fallback."""
import hashlib, json
from pathlib import Path
import joblib
from prepare import B
def domain(s):return hashlib.sha256(json.dumps({k:v for k,v in s.items() if k not in ('scenario_id','flop_board','purpose')},sort_keys=True,separators=(',',':')).encode()).hexdigest()
def load(s,spot,root=None):
    root=Path(root or B/'models');report=json.loads((root/'fit.json').read_bytes())
    key=domain(s)
    if key not in report['domains']:raise ValueError('unsupported exact game domain')
    p=root/report['domains'][key]['position']/(spot+'.joblib')
    if hashlib.sha256(p.read_bytes()).hexdigest()!=report['model_sha256'][str(p.relative_to(root))]:raise ValueError('model bytes changed')
    model=joblib.load(p)
    if model['domain_sha256']!=key:raise ValueError('model domain mismatch')
    return model
