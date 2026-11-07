"""Dataset-agnostic public215 controllers: profile, qualify/prepare/seal, freeze, seed.

Synthetic receipts only; no gateway, database, solver, seed or credential.
The R7 equivalence tests drive the unchanged qualify_r7_once.py and the
generic controller with the same fixture and compare every gateway call.
"""
import copy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


import public215_profile as p  # noqa: E402
import qualify_public215_once as g  # noqa: E402
import freeze_public215_once as f  # noqa: E402
import qualify_r7_once as r7  # noqa: E402
import compactor  # noqa: E402
from contract import PUBLIC215_PIPELINE_FILES, REQUIRED_PIPELINE_FILES  # noqa: E402
from gateway import GatewayError  # noqa: E402

R8 = {**p.R7_PROFILE, 'dataset_key': 'horse-v31-public215-cash-20261108-r8-r1',
      'dataset_id': '8e8e8e8e-1234-4234-8234-123456789abc', 'manifest_sha256': '1' * 64,
      'input_bundle_checksum': '2' * 64, 'pipeline_commit': '3' * 40, 'contexts': 3, 'm1_per_context': 57,
      'm2_per_context': 2, 'task_folder': 'mac-v31-public215-r8-20261108-01gw7a',
      'manifest_relative': 'inputs/manifests/public215-r8-r1.json',
      'm2_terminal_contract': 'smarter-poker.r8-M2-capture-terminal.v1',
      'm2_completion_format': 'public215_r8_m2_completion_readback_v1'}
BOARDS = ['AcKd2h', 'AcKd3h', 'AcKd4h', 'AcKd5h', 'AcKd6h', 'AcKd7h', 'AcKd8h', 'AcKd9h']
H = lambda text: hashlib.sha256(text.encode()).hexdigest()


class ProfileTests(unittest.TestCase):
    def test_r7_profile_is_the_identity_r7_controllers_hard_code(self):
        profile = p.profile_from(p.R7_PROFILE)
        self.assertEqual((profile.dataset_id, profile.manifest_sha256, profile.pipeline_commit),
                         (r7.DATASET, r7.MANIFEST, r7.PRODUCER))
        self.assertEqual((profile.contexts, profile.m1_targets, profile.m2_targets), (107, 6099, 856))
        self.assertEqual(r7.FIELDS, p.FIELDS)

    def test_profile_is_exact_and_refuses_unsafe_values(self):
        self.assertEqual(p.profile_from(R8).m2_targets, 6)
        for key, value in [('extra', 1), ('dataset_id', 'not-a-uuid'), ('manifest_sha256', '0' * 64),
                           ('pipeline_commit', 'A' * 40), ('contexts', 0), ('contexts', True),
                           ('model_index_relative', '../index.json'), ('model_index_relative', '/abs.json'),
                           ('manifest_relative', 'manifests/x.json'), ('task_folder', '..'),
                           ('m2_terminal_relative', 'a\\b.json'), ('format', 'public215_dataset_profile_v0')]:
            with self.subTest(key=key, value=value), self.assertRaises(p.Refusal):
                p.profile_from({**R8, key: value})
        broken = dict(R8); del broken['m2_completion_format']
        with self.assertRaises(p.Refusal):
            p.profile_from(broken)

    def test_profile_file_is_sha256_pinned(self):
        with tempfile.TemporaryDirectory(dir=HERE) as folder:
            path = Path(folder).resolve() / 'profile.json'; raw = json.dumps(R8).encode(); path.write_bytes(raw)
            self.assertEqual(p.load_profile({'path': str(path), 'sha256': hashlib.sha256(raw).hexdigest()}).contexts, 3)
            with self.assertRaises(p.Refusal):
                p.load_profile({'path': str(path), 'sha256': 'f' * 64})

    def test_controller_tooling_stays_outside_the_nine_pipeline_files(self):
        for name in ('public215_profile.py', 'qualify_public215_once.py', 'freeze_public215_once.py',
                     'create_public215_seed_once.ps1', 'test_public215_controllers.py'):
            self.assertNotIn('scripts/horse-solver-v31/' + name, PUBLIC215_PIPELINE_FILES)
            self.assertNotIn('scripts/horse-solver-v31/' + name, REQUIRED_PIPELINE_FILES)
        self.assertEqual(len(PUBLIC215_PIPELINE_FILES), 9)


