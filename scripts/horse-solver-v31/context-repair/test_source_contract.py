"""Hermetic actual-source regressions. No private inputs, fits, solver or live calls."""
import ast,copy,datetime,hashlib,itertools,json,math,re,sys,tempfile,unittest,contextlib,io
from pathlib import Path
from types import SimpleNamespace
import joblib
import numpy as np
ROOT=Path(__file__).resolve().parent

def functions(name,wanted,**dependencies):
 tree=ast.parse((ROOT/'src'/name).read_text());nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in wanted];assert {n.name for n in nodes}==set(wanted)
 ns=dict(Path=Path,json=json,hashlib=hashlib,datetime=datetime,math=math,np=np,joblib=joblib,itertools=itertools,re=re,**dependencies)
 exec(compile(ast.Module(body=nodes,type_ignores=[]),str(ROOT/'src'/name),'exec'),ns);return ns

class SourceContracts(unittest.TestCase):
 def test_frozen_source_manifest_and_no_private_payloads(self):
  manifest=json.loads((ROOT/'source-manifest.json').read_text());self.assertFalse(manifest['live_play']);self.assertFalse(manifest['training_and_evaluation_authorized']);self.assertEqual(len(manifest['source_files']),29)
  for name,h in manifest['source_files'].items():
   p=ROOT/name;self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),h,name)
   if p.suffix=='.py':ast.parse(p.read_text(),filename=name)
  self.assertFalse((ROOT/'src/test_tail.py').exists())
  for pattern in ('*.joblib','*.npy','*.npz','jobs-*.json','spec.json','CANDIDATE.json','FREEZE.json'):self.assertFalse(list(ROOT.rglob(pattern)),pattern)
 def test_exact_domain_changes_are_not_accepted(self):
  domain=functions('candidate.py',{'domain'})['domain'];s=dict(ip_position='HJ',oop_position='BB',pot_chips=600,effective_stack_chips=20000,rake=[.1,250],ip_range_checksum='synthetic-root',tree_lines=[[0,600]],flop_board='2c3d4h',scenario_id='TEST');key=domain(s)
  self.assertEqual(key,domain(dict(s,flop_board='5c6d7h',scenario_id='OTHER')))
  for field,value in [('ip_position','BTN'),('pot_chips',601),('effective_stack_chips',8000),('rake',[0,0]),('ip_range_checksum','changed'),('tree_lines',[]),('unknown_contract',True)]:self.assertNotEqual(key,domain(dict(s,**{field:value})),field)
 def test_actual_serialized_specialist_dispatch_and_tamper_refusal(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);ns=functions('candidate.py',{'domain','load'},B=root);s=dict(ip_position='HJ',pot_chips=600,flop_board='2c3c4d');key=ns['domain'](s);(root/'HJ').mkdir();files={}
   for suffix,kind in (('','pooled'),('-UNP2T','two-tone')):
    p=root/'HJ'/('F.cbet'+suffix+'.joblib');joblib.dump(dict(domain_sha256=key,kind=kind),p);files[str(p.relative_to(root))]=hashlib.sha256(p.read_bytes()).hexdigest()
   (root/'fit.json').write_text(json.dumps(dict(recipe='projected_two_tone',domains={key:dict(position='HJ')},model_sha256=files)))
   self.assertEqual(ns['load'](s,'F.cbet',root)['kind'],'two-tone');self.assertEqual(ns['load'](dict(s,flop_board='2c3d4h'),'F.cbet',root)['kind'],'pooled')
   with self.assertRaises(ValueError):ns['load'](dict(s,pot_chips=601),'F.cbet',root)
   (root/'HJ/F.cbet-UNP2T.joblib').write_bytes(b'tamper')
   with self.assertRaises(ValueError):ns['load'](s,'F.cbet',root)
 def test_target_correction_preserves_ties_and_acceptable_rows(self):
  project=functions('targets.py',{'project_teacher'},ROOT_SOLVE_TOLERANCE_BB=.006)['project_teacher'];q=np.array([[0,1,1],[0,.003,.002],[0,2,1]],dtype=float);f=np.array([[.5,.25,.25],[.5,.3,.2],[1,0,0]],dtype=float)
  target=project(q,f);np.testing.assert_allclose(target,[[0,.5,.5],f[1],[0,1,0]],atol=1e-12);self.assertTrue(np.all(q.max(axis=1)-(q*target).sum(axis=1)<=.006+1e-12))
  for badq,badf in (([[float('inf'),0]],[[.5,.5]]),([[1,0]],[[float('nan'),1]]),([[1,0]],[[.4,.4]]),([[1,0]],[[-1,2]])):
   with self.assertRaises(ValueError):project(badq,badf)
 def test_board_normalization_reaches_actual_fitter(self):
  captured=[]
  class Recorder:
   def __init__(self,**kwargs):pass
   def fit(self,x,y,sample_weight):captured.append(sample_weight.copy())
  rows=[dict(acts=['b','c'],x=np.zeros((2,246)),target=np.array([[.2,.8],[.3,.7]]),mu=np.array([1.,3.])),dict(acts=['b','c'],x=np.ones((1,246)),target=np.array([[.4,.6]]),mu=np.array([100.]))]
  train=functions('fit.py',{'train'},HistGradientBoostingRegressor=Recorder,PARAMS={})['train'];model=train(rows,'synthetic-domain');self.assertEqual(len(model['heads']),2)
  for w in captured:np.testing.assert_allclose(w,[.375,1.125,1.5]);self.assertAlmostEqual(w.mean(),1.)
 def test_worst_family_selection_prevents_averaging_away_failure(self):
  select=functions('fit.py',{'selection'})['selection'];rows=[dict(family=f,regret_bb=v) for f,v in [('PAIR',0.),('MONO',0.),('UNPR',0.),('UNP2T',1.)]];self.assertEqual(select(rows),(1.,.25))
  balanced=[dict(family=r['family'],regret_bb=.3) for r in rows];self.assertLess(select(balanced),select(rows))
 def test_canonical_state_aliases_and_changed_geometry(self):
  ns=functions('state_identity.py',{'canonical_flop','context_key','game_key'});s=dict(ip_position='HJ',pot_chips=600,flop_board='2c3c4d');key=ns['game_key'](s)
  for b in ('4d2c3c','2d3d4h'):self.assertEqual(key,ns['game_key'](dict(s,flop_board=b)))
  self.assertNotEqual(key,ns['game_key'](dict(s,pot_chips=601)))
  with self.assertRaises(ValueError):ns['game_key'](dict(s,flop_board='2c2c3d'))
 def test_excluded_job_branch_never_reads_protected_content(self):
  tree=ast.parse((ROOT/'src/admission.py').read_text());branch=next(n for n in ast.walk(tree) if isinstance(n,ast.If) and 'not own_public_job' in ast.unparse(n.test));body=ast.unparse(ast.Module(body=branch.body,type_ignores=[]))
  for call in ('sha(p)','load(p)','read_bytes'):self.assertNotIn(call,body)
  self.assertIn('continue',body)
 def test_padding_has_no_real_target_permutation_path(self):
  tree=ast.parse((ROOT/'src/context_encode.py').read_text());pad=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='pads_for');body=ast.unparse(pad)
  self.assertIn('_class_supply',body);self.assertNotIn('relabel(',body);self.assertNotIn('PERMS',body);self.assertIn("need(class_pads_first is True",(ROOT/'src/context_encode.py').read_text())
 def test_cumulative_budget_includes_new_phase_without_reset(self):
  budget=functions('launch.py',{'budgets'})['budgets'];events=[]
  for prefix in ('F5D3-','F5CTX-','F5REPAIR-','F5TAIL-'):events.extend([dict(event='launch',out=prefix+'TEST',solver_runs_max=2,at='2026-11-17T00:00:00Z'),dict(event='exit',out=prefix+'TEST',rc=0,at='2026-11-17T01:00:00Z')])
  r=budget(events);self.assertEqual((r['runs'],r['hours'],r['d3_hours'],r['repair_runs'],r['repair_hours']),(8,4,4,2,1));self.assertTrue(budget(events[:-1])['open_operations'])
  with self.assertRaises(AssertionError):budget(events+[events[-1]])
 def test_working_set_units_and_invalid_values(self):
  memory=functions('score.py',{'memory_bytes'})['memory_bytes'];self.assertEqual(memory(1000000),1024000000);self.assertGreater(memory(1250000),1.25e9)
  for v in (0,-1,True,None,float('nan')):
   with self.assertRaises(ValueError):memory(v)
 def test_relative_and_absolute_thresholds_are_independent(self):
  compare=functions('score.py',{'compare'})['compare'];rows=[dict(family=f,baseline=10.,candidate=8.) for f in ('PAIR','MONO','UNP2T','UNPR')];self.assertTrue(compare(rows)['improved']);self.assertFalse(compare(rows)['absolute_pass'])
  for v,expected in ((3.,True),(3.000001,False)):self.assertEqual(compare([dict(family='PAIR',baseline=4.,candidate=v)])['absolute_pass'],expected)
 def test_storage_upper_endpoint_is_not_point_estimate(self):
  endpoint=functions('score.py',{'endpoint'})['endpoint'];self.assertAlmostEqual(endpoint(SimpleNamespace(value=6.,bound_pct=.5),600),1.5)
  for v,b in ((math.inf,0),(0,-.1)):
   with self.assertRaises(AssertionError):endpoint(SimpleNamespace(value=v,bound_pct=b),600)
 def test_actual_scorer_enforces_both_baselines_and_strict_two_tone(self):
  for candidate,original_two,expected in ((3.,5.,'FINITE_CONTEXT_QUALIFIED'),(3.,2.9,'FAIL_CONTEXT_IMPROVEMENT'),(4.,10.,'IMPROVED_NOT_QUALIFIED')):
   with tempfile.TemporaryDirectory() as td:
    root=Path(td);(root/'evidence').mkdir();calls=[];jobs=[dict(id=f,meta=dict(role='EVAL',family=f,position='HJ',sig='public-synthetic',game_key_sha256=f),phases=[dict(scenario=dict(pot_chips=600))]) for f in ('PAIR','MONO','UNP2T','UNPR')]
    class Results:
     def delta_vs_eq(self,jid,arm,key):
      calls.append('metric');name=arm.split('|')[1];value=candidate if name=='candidate' else original_two if name=='original' and jid=='UNP2T' else 10. if candidate==4. else 5. if name=='original' else 4.;return SimpleNamespace(value=value*6,bound_pct=0.)
    def write(p,value):
     calls.append('consume' if p.name.endswith('consumption.json') else 'result')
     with p.open('x') as f:json.dump(value,f)
    def technical(stage):calls.append('technical');return Results(),jobs,{}
    ns=functions('score.py',{'main','compare','endpoint'},B=root,sys=SimpleNamespace(argv=['score.py','EVAL']),frozen=lambda:None,candidate_frozen=lambda:None,load=lambda p:jobs,write=write,sha=lambda p:'synthetic',technical=technical,f4_results=SimpleNamespace(ResultsError=RuntimeError))
    with contextlib.redirect_stdout(io.StringIO()):ns['main']()
    result=json.loads((root/'evidence/EVAL-result.json').read_text());self.assertEqual(result['verdict'],expected);self.assertEqual(calls[:2],['consume','technical']);self.assertLess(calls.index('technical'),calls.index('metric'));before=len(calls)
    with self.assertRaises(AssertionError):ns['main']()
    self.assertEqual(before,len(calls))

sys.path.insert(0,str(ROOT))
from test_pipeline_safety import PipelineSafety

if __name__=='__main__':unittest.main()
