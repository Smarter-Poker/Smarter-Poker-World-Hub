import hashlib,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
from data_access import SafeInputs
import copy,json,ast,math,datetime
import numpy as np
from context_scope import at_depth,game_key,require_bracket,stack_only_matrix
from range_features import root_mass,features,SP
from models import conditional_targets,table
class InputContracts(unittest.TestCase):
 def test_unknown_before_any_open_even_with_anchor(self):
  g=SafeInputs({},anchors=[dict(root='/synthetic/volume',device=7,inode=2)])
  with patch('os.open',side_effect=AssertionError('must not open')):
   with self.assertRaises(PermissionError):g.read('/synthetic/volume/unknown','TRAIN')
 def test_protected_declaration_stays_refused(self):
  with self.assertRaises(ValueError):SafeInputs({'/synthetic/volume/HOLDOUT/a.json':dict(role='SOURCE',sha256='0'*64)},anchors=[dict(root='/synthetic/volume',device=7,inode=2)])
 def test_verified_child_below_nonreadable_parent(self):
  with tempfile.TemporaryDirectory() as td:
   parent=Path(td)/'scaffold';root=parent/'mounted-child';root.mkdir(parents=True);p=root/'TRAIN.bin';p.write_bytes(b'TRAIN ONLY');st=root.stat();entries={str(p):dict(role='TRAIN',sha256=hashlib.sha256(p.read_bytes()).hexdigest())}
   parent.chmod(0o100)
   try:
    with self.assertRaises(PermissionError):SafeInputs(entries).read(p,'TRAIN')
    g=SafeInputs(entries,anchors=[dict(root=str(root),device=st.st_dev,inode=st.st_ino)]);self.assertEqual(g.read(p,'TRAIN'),b'TRAIN ONLY')
   finally:parent.chmod(0o700)
 def test_changed_anchor_and_symlink_and_digest_fail_closed(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);p=root/'TRAIN.bin';p.write_bytes(b'one');st=root.stat();entry={str(p):dict(role='TRAIN',sha256=hashlib.sha256(b'one').hexdigest())};anchor=dict(root=str(root),device=st.st_dev,inode=st.st_ino)
   with self.assertRaises(PermissionError):SafeInputs(entry,anchors=[dict(anchor,inode=st.st_ino+1)]).read(p,'TRAIN')
   q=root/'TRAIN-other.bin';q.write_bytes(b'one');p.unlink();p.symlink_to(q)
   with self.assertRaises(OSError):SafeInputs(entry,anchors=[anchor]).read(p,'TRAIN')
   p.unlink();p.write_bytes(b'two')
   with self.assertRaises(ValueError):SafeInputs(entry,anchors=[anchor]).read(p,'TRAIN')
