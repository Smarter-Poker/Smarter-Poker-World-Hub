"""Synthetic-only operational layout/budget/once-claim contracts; no native I/O."""
import ast,copy,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
from continuation import split_jobs,check_budget,canonical,eval_launches,provenance_names,regular_sha,verify_provenance,verify_sources,verify_chain_files,digest

class ContinuationContracts(unittest.TestCase):
    def test_chain_uses_same_reader_all_hashes_and_exact_train_role(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);paths=[root/str(i) for i in range(12)]
            for p in paths:p.write_bytes(str(p.name).encode())
            files={str(p):digest(p.read_bytes()) for p in paths};calls=[]
            class Reader:
                def read(self,p,role):
                    calls.append((p,role))
                    if role!='TRAIN':raise PermissionError('role')
                    return Path(p).read_bytes()
            g=Reader();c={'inputs':{p:{} for p in files}};common=SimpleNamespace(own=lambda p:Path(p))
            verify_chain_files(common,c,g,files);self.assertEqual(calls,[(p,'TRAIN') for p in files])
            for p in paths:
                original=p.read_bytes();p.write_bytes(original+b'drift')
                with self.assertRaises(ValueError):verify_chain_files(common,c,g,files)
                p.write_bytes(original)
            denied=SimpleNamespace(read=lambda p,role:(_ for _ in ()).throw(PermissionError('SOURCE is not TRAIN')))
            with self.assertRaises(PermissionError):verify_chain_files(common,c,denied,files)
            verify_chain_files(common,{'inputs':{}},g,files)
    def test_verify_constructs_one_reader_and_no_chain_recomputation(self):
        tree=ast.parse((Path(__file__).resolve().parent/'src/continuation.py').read_text())
        funcs={n.name:ast.unparse(n) for n in tree.body if isinstance(n,ast.FunctionDef)}
        self.assertEqual(funcs['verify'].count('common.config()'),1)
        self.assertNotIn('common.frozen()',funcs['verify'])
        for name in ['verify','release_check','stage']:self.assertNotIn('chain.candidate_chain()',funcs[name])
        self.assertEqual(funcs['prepare'].count('chain.candidate_chain()'),1)
    def test_semantic_body_preserves_original_pinned_algorithm(self):
        src=Path(__file__).resolve().parent/'src/continuation.py'
        actual=next(n for n in ast.parse(src.read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='semantic_chain').body[4:]
        self.assertEqual(digest('\n'.join(ast.dump(n) for n in actual).encode()),'5f1c75d896d9ab037cd304d855170cbcc07b209883d6cb355e11ebea2ee4402d')
    def jobs(self):return [dict(id='SYNTHETIC%02d'%i,meta=dict(family=('PAIR','MONO','UNP2T')[i//4] if i<12 else 'UNPR'),phases=[dict(scenario=dict(pot_chips=555 if i%2 else 585),arms=[dict(name='unchanged',writes=[dict(table=[.25,.75])])])]) for i in range(16)]
    def test_deterministic_max3_split_keeps_every_original_object(self):
        jobs=self.jobs();original=copy.deepcopy(jobs);groups=split_jobs(list(reversed(jobs)));self.assertEqual([len(g) for g in groups],[3,3,3,3,1,3]);self.assertEqual(jobs,original)
        self.assertEqual({j['id']:canonical(j) for j in jobs},{j['id']:canonical(j) for g in groups for j in g});self.assertTrue(all(j['meta']['family']=='UNPR' for g in groups[4:] for j in g))
    def test_duplicate_or_missing_or_family_change_refused(self):
        jobs=self.jobs()
        for bad in (jobs[:-1],jobs[:-1]+[jobs[0]],[dict(j,meta={'family':'PAIR'}) for j in jobs]):
            with self.assertRaises(ValueError):split_jobs(bad)
    def test_same2h_budget_formula_can_admit3_when6refuses(self):
        b=dict(runs=814,hours=29,combined_hours=16,phase_runs=16,phase_hours=.8,open_operations=[])
        self.assertGreater(b['phase_hours']+(900*6+600)/3600,2)
        self.assertEqual(check_budget(b,3),(900*3+600)/3600)
        with self.assertRaises(ValueError):check_budget(b,6)
        b['phase_hours']=1.1
        with self.assertRaises(ValueError):check_budget(b,3)
        self.assertEqual(check_budget(b,1),(900+600)/3600)
    def test_all_original_global_combined_used_runs_and_open_state_count(self):
        base=dict(runs=814,hours=29,combined_hours=16,phase_runs=16,phase_hours=.5,open_operations=[])
        for k,v in [('runs',1999),('hours',39.5),('combined_hours',17.5),('phase_runs',38),('open_operations',[('open','first')])]:
            b=dict(base);b[k]=v
            with self.assertRaises(ValueError):check_budget(b,3)
    def test_original_and_continuation_share_same_evaluation_launch_domain(self):
        events=[dict(event='launch',out='F5P136-E-N00'),dict(event='launch',out='F5P136-E-S00'),dict(event='launch',out='F5P136-T-N00'),dict(event='launch',out='F5P136-E-S01',dry=True)]
        self.assertEqual([e['out'] for e in eval_launches(events)],['F5P136-E-N00','F5P136-E-S00'])
    def test_same_global_claim_is_exclusive_before_any_metric(self):
        tree=ast.parse((Path(__file__).resolve().parent/'src/continuation.py').read_text());score=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='score');text=ast.unparse(score)
        self.assertIn("common.write('EVALUATION-CLAIM.json'",text);self.assertLess(text.index("common.write('EVALUATION-CLAIM.json'"),text.index('result, summary = ops.technical'))
        self.assertIn('stats = scorer.compare(rows)',text);self.assertIn('100 * value.value / pot + value.bound_pct',text)
    def test_collection_persists_failure_when_A2_loader_throws(self):
        tree=ast.parse((Path(__file__).resolve().parent/'src/continuation.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='collect')
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);saved={};out='F5P136-E-S00';co=dict(out=out,ids=['SYNTHETIC'],job_file='jobs.json',rainbow_solo=False)
            def failure(*args,**kwargs):raise ValueError('synthetic mandatory A2 refusal')
            ops=SimpleNamespace(events=lambda:[dict(event='launch',out=out),dict(event='exit',out=out,rc=0,rc_source='m1_marker')],REMOTE='SYNTHETIC',HELPER='SYNTHETIC',remote_ps=lambda script:dict(files={'SYNTHETIC.json':'pin'},pio_count=0),technical=failure,results_loader=failure)
            common=SimpleNamespace(sha=lambda path:'driverpin')
            def copy_stub(*args,**kwargs):
                dest=root/'m1'/out;dest.mkdir(exist_ok=True);(dest/'SYNTHETIC.json').write_text('{}');return SimpleNamespace(returncode=0)
            ns=dict(F=root,release_check=lambda:(common,ops,None,None),read=lambda path:dict(cohorts={'E-S00':co}),subprocess=SimpleNamespace(run=copy_stub),sha=lambda path:'pin',stamp=lambda:'SYNTHETIC',write=lambda path,value:saved.__setitem__(path,value))
            exec(compile(ast.Module(body=[fn],type_ignores=[]),'actual_collect','exec'),ns)
            with self.assertRaises(SystemExit):ns['collect']('E-S00')
            self.assertEqual(saved['TERMINAL-TECHNICAL-FAIL.json']['verdict'],'TERMINAL_TECHNICAL_FAIL');self.assertIn('synthetic mandatory A2 refusal',saved['TERMINAL-TECHNICAL-FAIL.json']['loader_error']);self.assertIn('evidence/technical-E-S00.json',saved)
    def test_every_train_provenance_and_refusal_drift_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);(root/'evidence').mkdir();refusal=root/'evidence/refusal.json';refusal.write_text('original refusal')
            c={'cohort_order':['T0','T1','T2','T3','E0'],'cohorts':{t:{'stage':'TRAIN' if t.startswith('T') else 'EVALUATION'} for t in ['T0','T1','T2','T3','E0']}}
            names=provenance_names(c);self.assertEqual(len(names),8)
            for p in names:(root/p).write_text('original '+p)
            f=dict(refusal_path=str(refusal),refusal_sha256=regular_sha(refusal,root/'evidence'),provenance_files={p:regular_sha(root/p,root) for p in names})
            with patch('continuation.E',root):
                verify_provenance(f)
                for path in [refusal,*[root/p for p in names]]:
                    original=path.read_bytes();path.write_bytes(original+b'drift')
                    with self.assertRaises(ValueError):verify_provenance(f)
                    path.write_bytes(original)
                original=refusal.read_bytes();refusal.unlink();target=root/'target';target.write_bytes(original);refusal.symlink_to(target)
                with self.assertRaises(ValueError):verify_provenance(f)
    def test_review_source_closure_is_frozen_and_verified(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);(root/'src').mkdir();names=['PLAN.md','API.md','test_contracts.py','src/continuation.py']
            for p in names:(root/p).write_text('original '+p)
            f=dict(source_files={p:regular_sha(root/p,root) for p in names})
            with patch('continuation.F',root):
                verify_sources(f)
                for p in names:
                    path=root/p;original=path.read_bytes();path.write_bytes(original+b'drift')
                    with self.assertRaises(ValueError):verify_sources(f)
                    path.write_bytes(original)
                for p in names:
                    bad=dict(source_files={k:v for k,v in f['source_files'].items() if k!=p})
                    with self.assertRaises(ValueError):verify_sources(bad)

if __name__=='__main__':unittest.main()
