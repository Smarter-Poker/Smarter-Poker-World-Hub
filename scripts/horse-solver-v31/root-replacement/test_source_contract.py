import io,sys,unittest,json,hashlib,ast
from pathlib import Path
from unittest.mock import patch
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
from models import joint_targets,decode_joint,probability,raw,to_table
from data_access import SafeInputs

class RootContracts(unittest.TestCase):
 def test_joint_realization_roundtrip(self):
  f=np.array([[.2,.3,.5],[0,.7,.3],[1e-14,0,1-1e-14]]);xr=np.array([[.75,.25],[1,0],[0,1]])
  target=joint_targets(f,xr,['b198','b450','c'],['c','f']);c,x=decode_joint(target)
  np.testing.assert_allclose(c,f,rtol=0,atol=1e-15);np.testing.assert_allclose(x[[0,2]],xr[[0,2]],rtol=0,atol=1e-15);np.testing.assert_allclose(x[1],[.5,.5])
 def test_joint_reordered_actions_and_invalid_inputs(self):
  t=joint_targets([[.5,.3,.2]],[[.25,.75]],['c','b450','b198'],['f','c']);np.testing.assert_allclose(t,[[.5,.3,.15,.05]])
  with self.assertRaises(ValueError):joint_targets([[1,0]],[[.5,.5]],['x','c'],['c','f'])
  with self.assertRaises(ValueError):decode_joint([[float('nan'),0,0,1]])
 def test_raw_no_five_percent_clip(self):
  class Head:
   def __init__(self,v):self.v=v
   def predict(self,x):return np.full(len(x),self.v)
  m={'heads':[Head(.01),Head(.99)]};f=raw(m,np.zeros((2,246)));np.testing.assert_allclose(f,[[.01,.99],[.01,.99]])
  self.assertEqual(to_table([[1/3]*3]),[[.333333334,.333333333,.333333333]])
 def test_protected_and_unknown_before_any_content(self):
  with self.assertRaises(ValueError):SafeInputs({'/synthetic/FINAL-DO-NOT-RUN/a.json':{'role':'SOURCE','sha256':'0'*64}})
  with self.assertRaises(ValueError):SafeInputs({'/synthetic/final_public215_training.py':{'role':'TRAIN','sha256':'2740d2efc8888d2e22e1088ac21ac0e102d22619cc7b4dde5791c482bccf3a3d'}})
  g=SafeInputs({'/synthetic/final_public215_training.py':{'role':'SOURCE','sha256':'2740d2efc8888d2e22e1088ac21ac0e102d22619cc7b4dde5791c482bccf3a3d'}})
  with patch('os.open',side_effect=AssertionError('no open')),patch('hashlib.sha256',side_effect=AssertionError('no hash')):
   with self.assertRaises(PermissionError):g.read('/synthetic/unknown','TRAIN')
 def test_global_budget_and_root_charge(self):
  # Pure actual-source budget function, avoiding importing native/data modules.
  import datetime
  p=Path(__file__).resolve().parent/'src/ops.py';t=ast.parse(p.read_text());fn=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='budget');ns={'datetime':datetime};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(p),'exec'),ns)
  e=[]
  for prefix in ('F5D3-','F5CTX-','F5REPAIR-','F5TAIL-','F5ROOT-'):
   e.extend([dict(event='launch',out=prefix+'X',at='2026-11-17T00:00:00Z',solver_runs_max=2),dict(event='exit',out=prefix+'X',at='2026-11-17T01:00:00Z',rc=0)])
  b=ns['budget'](e);self.assertEqual((b['runs'],b['combined_hours'],b['phase_runs'],b['phase_hours']),(10,5,2,1));self.assertTrue(ns['budget'](e[:-1])['open_operations'])
 def test_train_screen_absolute_and_family_gates(self):
  p=Path(__file__).resolve().parent/'src/score_train.py';t=ast.parse(p.read_text());fn=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='compare');ns={'np':np};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(p),'exec'),ns)
  rows=[dict(family=f,baseline=3.,candidate=2.) for f in ('PAIR','MONO','UNP2T','UNPR') for _ in range(8)]
  self.assertTrue(ns['compare'](rows,'candidate')['eligible']);rows[-1]['candidate']=3.0000001;self.assertFalse(ns['compare'](rows,'candidate')['eligible'])
  rows=[dict(family=f,baseline=4.,candidate=1.) for f in ('PAIR','MONO','UNP2T','UNPR') for _ in range(8)]
  for r in rows:
   if r['family']=='UNP2T':r.update(baseline=.1,candidate=.2)
  self.assertFalse(ns['compare'](rows,'candidate')['relative_pass'])
 def test_actual_screen_opposite_seat_units_and_claim_before_metrics(self):
  import tempfile,datetime
  from types import SimpleNamespace
  with tempfile.TemporaryDirectory() as td:
   root=Path(td).resolve();root.mkdir(exist_ok=True);families=('PAIR','MONO','UNP2T','UNPR');number=0
   for suffix,count in (('N00',6),('N01',6),('R00',1),('R01',3)):
    jobs=[]
    for _ in range(count):
     jobs.append(dict(id='SYNTHETIC%d'%number,meta=dict(source_train_id='TRAIN%d'%number,family=families[number%4],position='HJ',held_out_fold=0),phases=[dict(scenario=dict(pot_chips=600))]));number+=1
    (root/('jobs-TRAIN-'+suffix+'.json')).write_text(json.dumps(jobs))
   class Results:
    def delta_vs_eq(self,jid,arm,key):
     self_key='oop_mes_chips' if arm.startswith('ip_') else 'ip_mes_chips';assert key==self_key
     return SimpleNamespace(value=30. if arm.endswith('|baseline') else 24.,bound_pct=0.)
   def write(p,v):
    with (root/p).open('x') as f:json.dump(v,f)
   def technical(*args):
    self.assertTrue((root/'TRAIN-SCREEN-CLAIM.json').exists());return Results(),{'sessions':16}
   source=Path(__file__).resolve().parent/'src/score_train.py';tree=ast.parse(source.read_text());nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('main','compare')]
   ns=dict(B=root,np=np,math=__import__('math'),datetime=datetime,json=json,RECIPES=('independent_root','coupled_ip'),release=lambda:None,write=write,sha=lambda p:'synthetic',technical=technical)
   exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source),'exec'),ns);ns['main']();result=json.loads((root/'TRAIN-SCREEN.json').read_text());self.assertEqual(result['verdict'],'TRAIN_SCREEN_FAIL');self.assertEqual(len(result['rows']),32)
   self.assertEqual(result['stats']['independent_root']['mean'],4.);self.assertEqual(result['stats']['independent_root']['breaches'],32)
 def test_public_source_manifest_excludes_private_payloads(self):
  root=Path(__file__).resolve().parent;m=json.loads((root/'source-manifest.json').read_text());self.assertFalse(m['live_play']);self.assertEqual(len(m['source_files']),17)
  for name,h in m['source_files'].items():self.assertEqual(hashlib.sha256((root/name).read_bytes()).hexdigest(),h)
  for pattern in ('*.joblib','*.npz','*.npy','INPUTS.json','FREEZE.json','DATASET.json','jobs-*.json'):self.assertFalse(list(root.rglob(pattern)))
if __name__=='__main__':unittest.main()