class ModelContracts(unittest.TestCase):
 def scenario(self):return dict(scenario_id='SYNTHETIC',purpose='TRAIN',effective_stack_chips=20000,chips_per_bb=100,flop_board='2c3d4h',pot_chips=600,rake=[.1,250],ip_range_checksum='a',oop_range_checksum='b',tree_lines=[[0,198,594,20000,20000]])
 def test_exact_context_bracket_excludes_target_and_unsupported_geometry(self):
  s=self.scenario();neighbors=[at_depth(s,d) for d in (18000,22000)];r=require_bracket(s,neighbors);self.assertFalse(r['held_out_global_rank'])
  with self.assertRaises(ValueError):require_bracket(s,neighbors+[s])
  with self.assertRaises(ValueError):require_bracket(s,neighbors[:1])
  for key,value in (('flop_board','2c3d5h'),('rake',[.05,125]),('ip_range_checksum','other')):
   changed=copy.deepcopy(s);changed[key]=value
   with self.assertRaises(ValueError):require_bracket(changed,neighbors)
 def test_stack_transform_changes_only_physical_slot_and_refuses_other_changes(self):
  s=self.scenario();x=np.zeros((3,246));x[:,32]=150;x[:,98]=200;t=at_depth(s,18000);y=stack_only_matrix(x,s,t);expected=x.copy();expected[:,98]=180;np.testing.assert_array_equal(y,expected)
  t['pot_chips']=601
  with self.assertRaises(ValueError):stack_only_matrix(x,s,t)
  with self.assertRaises(ValueError):at_depth(s,19000)
 def test_conditional_targets_keep_information_at_zero_parent_mass(self):
  # Multiplication by a zero parent maps both responses to identical zeros.
  responses=np.array([[1.,0.],[0.,1.]]);old_joint=np.zeros((2,2));self.assertTrue(np.array_equal(old_joint[0],old_joint[1]));np.testing.assert_array_equal(conditional_targets(responses),responses)
  self.assertFalse(np.array_equal(conditional_targets(responses)[0],conditional_targets(responses)[1]));self.assertEqual(table([[.01,.99]]),[[.01,.99]])
 def test_public_root_matchup_mass_matches_disjoint_pair_enumeration(self):
  pairs=[(lo,hi) for hi in range(1,52) for lo in range(hi)];own=np.zeros(1326);opp=np.zeros(1326);indices=np.array([0,100,1000]);own[indices]=[1,.5,.75];opp[[10,200,1200]]=[1,.7,.4]
  expected=[own[i]*sum(opp[j] for j in range(1326) if not set(pairs[i])&set(pairs[j])) for i in indices];np.testing.assert_allclose(root_mass(indices,own,opp),expected,rtol=0,atol=1e-14)
 def test_public_physics_features_ignore_absolute_board_rank_shortcuts(self):
  mats={};ranges={}
  for actor,ci in (('IP',np.array([0,100,1000])),('OOP',np.array([10,200,1200]))):
   rv=np.zeros(1326);rv[ci]=[1,.7,.4];ranges[actor]=rv
   x=np.zeros((3,246));x[:,181:184]=[.6,.1,.3];x[:,184:187]=[.5,.2,.3];x[:,94]=6;x[:,95]=2.5;x[:,96]=.1;x[:,98]=200
   for sp in (('F.cbet','F.vs_xr') if actor=='IP' else ('F.vs_b33','F.vs_b75')):mats[sp]=dict(X=x.copy(),combo_indices=ci.copy())
  a=features(mats,ranges);changed=copy.deepcopy(mats)
  for m in changed.values():m['X'][:,13:32]=999;m['X'][:,189:194]=999
  b=features(changed,ranges)
  for sp in SP:self.assertEqual(a[sp]['X'].shape,(3,136));np.testing.assert_array_equal(a[sp]['X'],b[sp]['X']);self.assertTrue(np.isfinite(a[sp]['X']).all())
 def test_combined_native_budget_charges_old_root_and_new_context_phase(self):
  p=Path(__file__).resolve().parent/'src/ops.py';tree=ast.parse(p.read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='budget');ns={'datetime':datetime};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(p),'exec'),ns);e=[]
  for prefix in ('F5D3-','F5CTX-','F5REPAIR-','F5TAIL-','F5ROOT-','F5RCTX-'):
   e.extend([dict(event='launch',out=prefix+'X',solver_runs_max=2,at='2026-11-17T00:00:00Z'),dict(event='exit',out=prefix+'X',rc=0,at='2026-11-17T01:00:00Z')])
  b=ns['budget'](e);self.assertEqual((b['runs'],b['combined_hours'],b['phase_runs'],b['phase_hours']),(12,6,2,1));self.assertTrue(ns['budget'](e[:-1])['open_operations'])
 def test_actual_screen_claim_opposite_seat_and_units_without_fitting(self):
  from types import SimpleNamespace
  source=Path(__file__).resolve().parent/'src/score.py';tree=ast.parse(source.read_text());functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('compare','main')]
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);cohorts={};index=0
   for suffix,n in (('N00',6),('N01',6),('R00',1),('R01',3)):
    tag='V-'+suffix;cohorts[tag]={'stage':'SCREEN'};jobs=[]
    for _ in range(n):
     jobs.append(dict(id='SYNTHETIC%d'%index,meta=dict(source_train_id='TRAIN%d'%index,family=('PAIR','MONO','UNP2T','UNPR')[index%4],position='HJ'),phases=[dict(scenario=dict(pot_chips=600))]));index+=1
    (root/('jobs-TRAIN-'+tag+'.json')).write_text(json.dumps(jobs));(root/'evidence').mkdir(exist_ok=True);(root/'evidence'/('technical-'+tag+'.json')).write_text(json.dumps(dict(verdict='PASS_NATIVE_COPY_A2_TECHNICAL')))
   class Results:
    def delta_vs_eq(self,jid,arm,key):
     assert key==('oop_mes_chips' if arm.startswith('ip_') else 'ip_mes_chips');return SimpleNamespace(value=30. if arm.endswith('|baseline') else 24.,bound_pct=0.)
   def write(p,v):
    with (root/p).open('x') as f:json.dump(v,f)
   def technical(*args):self.assertTrue((root/'TRAIN-SCREEN-CLAIM.json').exists());return Results(),{'sessions':16}
   ns=dict(B=root,np=np,math=math,json=json,datetime=datetime,RECIPES=('context_root','range_root'),release=lambda tag:None,config=lambda:({'cohorts':cohorts,'cohort_order':list(cohorts)},None),read=lambda p:json.loads((root/p).read_bytes()),write=write,sha=lambda p:'synthetic',technical=technical)
   exec(compile(ast.Module(body=functions,type_ignores=[]),str(source),'exec'),ns);ns['main']();r=json.loads((root/'TRAIN-SCREEN.json').read_bytes());self.assertEqual(r['verdict'],'TRAIN_CONTEXT_SCREEN_FAIL');self.assertEqual(len(r['rows']),32);self.assertEqual(r['stats']['range_root']['breaches'],32);self.assertFalse(r['held_out_global_ranks']);self.assertFalse((root/'CONTEXT-CANDIDATE.json').exists())
 def test_absolute_and_strict_two_tone_gates_remain_required(self):
  p=Path(__file__).resolve().parent/'src/score.py';tree=ast.parse(p.read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='compare');ns={'np':np};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(p),'exec'),ns)
  rows=[dict(family=f,baseline=4.,candidate=2.) for f in ('PAIR','MONO','UNP2T','UNPR') for _ in range(8)];self.assertTrue(ns['compare'](rows,'candidate')['eligible']);rows[-1]['candidate']=3.0000001;self.assertFalse(ns['compare'](rows,'candidate')['eligible'])
  for r in rows:
   if r['family']=='UNP2T':r.update(baseline=.1,candidate=.2)
  self.assertFalse(ns['compare'](rows,'candidate')['relative_pass'])
if __name__=='__main__':unittest.main()
