"""Hermetic nextcontext gates; no privateinputs/native/fits."""
import sys,unittest,copy,ast,datetime,json,tempfile,math
from types import SimpleNamespace
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
from context_scope import at_depth,require_bracket,stack_only_matrix,game_key
from models import conditional_targets,table
from runtime import predict_batches
from range_admission import range_status
from score import compare
from data_access import SafeInputs
from unittest.mock import patch
class Contracts(unittest.TestCase):
 def scenario(self):return dict(scenario_id='SYNTHETIC',purpose='TRAIN',effective_stack_chips=20000,chips_per_bb=100,flop_board='2c3d4h',pot_chips=600,rake=[.1,250],ip_range_checksum='a',oop_range_checksum='b',tree_lines=[[0,198,594,20000,20000]])
 def test_brackets_and_exact_exclusion(self):
  s=self.scenario();train=[at_depth(s,d) for d in [16000,18000,22000,24000]]
  for depth in [19000,21000]:self.assertFalse(require_bracket(at_depth(s,depth),train)['held_out_global_rank'])
  with self.assertRaises(ValueError):require_bracket(s,train+[s])
  with self.assertRaises(ValueError):require_bracket(at_depth(s,16000),train[1:])
 def test_unknown_geometry_fails(self):
  s=self.scenario();train=[at_depth(s,d) for d in [16000,24000]]
  for key,value in [('flop_board','2c3d5h'),('rake',[.05,125]),('pot_chips',575),('ip_range_checksum','foreign')]:
   t=copy.deepcopy(s);t[key]=value
   with self.assertRaises(ValueError):require_bracket(t,train)
 def test_stack_only_producer_contract(self):
  s=self.scenario();x=np.zeros((2,246));x[:,32]=150;x[:,98]=200
  for d in [16000,19000,21000,24000]:
   y=stack_only_matrix(x,s,at_depth(s,d));expected=x.copy();expected[:,98]=d/100;np.testing.assert_array_equal(y,expected)
  t=at_depth(s,19000);t['pot_chips']=575
  with self.assertRaises(ValueError):stack_only_matrix(x,s,t)
 def test_direct_conditional_zero_parent(self):
  y=np.array([[1.,0.],[0.,1.]]);np.testing.assert_array_equal(conditional_targets(y),y);self.assertEqual(table([[.01,.99]]),[[.01,.99]])
 def test_eval_absolute_and_twotone_gates(self):
  rows=[dict(family=f,baseline=4.,range_root=2.) for f in ['PAIR','MONO','UNP2T','UNPR'] for _ in range(8)];self.assertTrue(compare(rows)['eligible']);rows[-1]['range_root']=3.00001;self.assertFalse(compare(rows)['eligible'])
  for r in rows:
   if r['family']=='UNP2T':r.update(baseline=.1,range_root=.2)
  self.assertFalse(compare(rows)['relative_pass'])
 def test_new_budget_prefix_and_legacy_charged(self):
  p=Path(__file__).resolve().parent/'src/ops.py';tree=ast.parse(p.read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='budget');ns={'datetime':datetime};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(p),'exec'),ns);events=[]
  for prefix in ['F5D3-','F5CTX-','F5REPAIR-','F5TAIL-','F5ROOT-','F5RCTX-','F5NQ-','F5FB-']:events.extend([dict(event='launch',out=prefix+'X',solver_runs_max=1,at='2026-11-17T00:00:00Z'),dict(event='exit',out=prefix+'X',rc=0,at='2026-11-17T01:00:00Z')])
  b=ns['budget'](events);self.assertEqual((b['runs'],b['combined_hours'],b['phase_runs']),(8,8,1));self.assertTrue(ns['budget'](events[:-1])['open_operations'])
 def test_once_only_claim_and_opposite_seat_units(self):
  source=Path(__file__).resolve().parent/'src/score.py';tree=ast.parse(source.read_text());functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('compare','main')]
  for fn in functions:fn.body=[n for n in fn.body if not (isinstance(n,ast.ImportFrom) and n.module=='ops')]
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);(root/'evidence').mkdir();cohorts={};index=0
   for tag,n in [('E-N00',6),('E-N01',6),('E-R00',1),('E-R01',3)]:
    cohorts[tag]={'stage':'EVALUATION'};jobs=[]
    for _ in range(n):jobs.append(dict(id='SYNTHETIC%d'%index,meta=dict(source_train_id='TRAIN%d'%index,family=['PAIR','MONO','UNP2T','UNPR'][index%4],position='HJ'),phases=[dict(scenario=dict(pot_chips=600))]));index+=1
    (root/('jobs-'+tag+'.json')).write_text(json.dumps(jobs));(root/'evidence'/('technical-'+tag+'.json')).write_text(json.dumps(dict(verdict='PASS_NATIVE_COPY_A2_TECHNICAL')))
   (root/'RANGE-STATUS.json').write_text(json.dumps(dict(realistic_preflop_qualification=False)))
   (root/'FIT.json').write_text(json.dumps(dict(models={})))
   class Results:
    def delta_vs_eq(self,jid,arm,key):
     self_key='oop_mes_chips' if arm.startswith('ip_') else 'ip_mes_chips'
     if key!=self_key:raise AssertionError('wrong opposite-seat MES')
     return SimpleNamespace(value=30. if arm.endswith('|baseline') else 6.,bound_pct=0.)
   calls=[]
   def technical(*args):
    self.assertTrue((root/'EVALUATION-CLAIM.json').exists());calls.append(1);return Results(),{'sessions':16}
   def write(name,value):
    with (root/name).open('x') as f:json.dump(value,f)
   ns=dict(B=root,np=np,json=json,datetime=datetime,math=math,config=lambda:({'cohorts':cohorts,'cohort_order':list(cohorts)},None),release=lambda tag:None,read=lambda p:json.loads((root/p).read_bytes()),write=write,sha=lambda p:'SYNTHETIC',technical=technical)
   exec(compile(ast.Module(body=functions,type_ignores=[]),str(source),'exec'),ns);ns['main']('EVALUATION');out=json.loads((root/'EVALUATION-RESULT.json').read_bytes());self.assertEqual(out['verdict'],'CONTEXT_QUALIFICATION_PASS');self.assertEqual(out['stats']['max'],1.);self.assertFalse(out['legacy_global_final_qualification']);self.assertTrue((root/'CONTEXT-CERTIFICATE.json').exists())
   with self.assertRaises(AssertionError):ns['main']('EVALUATION')
   self.assertEqual(len(calls),1)
 def test_remaining_jd_reservation(self):
  p=Path(__file__).resolve().parent/'src/ops.py';tree=ast.parse(p.read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='reserved_runs');ns={};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(p),'exec'),ns);f=ns['reserved_runs']
  self.assertEqual(f('EVALUATION',[]),16);self.assertEqual(f('HARVEST',[]),32)
  ev=[dict(event='launch',out='F5NQ-J-N00',solver_runs_max=6),dict(event='launch',out='F5NQ-E-N00',solver_runs_max=6)]
  self.assertEqual(f('EVALUATION',ev),10);self.assertEqual(f('JD',ev),0);self.assertEqual(f('HARVEST',ev),20)
  ev.append(dict(event='launch',out='F5NQ-J-N01',solver_runs_max=10));self.assertEqual(f('EVALUATION',ev),0)
  ev.append(dict(event='launch',out='F5NQ-J-BAD',solver_runs_max=1))
  with self.assertRaises(ValueError):f('EVALUATION',ev)
 def test_jd_builder_without_fit_candidate_or_evaluation(self):
  p=Path(__file__).resolve().parent/'src/build_jd.py';tree=ast.parse(p.read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main');jobs={};refs={};base={};ids=[]
  for i in range(16):
   source='TRAIN%d'%i;jid='JD%d'%i;ids.append(jid);base[source]=dict(phases=[dict(scenario=dict(pot_chips=600))]);refs[source]=dict(phases=[dict(scenario=dict(pot_chips=600),arms=[dict(name=seat+'_all|range_root',writes=[dict(node=seat+'1'),dict(node=seat+'2')]) for seat in ('ip','oop')])]);jobs[jid]=dict(id=jid,meta=dict(source_train_id=source,drop_chips=25 if i%2 else 60),phases=[dict(scenario=dict(pot_chips=575 if i%2 else 540))])
  c=dict(inputs={'ref':dict(sha256='SYNTHETIC')},jd_reference_result='ref',jd_jobs=jobs,base_jobs=base,jd_reference_jobs=refs,cohorts={'J':dict(stage='JD',ids=ids)});written={}
  def read(name):
   self.assertEqual(name,'POLICY-IMPORT.json');return dict(fit_games=104)
  ns=dict(config=lambda:(c,None),frozen=lambda:None,read=read,write=lambda p,v:written.update({str(p):v}),sha=lambda p:'SYNTHETIC',B=Path('/synthetic'),copy=copy,json=json)
  exec(compile(ast.Module(body=[fn],type_ignores=[]),str(p),'exec'),ns);ns['main']()
  self.assertEqual(written['JD-JOBS-SEAL.json']['arms'],32);self.assertFalse(written['JD-JOBS-SEAL.json']['qualification_use'])
  self.assertEqual(written['/synthetic/jobs-J.json'][0]['phases'][0]['arms'],refs['TRAIN0']['phases'][0]['arms'])
 def test_either_stage_namespace_and_foreign_refusal(self):
  from stage_namespace import ensure_namespace
  remote=r'C:\sp-v31\hv31-nextq-synthetic';digest='a'*64;calls=[]
  def create(script):calls.append(script);return dict(created=True,freeze=digest)
  self.assertTrue(ensure_namespace(create,remote,digest));self.assertIn('foreign or unsealed namespace',calls[0]);self.assertNotIn('EVALUATION',calls[0])
  self.assertFalse(ensure_namespace(lambda s:dict(created=False,freeze=digest),remote,digest))
  with self.assertRaises(ValueError):ensure_namespace(lambda s:dict(created=False,freeze='b'*64),remote,digest)
  with self.assertRaises(ValueError):ensure_namespace(lambda s:dict(created=1,freeze=digest),remote,digest)
  with self.assertRaises(ValueError):ensure_namespace(lambda s:self.fail('must refuse before remote'),r'C:\foreign',digest)
 def test_proxy_range_status_stays_blocked(self):
  result=range_status();self.assertEqual(result['state'],'BLOCKED_NO_QUALIFIED_DEPTH_RAKED_PROFILE');self.assertFalse(result['realistic_preflop_qualification']);self.assertFalse(result['live_play'])
 def test_protected_or_unknown_roles_refuse_before_open(self):
  with self.assertRaises(ValueError):SafeInputs({'/synthetic/HOLDOUT/a':dict(role='SOURCE',sha256='0'*64)})
  with patch('os.open',side_effect=AssertionError('must not open')):
   with self.assertRaises(PermissionError):SafeInputs({}).read('/synthetic/unknown','TRAIN')
if __name__=='__main__':unittest.main()