def qualify_fixture(dataset_id, contexts, m2, capture, fingerprint='a' * 64, fail=None, bad=False):
    plan = []
    for i in range(contexts):
        e = {'context': {'street': 'flop', 'fixture': f'{i:03d}'}, 'public_model_build_receipt': {}}
        e.update({k: H(k + str(i)) for k in p.FIELDS})
        plan.append({'entry': e, 'cell_key_checksum': H('cell' + str(i))})
    snapshot = {'observed_at': datetime.now(timezone.utc).isoformat(), 'selection_receipt_checksum': 'a' * 64}

    class Client:
        attempts = 1

        def __init__(self):
            self.calls = []

        def _body(self, operation, payload):
            return p.canonical({'operation': operation, 'payload': payload})

        def call(self, op, payload, **kwargs):
            self.calls.append((op, copy.deepcopy(payload)))
            if fail == len(self.calls):
                raise GatewayError('SECRET https://secret.invalid', status=504)
            if op == 'build_cell':
                return {'cell_key_checksum': plan[len(self.calls) - 1]['cell_key_checksum']}
            if op == 'freeze_model':
                item = plan[payload['preparation_offset']]; e = item['entry']; offset = payload['heldout_board_offset']
                r = {'format': 'public215_heldout_physics_v1', 'dataset_id': dataset_id, 'context': e['context'],
                     'cell_key_checksum': item['cell_key_checksum'],
                     **{k: e[k] for k in ('model_checksum', 'template_checksum', 'model_build_receipt_checksum')},
                     'board': BOARDS[offset], 'board_offset': offset, 'selection_receipt_checksum': 'a' * 64,
                     'capture_receipt_checksum': capture, 'node_checksum': 'b' * 64, 'artifact_checksum': 'c' * 64,
                     'audit_key': 'd' * 64}
                if bad:
                    r['extra'] = 'rejected'
                return r
            if op == 'seal_dataset' and 'phase' in payload:
                i = payload['preparation_offset']; item = plan[i]
                return {'format': 'public215_preseal_cell_v1', 'dataset_id': dataset_id, 'preparation_offset': i,
                        'cell_key_checksum': item['cell_key_checksum'], **{k: item['entry'][k] for k in p.FIELDS},
                        'receipt_checksum': H('receipt' + str(i)), 'qualification_fingerprint': fingerprint,
                        'status': 'prepared'}
            if op == 'seal_dataset':
                return {'dataset_checksum': 'e' * 64, 'idempotent': False}
            return {'datasets': [{'dataset_id': dataset_id, 'state': 'evaluating', 'dataset_checksum': 'e' * 64,
                                  'ingested_source_artifacts': 1, 'source_receipt_rows': 1, 'runtime_cells': contexts}]}
    return plan, snapshot, Client()


