"""Finalize original104policy provenance after full label-free public preparation."""
import sys,json,hashlib,os,stat
from pathlib import Path
D=Path(__file__).resolve().parents[1];sys.path.insert(0,str(D/'src'))
from common import read,sha
from data_access import SafeInputs
def public_row_bytes(source,expected,public_root):
 source=Path(source);public_root=Path(public_root)
 if not source.is_absolute() or '..' in source.parts or not source.is_relative_to(public_root) or source.suffix!='.npz':raise PermissionError('generated public row lineage required')
 directory=os.open(public_root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  for part in source.relative_to(public_root).parts[:-1]:
   child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory);os.close(directory);directory=child
  fd=os.open(source.name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory)
 finally:os.close(directory)
 with os.fdopen(fd,'rb') as stream:
  before=os.fstat(stream.fileno())
  if not stat.S_ISREG(before.st_mode):raise PermissionError('regular public row required')
  raw=stream.read();after=os.fstat(stream.fileno())
 fields=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns)
 if fields(before)!=fields(after) or hashlib.sha256(raw).hexdigest()!=expected:raise ValueError('generated public row drift')
 return raw
assert not (D/'FREEZE.json').exists();c=read('INPUTS.json');assert c['public_proof']['nodes']==128 and 'baseline_import' not in c
# Existing public-only producer rows are copied once to neutral hash names; never relax excluded-payload guards.
neutral=D/'src/public-features';neutral.mkdir(exist_ok=False)
for key,records in c['context_public_records'].items():
 for record in records:
  source=Path(record['x_path']);raw=public_row_bytes(source,record['x_sha256'],D/'src/public-inputs-v2');target=neutral/(key+'.'+record['spot']+'.npz');target.write_bytes(raw);assert hashlib.sha256(target.read_bytes()).hexdigest()==record['x_sha256'];c['inputs'].pop(str(source));c['inputs'][str(target)]=dict(role='SOURCE',sha256=record['x_sha256']);record['x_path']=str(target)
R=D.parent/'hv31-root-diagnosis-01a1e479'
def pinned(p,h,role):
 raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==h;c['inputs'][str(p)]=dict(role=role,sha256=h);return json.loads(raw)
fit=pinned(R/'FIT.json','0ccadcea5d4f8b67a9fc6ffbb72d5d2661cde3a0059a70e8f6bbb40d9a61df9c','SOURCE');release=pinned(R/'SCREEN-RELEASE.json','930e3ddaadc54c6d83373a180524425a4a2a3fed04968bfc5359ad814fcfc271','SOURCE')
models={}
for p,m in fit['models'].items():
 if p.startswith('models/range_root/'):
  path=R/p;assert hashlib.sha256(path.read_bytes()).hexdigest()==m['sha256'];c['inputs'][str(path)]=dict(role='MODEL',sha256=m['sha256']);models[str(path)]=m['sha256']
assert len(models)==8
for tag in ('V-N00','V-N01','V-R00','V-R01'):
 path=R/('jobs-TRAIN-'+tag+'.json');assert hashlib.sha256(path.read_bytes()).hexdigest()==release['files'][str(path.relative_to(R))]
c['baseline_import']=dict(fit_sha256='0ccadcea5d4f8b67a9fc6ffbb72d5d2661cde3a0059a70e8f6bbb40d9a61df9c',models=models,screen_release_sha256='930e3ddaadc54c6d83373a180524425a4a2a3fed04968bfc5359ad814fcfc271',inference_at_unsupported_pots=False,tables_source='exact R TRAIN-reference jobs; unchanged prior104fitselectedrange_root')
guard=SafeInputs(c['inputs'])
for path,meta in c['inputs'].items():guard.read(path,meta['role'])
tmp=D/'INPUTS.finalized.json';tmp.write_text(json.dumps(c,sort_keys=True,indent=2,allow_nan=False)+'\n');assert not (D/'FREEZE.json').exists();tmp.replace(D/'INPUTS.json');print('baseline original104weights/tableprovenance pinned; INPUTS '+sha('INPUTS.json'))
