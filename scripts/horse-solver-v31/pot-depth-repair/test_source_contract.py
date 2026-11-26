"""Finite scientific/operational contracts. No fits, solver access or answer reads."""
import ast,copy,importlib.util,json,os,queue,sys,tempfile,unittest
from pathlib import Path
import numpy as np
D=Path(__file__).resolve().parent
sys.path[:0]=[str(D/'src'),str(D/'driver'),str(D/'operators')]
from pot_scope import require_pot_bracket,at_pot
from context_scope import game_key
from dataset import COMBO_CARDS,expected_root_indices
from models import conditional_targets,PARAMS
from score import compare
from native_telemetry import aggregate_exit,instrument,capture_failure,TailQueue
from context_deadline import Deadline
from types import SimpleNamespace
class Failure(Exception):pass
class Contracts(unittest.TestCase):
 def scenario(self,pot=600):return dict(effective_stack_chips=20000,chips_per_bb=100,pot_chips=pot,flop_board='2c4cJc',rake=[.1,250],tree_lines=[[0,198,594,20000]],oop_range_path='oop',ip_range_path='ip',scenario_id='ignored',purpose='ignored')
 def test_pot_bracket_excludes_exact_and_different_geometry(self):
  t=self.scenario(555);a=self.scenario(540);b=self.scenario(600);self.assertEqual(require_pot_bracket(t,[a,b])['support_pots'],[540,600])
  for changed in ['rake','tree_lines','effective_stack_chips','ip_range_path','flop_board']:
   bad=copy.deepcopy(b);bad[changed]=[0,0] if changed=='rake' else [[20000]] if changed=='tree_lines' else 22000 if changed=='effective_stack_chips' else 'other'
   with self.assertRaises(ValueError):require_pot_bracket(t,[a,bad])
  with self.assertRaises(ValueError):require_pot_bracket(t,[a,b,t])
 def test_train_context_explicit_exposure(self):
  t=self.scenario(540);self.assertTrue(require_pot_bracket(t,[t],True)['training_exposure'])
  with self.assertRaises(ValueError):require_pot_bracket(t,[t])
 def test_canonical_root_mask_is_independent_and_board_complete(self):
  self.assertEqual(len(COMBO_CARDS),1326);raw=np.ones(1326);mask=expected_root_indices(raw,'2c4cJc');self.assertEqual(len(mask),1176);self.assertTrue(all(not set(COMBO_CARDS[i])&{'2c','4c','Jc'} for i in mask));raw[mask[0]]=0;self.assertEqual(len(expected_root_indices(raw,'2c4cJc')),1175)
 def test_direct_conditional_target_does_not_zero_unreachable_rows(self):
  target=np.array([[.01,.99],[.7,.3]]);self.assertTrue(np.array_equal(conditional_targets(target),target));self.assertEqual(PARAMS['random_state'],741);self.assertFalse(PARAMS['early_stopping'])
 def rows(self,value=.5):return [dict(family=f,baseline=1.,range_root=value) for f in ('PAIR','MONO','UNP2T','UNPR') for _ in range(8)]
 def test_every_seat_3pct_and_strict_two_tone(self):
  self.assertTrue(compare(self.rows())['eligible']);r=self.rows();r[0]['range_root']=3.00000001;self.assertFalse(compare(r)['absolute_pass']);r=self.rows();r[16]['range_root']=5.;self.assertFalse(compare(r)['relative_pass'])
 def test_bounded_deadline_and_transparent_queue(self):
  now=[0.];d=Deadline(lambda:now[0]);d.begin();self.assertEqual(d.timeout(7200),600);now[0]=600
  with self.assertRaises(TimeoutError):d.timeout(7200)
  from collections import deque
  q=queue.Queue();tail=deque(maxlen=32);t=TailQueue(q,tail)
  for line in ('SOLVER:','progress','END','ok','END'):t.put(line)
  self.assertEqual([t.get() for _ in range(5)],['SOLVER:','progress','END','ok','END'])
 def test_typed_command_timeout_tail_and_success(self):
  class Base:
   def __init__(self):self._lines=queue.Queue()
   def command(self,c,t):
    self._lines.put('progress');self._lines.get()
    if c=='wait_for_solver':raise Failure('timeout waiting for END')
    return 'unchanged'
  Observed,Typed=instrument(Base,Failure);p=Observed();self.assertEqual(p.command('is_ready',2),'unchanged')
  with self.assertRaises(Typed) as caught:p.command('wait_for_solver',4)
  self.assertEqual(caught.exception.context['command'],'wait_for_solver');self.assertEqual(caught.exception.context['tail'],['progress'])
 def test_failed_aggregate_exit_handles_malformed_shapes(self):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td)/'a.json';jobs=[dict(id='a')]
   for value in [[],None,dict(id='a',status='ok',storage_summary=None),dict(id='a',status='ok',storage_summary={'complete':'true'}),dict(id='a',status='failed',storage_summary={'complete':True})]:p.write_text(json.dumps(value));self.assertEqual(aggregate_exit(jobs,td),1)
   p.write_text(json.dumps(dict(id='a',status='ok',storage_summary={'complete':True})));self.assertEqual(aggregate_exit(jobs,td),0)
 def test_actual_failure_handler_preserves_before_restart_failure(self):
  tree=ast.parse((D/'driver/f4_lock_driver.py').read_text());handlers=[n for n in ast.walk(tree) if isinstance(n,ast.ExceptHandler) and 'capture_failure' in ast.unparse(n)];self.assertEqual(len(handlers),3)
  handler=handlers[1];calls=[];rec={};scope=dict(PioError=Failure,rec=rec,pr={},proc=SimpleNamespace(close=lambda:calls.append('close')),sent=[],BUDGET=SimpleNamespace(end=lambda:None),capture_failure=lambda r,*args:r.update(failure_diagnostics={'captured':True}),Failure=Failure)
  block=ast.Module(body=[ast.Try(body=[ast.Raise(exc=ast.Call(func=ast.Name(id='Failure',ctx=ast.Load()),args=[ast.Constant(value='original timeout')],keywords=[]),cause=None)],handlers=[handler],orelse=[],finalbody=[])],type_ignores=[]);exec(compile(ast.fix_missing_locations(block),'<actual handler>','exec'),scope);self.assertTrue(scope['restart_required']);self.assertEqual(rec['status'],'failed');self.assertTrue(rec['failure_diagnostics']['captured'])
  fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='write_output');exec(compile(ast.Module(body=[fn],type_ignores=[]),'<actual writer>','exec'),dict(os=os,time=__import__('time')),scope)
  with tempfile.TemporaryDirectory() as td:
   path=Path(td)/'failure.json';scope['write_output'](path,json.dumps(rec))
   def failed_start():raise OSError('restart failed')
   with self.assertRaises(OSError):failed_start()
   self.assertEqual(json.loads(path.read_bytes())['error'],"Failure('original timeout')")
  for h in handlers:self.assertNotIn('start()',ast.unparse(h));self.assertIn('restart_required = True',ast.unparse(h))
 def test_six_helper_wrapper_and_real_exit_contract(self):
  tree=ast.parse((D/'driver/f4_m1.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='cmd_run');text=ast.unparse(fn);self.assertIn('rc = p.wait()',text);self.assertIn("return ({'exit_rc': rc}, rc)",text);source=(D/'src/f5_native_launch.py').read_text();self.assertIn("('telemetry', 'native_telemetry.py')",source);self.assertIn("('deadline', 'context_deadline.py')",source)
 def test_budget_charges_closed_failed_and_all_old_prefixes(self):
  from ops import budget,reserved_runs
  events=[]
  for i,prefix in enumerate(['F5NQ-','F5FB-','F5FOLLOW-']):
   events.extend([dict(event='launch',out=prefix+'X',at='2026-11-26T00:00:00Z',solver_runs_max=1),dict(event='exit',out=prefix+'X',at='2026-11-26T00:01:00Z',rc=1 if i==2 else 0)])
  b=budget(events);self.assertEqual(b['runs'],3);self.assertEqual(b['phase_runs'],1);self.assertEqual(b['open_operations'],[]);self.assertAlmostEqual(b['combined_hours'],.05);self.assertEqual(reserved_runs('HARVEST',events),32);self.assertEqual(reserved_runs('TRAIN',events),16)
 def test_collect_preserves_terminal_receipt_when_loader_also_fails(self):
  import ops,hashlib
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);tag='H-D00';out='F5FOLLOW-'+tag;native=b'{malformed';digest=hashlib.sha256(native).hexdigest();(root/('jobs-'+tag+'.json')).write_text('[{"id":"case"}]')
   def fake_run(args,**kwargs):
    if args[1]=='scp':
     folder=root/'m1'/out;folder.mkdir();(folder/'case.json').write_bytes(native)
    return SimpleNamespace(returncode=0,stderr='')
   def fake_write(path,value):(root/path).write_text(json.dumps(value))
   def fake_sha(path):
    p=Path(path);return hashlib.sha256((p if p.is_absolute() else root/p).read_bytes()).hexdigest()
   def loader_error():raise ValueError('A2 provenance parse failed')
   (root/'evidence').mkdir()
   with patch.multiple(ops,B=root,config=lambda:({'cohorts':{tag:dict(stage='HARVEST',rainbow_solo=False)}},None),release=lambda tag:None,events=lambda:[dict(event='launch',out=out),dict(event='exit',out=out,rc=1,rc_source='m1_marker')],remote_ps=lambda script:{'files':{'case.json':digest},'pio_count':0},technical=lambda *args:(_ for _ in ()).throw(ValueError('native malformed')),results_loader=loader_error,write=fake_write,sha=fake_sha),patch.object(ops.subprocess,'run',fake_run):
    with self.assertRaises(SystemExit):ops.collect(tag)
   receipt=json.loads((root/'evidence/technical-H-D00.json').read_bytes());self.assertEqual(receipt['verdict'],'TERMINAL_TECHNICAL_FAIL');self.assertEqual(receipt['native_exit'],1);self.assertEqual(receipt['local_files'],receipt['remote_files']);self.assertIn('A2 provenance parse failed',receipt['loader_error'])
 def test_actual_owned_namespace_and_foreign_refusal(self):
  from stage_namespace import ensure_namespace
  from ops import REMOTE
  seen=[];h='a'*64
  def remote(script):seen.append(script);return dict(created=True,freeze=h)
  self.assertTrue(ensure_namespace(remote,REMOTE,h));self.assertIn(REMOTE,seen[0])
  for bad in [REMOTE+'-other',r'C:\\sp-v31\\hv31-fallback-01a1e479']:
   with self.assertRaises(ValueError):ensure_namespace(remote,bad,h)
 def test_causal_chain_rejects_wrong_fit_release_and_keeps_external_train_pins(self):
  import candidate_chain as chain
  from unittest.mock import patch
  h='a'*64;ids=['new'+str(i) for i in range(5)];reused={'old'+str(i):dict(path='/admitted-TRAIN/native'+str(i)+'.json',sha256=h) for i in range(59)};expected={v['path']:h for v in reused.values()};expected.update({str(D/'m1/F5FOLLOW-H'/ (i+'.json')):h for i in ids})
  dataset=[dict(game_key=str(i//4),label_path='/admitted-TRAIN/label'+str(i),label_sha256=h,features_path=str(D/'features'/str(i)),features_sha256=h) for i in range(672)]
  artifacts={'DATA-RELEASE.json':dict(accepted=True,freeze_sha256=h,dataset_sha256=h,fit_games=168,nodes=672,files={},native_sources=expected),'FIT-ADMISSION.json':dict(accepted=True,freeze_sha256=h,data_release_sha256=h,dataset_sha256=h,fit_games=168),'FIT.json':dict(freeze_sha256=h,data_release_sha256=h,fit_games=168,models={'models/'+str(i):dict(sha256=h) for i in range(8)}),'CANDIDATE-SEAL.json':dict(fit_sha256=h,models=8,fitted_once=True),'REUSED-TRAIN-ADMISSION.json':dict(accepted=True,games=59,freeze_sha256=h,mandatory_A2=True),'FIT-CLAIM.json':dict(freeze_sha256=h,data_release_sha256=h),'DATASET.json':dataset,'evidence/technical-H.json':dict(verdict='PASS_NATIVE_COPY_A2_TECHNICAL',local_files={i+'.json':h for i in ids})};reads=[]
  with patch.multiple(chain,frozen=lambda:None,config=lambda:({'reused_native':reused,'cohorts':{'H':dict(stage='HARVEST',ids=ids)}},None),sha=lambda p:h,read=lambda p:artifacts[p],data_bytes=lambda p,h,r:reads.append((str(p),r))):
   files=chain.candidate_chain();self.assertEqual(files['/admitted-TRAIN/native0.json'],h);self.assertIn('FIT-ADMISSION.json',files);self.assertIn('evidence/technical-H.json',files);self.assertTrue(all(r=='TRAIN' for p,r in reads));artifacts['FIT.json']['data_release_sha256']='wrong'
   with self.assertRaises(AssertionError):chain.candidate_chain()
 def test_public_launcher_uses_node_import(self):
  source=(D/'src/context_encode.py').read_text();self.assertIn("['node', '--import', 'tsx',",source);self.assertNotIn("['./node_modules/.bin/tsx'",source)
 def test_release_verifies_external_train_pins_through_role_reader(self):
  import ops,hashlib
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as td:
   from data_access import SafeInputs
   import common
   root=Path(td);external=root/'admitted-TRAIN.npz';external.write_bytes(b'actual admitted train bytes');digest=hashlib.sha256(external.read_bytes()).hexdigest();guard=SafeInputs({str(external):dict(role='TRAIN',sha256=digest)})
   receipt=dict(accepted=True,freeze_sha256='freeze',files={str(external):digest})
   with patch.multiple(ops,frozen=lambda:None,config=lambda:({'cohorts':{'H':{'stage':'HARVEST'}}},None),read=lambda p:receipt,sha=lambda p:'freeze'),patch.object(common,'config',lambda:({'inputs':guard.entries},guard)):
    self.assertIs(ops.release('H'),receipt);external.write_bytes(b'drift')
    with self.assertRaises(ValueError):ops.release('H')
 def test_public_finalizer_refuses_external_or_symlink_rows_before_copy(self):
  import hashlib,stat
  tree=ast.parse((D/'operators/finalize_inputs.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='public_row_bytes');scope=dict(Path=Path,os=os,stat=stat,hashlib=hashlib);exec(compile(ast.Module(body=[fn],type_ignores=[]),'<actual public row reader>','exec'),scope);reader=scope['public_row_bytes']
  with tempfile.TemporaryDirectory() as td:
   root=Path(td)/'public';root.mkdir();p=root/'row.npz';raw=b'public geometry only';p.write_bytes(raw);digest=hashlib.sha256(raw).hexdigest();self.assertEqual(reader(p,digest,root),raw)
   external=Path(td)/'excluded.npz';external.write_bytes(raw)
   with self.assertRaises(PermissionError):reader(external,digest,root)
   link=root/'link.npz';link.symlink_to(p)
   with self.assertRaises(OSError):reader(link,digest,root)
 def test_once_claims_and_stage_gate_source_wiring(self):
  fit=(D/'src/fit.py').read_text();self.assertLess(fit.index("write('FIT-CLAIM.json'"),fit.index('.fit('));score=(D/'src/score.py').read_text();self.assertLess(score.index('write(claim,'),score.index('result.delta_vs_eq'));tables=(D/'src/build_tables.py').read_text();self.assertIn("result['stats']['eligible'] is True",tables);self.assertIn('baseline_writes(c,source,seat)',tables)
 def test_dataset_admission_has_independent_feature_teacher_and_exact_key_checks(self):
  source=(D/'operators/seal_fit_admission.py').read_text();self.assertIn("r['game_key']==game_key(job['phases'][0]['scenario'])",source);self.assertIn("np.array_equal(x['S'],sem[r['spot']]['X'])",source);self.assertIn("np.array_equal(y['frequency'],freq)",source)
if __name__=='__main__':unittest.main()