class QualifyTests(unittest.TestCase):
    def identity(self, profile, capture='9' * 64):
        return g.Identity.from_profile(p.profile_from(profile), '8' * 64, capture, 'a' * 64)

    def test_r7_profile_repeats_every_r7_gateway_call_then_prepares_before_seal(self):
        plan, snapshot, reference = qualify_fixture(r7.DATASET, 107, 8, r7.CAPTURE)
        _, _, generic = qualify_fixture(r7.DATASET, 107, 8, r7.CAPTURE)
        with tempfile.TemporaryDirectory(dir=HERE) as tmp:
            r7.run_once(reference, compactor, plan, snapshot, Path(tmp) / 'r7', 'f' * 64)
            result = g.run_once(self.identity(p.R7_PROFILE, r7.CAPTURE), generic, compactor, plan, snapshot,
                                Path(tmp) / 'generic', 'f' * 64)
        self.assertEqual(generic.calls[:963], reference.calls[:963])
        self.assertEqual([op for op, _ in generic.calls[963:1070]], ['seal_dataset'] * 107)
        self.assertEqual([x['preparation_offset'] for _, x in generic.calls[963:1070]], list(range(107)))
        self.assertTrue(all(x['phase'] == 'prepare_cell' for _, x in generic.calls[963:1070]))
        self.assertEqual(generic.calls[1070:], reference.calls[963:])
        self.assertEqual((result['completed_physics'], result['completed_preparations'], result['certified']), (856, 107, False))

    def test_census_comes_from_the_profile(self):
        plan, snapshot, client = qualify_fixture(R8['dataset_id'], 3, 2, '9' * 64)
        with tempfile.TemporaryDirectory(dir=HERE) as tmp:
            out = Path(tmp) / 'once'
            g.run_once(self.identity(R8), client, compactor, plan, snapshot, out, 'f' * 64)
            claim = json.loads((out / 'claim.json').read_text())
        self.assertEqual([op for op, _ in client.calls], ['build_cell'] * 3 + ['freeze_model'] * 6 + ['seal_dataset'] * 4 + ['certification_status'])
        self.assertEqual([(x['preparation_offset'], x['heldout_board_offset']) for _, x in client.calls[3:9]], [(i, j) for i in range(3) for j in range(2)])
        self.assertEqual((claim['builds'], claim['heldout_physics'], claim['preparations'], claim['dataset_id']), (3, 6, 3, R8['dataset_id']))
        with tempfile.TemporaryDirectory(dir=HERE) as tmp, self.assertRaises(p.Refusal):
            g.run_once(self.identity(R8), client, compactor, plan[:2], snapshot, Path(tmp) / 'short', 'f' * 64)

    def test_unknown_outcome_stops_once_without_secrets_or_retry(self):
        plan, snapshot, client = qualify_fixture(R8['dataset_id'], 3, 2, '9' * 64, fail=4)
        with tempfile.TemporaryDirectory(dir=HERE) as tmp:
            out = Path(tmp) / 'once'
            with self.assertRaisesRegex(p.Refusal, 'OUTCOME_UNKNOWN_NO_RETRY'):
                g.run_once(self.identity(R8), client, compactor, plan, snapshot, out, 'f' * 64)
            text = (out / 'terminal.json').read_text(); terminal = json.loads(text)
            self.assertNotIn('SECRET', text); self.assertNotIn('secret.invalid', text)
            self.assertEqual((terminal['http_status'], terminal['phase'], terminal['completed_builds'], terminal['completed_physics']),
                             (504, '000.heldout-00', 3, 0))
            with self.assertRaises(p.Refusal):
                g.run_once(self.identity(R8), client, compactor, plan, snapshot, out, 'f' * 64)
        self.assertEqual(len(client.calls), 4)

    def test_wrong_receipts_refuse_before_the_next_phase(self):
        plan, snapshot, client = qualify_fixture(R8['dataset_id'], 3, 2, '9' * 64, bad=True)
        with tempfile.TemporaryDirectory(dir=HERE) as tmp, self.assertRaises(p.Refusal):
            g.run_once(self.identity(R8), client, compactor, plan, snapshot, Path(tmp) / 'once', 'f' * 64)
        self.assertEqual(len(client.calls), 4)
        ident = self.identity(R8)
        plan, snapshot, client = qualify_fixture(R8['dataset_id'], 3, 2, '9' * 64, fingerprint='b' * 64)
        with tempfile.TemporaryDirectory(dir=HERE) as tmp, self.assertRaises(p.Refusal):
            g.run_once(ident, client, compactor, plan, snapshot, Path(tmp) / 'once', 'f' * 64)
        self.assertEqual(client.calls[-1][1].get('phase'), 'prepare_cell')
        _, _, wrong_capture = qualify_fixture(R8['dataset_id'], 3, 2, r7.CAPTURE)
        with tempfile.TemporaryDirectory(dir=HERE) as tmp, self.assertRaises(p.Refusal):
            g.run_once(ident, wrong_capture, compactor, plan, snapshot, Path(tmp) / 'once', 'f' * 64)

    def test_evidence_census_and_identity_come_from_the_profile(self):
        ident = self.identity(R8); plan, snapshot, _ = qualify_fixture(R8['dataset_id'], 3, 2, '9' * 64)
        models = {p.canonical(x['entry']['context']): x['entry'] for x in plan}
        evidence = {**snapshot, 'dataset_id': R8['dataset_id'], 'state': 'building', 'source_capture_checksum': '9' * 64,
                    'm1_nodes': 171, 'm2_nodes': 6, 'headers_valid': True, 'selection_complete': True,
                    'contexts': [{'context': x['entry']['context'], 'cell_key_checksum': x['cell_key_checksum'],
                                  **{k: x['entry'][k] for k in p.FIELDS}, 'm1_nodes': 57, 'm2_nodes': 2,
                                  'headers_valid': True} for x in plan]}
        completion = {'format': R8['m2_completion_format'], 'original_terminal': {'path': 'fixture', 'sha256': 'f' * 64},
                      'completed_heartbeat': {'run_id': '11111111-1111-1111-1111-111111111111', 'sequence': 4,
                                              'received_at': snapshot['observed_at'], 'state': 'completed'},
                      'dataset_id': R8['dataset_id'], 'machine_id': 'M2', 'native_launcher_exit_code': 0, 'done': 6,
                      'written': 6, 'planned': 6, 'invalid': 0, 'selection_receipt_checksum': 'a' * 64,
                      'source_capture_checksum': '9' * 64}
        self.assertEqual(len(g.validate_evidence(ident, R8['m2_completion_format'], evidence, completion, models)), 3)
        for key, value in [('dataset_id', r7.DATASET), ('m2_nodes', 856), ('m1_nodes', 6099), ('source_capture_checksum', r7.CAPTURE)]:
            with self.subTest(key=key), self.assertRaises(p.Refusal):
                g.validate_evidence(ident, R8['m2_completion_format'], {**evidence, key: value}, completion, models)
        with self.assertRaises(p.Refusal):
            g.validate_evidence(ident, p.R7_PROFILE['m2_completion_format'], evidence, completion, models)

    def test_admission_refuses_another_dataset_layout_before_any_io(self):
        config = {k: None for k in g.CONFIG}
        with self.assertRaises(p.Refusal):
            g.admit({**config, 'format': 'public215_r7_qualify_once_v1'})
        with self.assertRaises(p.Refusal):
            g.Identity.from_profile(p.profile_from(R8), '0' * 64, '9' * 64, 'a' * 64)


