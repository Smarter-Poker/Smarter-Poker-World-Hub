"""Hermetic software checks of reviewed source; no private imports or model fits."""
import ast
import copy
import datetime
import hashlib
import json
import math
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import joblib
import numpy as np

ROOT = Path(__file__).resolve().parent


def functions(name, wanted, **dependencies):
    tree = ast.parse((ROOT / 'src' / name).read_text())
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in wanted]
    assert {n.name for n in nodes} == set(wanted)
    namespace = dict(Path=Path, json=json, hashlib=hashlib, datetime=datetime,
                     math=math, np=np, joblib=joblib, **dependencies)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(ROOT / 'src' / name), 'exec'), namespace)
    return namespace


class SourceContracts(unittest.TestCase):
    def test_reviewed_files_and_python_syntax_are_preserved(self):
        manifest = json.loads((ROOT / 'source-manifest.json').read_text())
        self.assertFalse(manifest['live_play'])
        self.assertFalse(manifest['training_and_evaluation_authorized'])
        self.assertEqual(len(manifest['source_files']), 20)
        for name, expected in manifest['source_files'].items():
            path = ROOT / name
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected, name)
            if path.suffix == '.py':
                ast.parse(path.read_text(), filename=name)
        self.assertFalse(list(ROOT.rglob('*.joblib')))
        self.assertFalse(list(ROOT.rglob('*.npy')))
        self.assertFalse(list(ROOT.glob('jobs-*.json')))
        self.assertFalse((ROOT / 'spec.json').exists())

    def test_domain_rejects_changed_game_and_unknown_fields(self):
        domain = functions('candidate.py', {'domain'})['domain']
        scenario = dict(ip_position='HJ', oop_position='BB', pot_chips=600,
                        effective_stack_chips=20000, rake=[.1, 250],
                        ip_range_checksum='synthetic-root', tree_lines=[[0, 600]],
                        flop_board='2c3d4h', scenario_id='SYNTHETIC_TEST')
        key = domain(scenario)
        self.assertEqual(key, domain(dict(scenario, flop_board='5c6d7h', scenario_id='OTHER')))
        for field, value in [('ip_position', 'BTN'), ('pot_chips', 601),
                             ('effective_stack_chips', 8000), ('rake', [0, 0]),
                             ('ip_range_checksum', 'different'), ('tree_lines', []),
                             ('unknown_contract', True)]:
            self.assertNotEqual(key, domain(dict(scenario, **{field: value})), field)

    def test_actual_dispatcher_checks_domain_and_model_bytes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            ns = functions('candidate.py', {'domain', 'load'}, B=root)
            scenario = dict(ip_position='HJ', pot_chips=600)
            key = ns['domain'](scenario)
            (root / 'HJ').mkdir()
            model = root / 'HJ/F.cbet.joblib'
            joblib.dump(dict(domain_sha256=key), model)
            report = dict(domains={key: dict(position='HJ')}, model_sha256={
                'HJ/F.cbet.joblib': hashlib.sha256(model.read_bytes()).hexdigest()})
            (root / 'fit.json').write_text(json.dumps(report))
            self.assertEqual(ns['load'](scenario, 'F.cbet', root)['domain_sha256'], key)
            with self.assertRaises(ValueError):
                ns['load'](dict(scenario, pot_chips=601), 'F.cbet', root)
            model.write_bytes(b'tampered')
            with self.assertRaises(ValueError):
                ns['load'](scenario, 'F.cbet', root)

    def test_canonical_harvest_binding_and_duplicate_refusal(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            jobs = [root / 'jobs-TRAIN-N00.json', root / 'jobs-TRAIN-R00.json']
            dirs = [root / 'm1/F5REPAIR-TRAIN-N00', root / 'm1/F5REPAIR-TRAIN-R00']
            report = dict(files={str(p): {} for p in jobs})
            ns = functions('common.py', {'validate_train_paths'}, B=root, load=lambda _: report)
            check = ns['validate_train_paths']
            check(jobs, dirs)
            with self.assertRaisesRegex(AssertionError, 'validated TRAIN harvest'):
                check(jobs, [dirs[0], root / 'same-ids-unvalidated'])
            with self.assertRaisesRegex(AssertionError, 'canonical TRAIN job'):
                check([jobs[0], jobs[0]], dirs)

    def test_weight_recipes_use_declared_board_normalization(self):
        weight = functions('fit.py', {'weights'})['weights']
        mu = np.array([1., 3.])
        q = np.array([[0., 6.], [0., 0.]])
        np.testing.assert_allclose(weight(mu, q, 'matchup'), [.25, .75])
        np.testing.assert_allclose(weight(mu, q, 'balanced_regret'), [.75 / 1.375, .625 / 1.375])
        # Fit normalization stays inside the reviewed train() before any head fit.
        train = next(n for n in ast.parse((ROOT / 'src/fit.py').read_text()).body
                     if isinstance(n, ast.FunctionDef) and n.name == 'train')
        self.assertIsInstance(train.body[0], ast.Assert)
        self.assertEqual(ast.unparse(train.body[1]), 'w = w / w.mean()')

    def test_memory_samples_use_kibibytes_and_refuse_invalid_values(self):
        memory = functions('score.py', {'memory_bytes'})['memory_bytes']
        self.assertEqual(memory(1_000_000), 1_024_000_000)
        self.assertGreater(memory(1_250_000), 1.25e9)
        for value in [0, -1, True, None, float('nan')]:
            with self.assertRaises(ValueError):
                memory(value)

    def test_budget_counts_legacy_context_and_repair_without_reset(self):
        budget = functions('launch.py', {'budgets'})['budgets']
        events = []
        for prefix in ['F5D3-', 'F5CTX-', 'F5REPAIR-']:
            events += [dict(event='launch', out=prefix + 'TEST', solver_runs_max=2,
                            at='2026-11-17T00:00:00Z'),
                       dict(event='exit', out=prefix + 'TEST', rc=0,
                            at='2026-11-17T01:00:00Z')]
        result = budget(events)
        self.assertEqual(result['runs'], 6)
        self.assertEqual(result['hours'], 3)
        self.assertEqual(result['d3_hours'], 3)
        self.assertEqual(result['repair_runs'], 2)
        self.assertEqual(result['repair_hours'], 1)
        self.assertTrue(budget(events[:-1])['open_operations'])
        with self.assertRaises(AssertionError):
            budget(events + [events[-1]])

    def test_relative_improvement_does_not_imply_absolute_qualification(self):
        compare = functions('score.py', {'compare'})['compare']
        rows = [dict(family=f, baseline=10., candidate=8.)
                for f in ['PAIR', 'MONO', 'UNP2T', 'UNPR']]
        result = compare(rows)
        self.assertTrue(result['improved'])
        self.assertFalse(result['absolute_pass'])
        worse = copy.deepcopy(rows)
        worse[0]['candidate'] = 10.6
        self.assertFalse(compare(worse)['improved'])
        boundary = [dict(family='PAIR', baseline=4., candidate=3.)]
        self.assertTrue(compare(boundary)['absolute_pass'])
        boundary[0]['candidate'] = 3.000001
        self.assertFalse(compare(boundary)['absolute_pass'])

    def test_storage_adjusted_endpoint_and_nonfinite_refusal(self):
        endpoint = functions('score.py', {'endpoint'})['endpoint']
        self.assertAlmostEqual(endpoint(SimpleNamespace(value=6., bound_pct=.5), 600), 1.5)
        with self.assertRaises(AssertionError):
            endpoint(SimpleNamespace(value=math.inf, bound_pct=0.), 600)
        with self.assertRaises(AssertionError):
            endpoint(SimpleNamespace(value=0., bound_pct=-.1), 600)


if __name__ == '__main__':
    unittest.main()