class FreezeTests(unittest.TestCase):
    def models(self, n=3):
        models = {}; protocol = {}; rows = []
        for i in range(n):
            context = {'street': 'flop', 'fixture': f'{i:03d}'}
            cases = [{'board': BOARDS[0], 'own': ['2c', '2d']}, {'board': BOARDS[1], 'own': ['3c', '3d']}]
            e = {'context': context, 'public_model_build_receipt': {'cases': [{**c, 'features_f64': []} for c in cases]},
                 **{k: H(k + str(i)) for k in p.FIELDS}}
            models[p.canonical(context)] = e; protocol[p.canonical(context)] = cases
            rows.append({'context': context, 'cell_key_checksum': H('cell' + str(i)),
                         **{k: e[k] for k in ('model_checksum', 'template_checksum', 'training_provenance_checksum')}})
        return models, protocol, {'dataset_id': R8['dataset_id'], 'index_sha256': '8' * 64, 'contexts': rows}

    def client(self, fail=None):
        class Client:
            attempts = 1

            def __init__(self):
                self.calls = []

            def call(self, op, payload, **kwargs):
                self.calls.append(payload)
                if fail == len(self.calls):
                    raise GatewayError('SECRET', status=504)
                e = payload['context']
                if 'physics_board' in payload:
                    return {'format': 'public215_prepared_physics_v1', 'dataset_id': R8['dataset_id'], 'context': e['context'],
                            'cell_key_checksum': H('cell' + str(int(e['context']['fixture']))), 'model_checksum': e['model_checksum'],
                            'template_checksum': H('template_checksum' + str(int(e['context']['fixture']))),
                            'board': payload['physics_board'], 'audit_key': 'd' * 64}
                return e['model_build_receipt_checksum']
        return Client()

    def test_two_physics_boards_then_freeze_for_every_profile_context(self):
        models, protocol, expected = self.models()
        plan = f.freeze_plan(R8['dataset_id'], 3, models, expected, '8' * 64, protocol)
        client = self.client(); profile = p.profile_from(R8)
        with tempfile.TemporaryDirectory(dir=HERE) as tmp:
            result = f.freeze_once(profile, client, plan, Path(tmp) / 'once', '8' * 64, '7' * 64)
        self.assertEqual(result['completed'], 3)
        self.assertEqual([(x.get('preparation_offset'), x.get('physics_board')) for x in client.calls],
                         [(0, BOARDS[0]), (0, BOARDS[1]), (None, None), (1, BOARDS[0]), (1, BOARDS[1]), (None, None),
                          (2, BOARDS[0]), (2, BOARDS[1]), (None, None)])
        self.assertTrue(all(x['dataset_id'] == R8['dataset_id'] for x in client.calls))

    def test_plan_census_map_and_unknown_stop(self):
        models, protocol, expected = self.models()
        for bad in [{**expected, 'dataset_id': r7.DATASET}, {**expected, 'index_sha256': '6' * 64},
                    {**expected, 'contexts': expected['contexts'][:2]}]:
            with self.assertRaises(p.Refusal):
                f.freeze_plan(R8['dataset_id'], 3, models, bad, '8' * 64, protocol)
        with self.assertRaises(p.Refusal):
            f.freeze_plan(R8['dataset_id'], 107, models, expected, '8' * 64, protocol)
        plan = f.freeze_plan(R8['dataset_id'], 3, models, expected, '8' * 64, protocol)
        client = self.client(fail=2)
        with tempfile.TemporaryDirectory(dir=HERE) as tmp:
            out = Path(tmp) / 'once'
            with self.assertRaisesRegex(p.Refusal, 'OUTCOME_UNKNOWN_NO_RETRY'):
                f.freeze_once(p.profile_from(R8), client, plan, out, '8' * 64, '7' * 64)
            text = (out / 'terminal.json').read_text()
            self.assertNotIn('SECRET', text); self.assertEqual(json.loads(text)['phase'], '000.physics-01')
        self.assertEqual(len(client.calls), 2)


class SeedScriptTests(unittest.TestCase):
    def test_seed_script_is_parameterized_and_keeps_every_r7_guard(self):
        source = (HERE / 'create_public215_seed_once.ps1').read_text()
        for required in ['[Parameter(Mandatory=$true)]', "ValidatePattern('^mac-v31-", "Join-Path 'C:\\sp-v31' $TaskFolder",
                         "Replacement folder exists; inspect outcome, never regenerate", '[IO.FileMode]::CreateNew',
                         'SetAccessRuleProtection($true,$false)', "'S-1-5-18','S-1-5-32-544'", 'seed_printed=$false',
                         'file_readback_performed=$false', '[Array]::Clear($bytes,0,$bytes.Length)',
                         '"public215_${CommitmentLabel}_seed_commitment_v1"',
                         '-TaskFolder mac-v31-r7-corrected-20261030-01a17e88 -CommitmentLabel corrected_r7',
                         "$ExpectedHost='SMARTERPOKER'", "$ExpectedAccount='smarterpoker\\danbe'"]:
            self.assertIn(required, source)
        for forbidden in ['Remove-Item', 'Write-Host $bytes', 'Get-Content', 'ReadAllBytes']:
            self.assertNotIn(forbidden, source)


if __name__ == '__main__':
    unittest.main()
