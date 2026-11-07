#!/usr/bin/env python3
"""Finite public215 builds, heldout physics, bounded preparation and seal for ANY dataset.

Dataset-agnostic successor of qualify_r7_once.py (forward path) plus the
bounded per-cell preparation of prepare_then_seal_r7_once.py, which every
seal now requires. The dataset identity comes from a SHA-256-pinned
public215_dataset_profile_v1 file (see public215_profile.py); nothing about
R7 or R8 is hard-coded. Controller tooling only, outside the nine approved
pipeline files. One attempt; never retries, certifies or promotes.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, replace
import importlib
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import public215_profile as p  # noqa: E402
from public215_profile import Refusal, need  # noqa: E402

CONFIG = {'format', 'profile', 'pipeline_root', 'input_root', 'manifest', 'model_index',
          'snapshot', 'worker_completion', 'source_capture_checksum',
          'qualification_fingerprint', 'output'}
FORMAT = 'public215_qualify_prepare_seal_once_v1'
OUTPUT_PREFIX = 'public215-qualify-once-'


@dataclass(frozen=True)
class Identity:
    """Everything the finite phases compare receipts against."""
    dataset_id: str
    contexts: int
    m1_per_context: int
    m2_per_context: int
    model_index_sha256: str
    source_capture_checksum: str
    qualification_fingerprint: str

    @classmethod
    def from_profile(cls, profile, index, capture, fingerprint):
        need(p.sha(index) and p.sha(capture) and p.sha(fingerprint), 'STAGE_PINS_REQUIRED')
        return cls(profile.dataset_id, profile.contexts, profile.m1_per_context,
                   profile.m2_per_context, index, capture, fingerprint)


def validate_evidence(ident, completion_format, snapshot, completion, models):
    m1, m2 = ident.contexts * ident.m1_per_context, ident.contexts * ident.m2_per_context
    need(isinstance(snapshot, dict) and set(snapshot) == {'observed_at', 'dataset_id', 'state',
         'source_capture_checksum', 'selection_receipt_checksum', 'm1_nodes', 'm2_nodes',
         'headers_valid', 'selection_complete', 'contexts'}, 'EXACT_SNAPSHOT')
    p.fresh_snapshot(snapshot['observed_at'])
    need(snapshot['dataset_id'] == ident.dataset_id and snapshot['state'] == 'building' and
         snapshot['source_capture_checksum'] == ident.source_capture_checksum and
         p.sha(snapshot['selection_receipt_checksum']) and snapshot['headers_valid'] is True and
         snapshot['selection_complete'] is True and type(snapshot['m1_nodes']) is int and
         snapshot['m1_nodes'] == m1 and type(snapshot['m2_nodes']) is int and snapshot['m2_nodes'] == m2,
         'COMPLETE_INDEPENDENT_SOURCES_REQUIRED')
    base = {'format': completion_format, 'dataset_id': ident.dataset_id, 'machine_id': 'M2',
            'native_launcher_exit_code': 0, 'done': m2, 'written': m2, 'planned': m2, 'invalid': 0,
            'selection_receipt_checksum': snapshot['selection_receipt_checksum'],
            'source_capture_checksum': ident.source_capture_checksum}
    need(isinstance(completion, dict) and set(completion) == {*base, 'original_terminal', 'completed_heartbeat'}
         and all(completion[k] == v for k, v in base.items()) and
         all(type(completion[k]) is int for k in ('native_launcher_exit_code', 'done', 'written', 'planned', 'invalid')),
         'COMPLETED_M2_WORKER_REQUIRED')
    beat = completion['completed_heartbeat']
    need(isinstance(beat, dict) and set(beat) == {'run_id', 'sequence', 'received_at', 'state'} and
         isinstance(beat['run_id'], str) and re.fullmatch(p.UUID, beat['run_id']) is not None and
         type(beat['sequence']) is int and beat['sequence'] > 0 and beat['state'] == 'completed',
         'AUTHENTICATED_COMPLETED_HEARTBEAT_REQUIRED')
    need(p.timestamp(beat['received_at']) <= p.timestamp(snapshot['observed_at']),
         'COMPLETION_BEFORE_SNAPSHOT_REQUIRED')
    need(len(models) == ident.contexts and isinstance(snapshot['contexts'], list) and
         len(snapshot['contexts']) == ident.contexts, 'FULL_CENSUS_REQUIRED')
    observed = {}
    for row in snapshot['contexts']:
        need(isinstance(row, dict) and set(row) == {'context', 'cell_key_checksum', 'm1_nodes',
             'm2_nodes', 'headers_valid', *p.FIELDS}, 'EXACT_CONTEXT_EVIDENCE')
        key = p.canonical(row['context'])
        need(key in models and key not in observed and p.sha(row['cell_key_checksum']) and
             all(row[f] == models[key][f] for f in p.FIELDS) and row['headers_valid'] is True and
             type(row['m1_nodes']) is int and row['m1_nodes'] == ident.m1_per_context and
             type(row['m2_nodes']) is int and row['m2_nodes'] == ident.m2_per_context,
             'COMPLETE_CONTEXT_BINDINGS_REQUIRED')
        observed[key] = row
    need(set(observed) == set(models), 'COMPLETE_CONTEXT_CENSUS')
    return [{'entry': models[k], 'cell_key_checksum': observed[k]['cell_key_checksum']} for k in sorted(models)]


def admit(config):
    need(isinstance(config, dict) and set(config) == CONFIG and config['format'] == FORMAT, 'EXACT_CONFIG')
    profile = p.load_profile(config['profile'])
    ident = Identity.from_profile(profile, config['model_index'].get('sha256') if isinstance(config['model_index'], dict) else None,
                                  config['source_capture_checksum'], config['qualification_fingerprint'])
    root = Path(config['pipeline_root']); task = root.parent
    need(root.is_absolute() and root.resolve(strict=True) == root and root.name == 'pipeline' and
         task.name == profile.task_folder and Path(config['input_root']) == task / 'inputs' and
         Path(config['manifest']['path']) == profile.path(task, profile.manifest_relative) and
         Path(config['model_index']['path']) == profile.path(task, profile.model_index_relative),
         'PROFILE_TASK_LAYOUT_REQUIRED')
    raw = p.strict_json(p.pinned(config['manifest'], profile.manifest_sha256, 16 * 1024 * 1024))
    names = p.verify_pipeline(root, raw, profile)
    directory = root / 'scripts' / 'horse-solver-v31'; sys.path.insert(0, str(directory)); modules = {}
    for name in ('contract', 'gateway', 'public_hist215', 'compactor'):
        module = importlib.import_module(name)
        need(Path(module.__file__).resolve() == directory / (name + '.py'), 'PINNED_IMPORT_ORIGIN')
        modules[name] = module
    contract, codec = modules['contract'], modules['public_hist215']
    need(names == set(contract.PUBLIC215_PIPELINE_FILES), 'EXACT_NINE')
    manifest = contract.load_manifest(config['manifest']['path'], expected_checksum=profile.manifest_sha256,
                                      input_root=config['input_root'], pipeline_root=root)
    p.pinned(config['model_index'])
    models = codec.load_model_build_index(config['model_index']['path'], expected_checksum=ident.model_index_sha256,
                                          dataset_id=ident.dataset_id,
                                          manifest={**manifest.raw, '_actual_manifest_checksum': manifest.checksum})
    snapshot = p.strict_json(p.pinned(config['snapshot'], limit=512 * 1024))
    completion = p.strict_json(p.pinned(config['worker_completion'], limit=16 * 1024), bom=True)
    plan = validate_evidence(ident, profile.m2_completion_format, snapshot, completion, models)
    terminal_pin = completion['original_terminal']
    need(isinstance(terminal_pin, dict) and
         terminal_pin.get('path') == str(profile.path(task, profile.m2_terminal_relative)),
         'ORIGINAL_NATIVE_TERMINAL_PATH_REQUIRED')
    terminal = p.strict_json(p.pinned(terminal_pin, limit=16 * 1024), bom=True)
    need(isinstance(terminal, dict) and terminal.get('contract') == profile.m2_terminal_contract and
         terminal.get('dataset_id') == ident.dataset_id and terminal.get('manifest_checksum') == profile.manifest_sha256 and
         type(terminal.get('launcher_exit_code')) is int and terminal['launcher_exit_code'] == 0 and
         terminal.get('source_completeness_verified') is False and terminal.get('certified') is False,
         'ORIGINAL_NATIVE_LAUNCHER_ZERO_REQUIRED')
    output = Path(config['output'])
    need(output.parent == task and output.name.startswith(OUTPUT_PREFIX) and not output.exists(),
         'NEW_OFFICIAL_OUTPUT_REQUIRED')
    client = replace(modules['gateway'].GatewayClient.from_environment('COMPACTOR', manifest.provenance), attempts=1)
    verify_authority(ident, client, codec, manifest.raw, models, snapshot)
    return ident, client, modules['compactor'], plan, snapshot


def verify_authority(ident, client, codec, manifest, models, snapshot):
    need(client.attempts == 1 and len(models) == ident.contexts, 'COMPLETE_SINGLE_ATTEMPT_AUTHORITY_REQUIRED')
    p.fresh_snapshot(snapshot['observed_at'])
    authority = client.call('model_freeze_authority', {'dataset_id': ident.dataset_id}, timeout_seconds=280)
    codec.verify_model_freeze_authority(authority, manifest=manifest, dataset_id=ident.dataset_id, model_builds=models)
    p.fresh_snapshot(snapshot['observed_at'])


def heldout_receipt(ident, value, item, offset, selection, boards):
    keys = {'format', 'dataset_id', 'context', 'cell_key_checksum', 'model_checksum', 'template_checksum',
            'model_build_receipt_checksum', 'board', 'board_offset', 'selection_receipt_checksum',
            'capture_receipt_checksum', 'node_checksum', 'artifact_checksum', 'audit_key'}
    e = item['entry']; need(isinstance(value, dict) and set(value) == keys, 'HELDOUT_RECEIPT_DIFFERS')
    need(value['format'] == 'public215_heldout_physics_v1' and value['dataset_id'] == ident.dataset_id and
         value['context'] == e['context'] and value['cell_key_checksum'] == item['cell_key_checksum'] and
         all(value[f] == e[f] for f in ('model_checksum', 'template_checksum', 'model_build_receipt_checksum')) and
         type(value['board_offset']) is int and value['board_offset'] == offset and
         value['selection_receipt_checksum'] == selection and
         value['capture_receipt_checksum'] == ident.source_capture_checksum, 'HELDOUT_RECEIPT_DIFFERS')
    need(all(p.sha(value[k]) for k in keys - {'format', 'dataset_id', 'context', 'board', 'board_offset'}),
         'HELDOUT_RECEIPT_DIFFERS')
    board = value['board']; cards = p.STREET_CARDS.get(e['context'].get('street'))
    need(cards is not None and isinstance(board, str) and len(board) == cards * 2 and
         re.fullmatch(r'(?:[2-9TJQKA][cdhs]){3,5}', board) is not None and
         len({board[i:i + 2] for i in range(0, len(board), 2)}) == cards and board not in boards,
         'HELDOUT_RECEIPT_DIFFERS')
    boards.add(board); return value


def prepared_receipt(ident, value, item, ordinal):
    keys = {'format', 'dataset_id', 'preparation_offset', 'cell_key_checksum', *p.FIELDS,
            'receipt_checksum', 'qualification_fingerprint', 'status'}
    need(isinstance(value, dict) and set(value) == keys, 'EXACT_PRESEAL_RECEIPT')
    need(value['format'] == 'public215_preseal_cell_v1' and value['dataset_id'] == ident.dataset_id and
         type(value['preparation_offset']) is int and value['preparation_offset'] == ordinal and
         value['cell_key_checksum'] == item['cell_key_checksum'] and
         all(value[k] == item['entry'][k] for k in p.FIELDS) and value['status'] == 'prepared' and
         value['qualification_fingerprint'] == ident.qualification_fingerprint and
         p.sha(value['receipt_checksum']), 'PRESEAL_RECEIPT_BINDINGS')
    return value


def run_once(ident, client, compactor, plan, snapshot, output, config_sha):
    n, k = ident.contexts, ident.m2_per_context
    keys = [p.canonical(x['entry']['context']) for x in plan]
    need(client.attempts == 1 and len(plan) == n and keys == sorted(set(keys)), 'FULL_SINGLE_ATTEMPT_PLAN')
    p.fresh_snapshot(snapshot['observed_at'])
    directory = Path(output)
    need(directory.is_absolute() and directory.parent.resolve(strict=True) == directory.parent and
         not directory.exists(), 'NEW_EXCLUSIVE_OPERATION')
    directory.mkdir()
    p.write_new(directory, 'claim.json', {'format': 'public215_qualify_prepare_seal_claim_v1',
                'dataset_id': ident.dataset_id, 'config_sha256': config_sha,
                'index_sha256': ident.model_index_sha256, 'attempts': 1, 'builds': n,
                'heldout_physics': n * k, 'preparations': n,
                'qualification_fingerprint': ident.qualification_fingerprint, 'certified': False})
    current = 'admission'; done = {'builds': 0, 'physics': 0, 'preparations': 0}; receipts = []

    def phase(name, operation, payload, validator):
        nonlocal current
        current = name
        p.write_new(directory, name + '.started.json', {'operation': operation, 'dataset_id': ident.dataset_id,
                    'request_body_sha256': p.digest(client._body(operation, payload))})
        receipt = client.call(operation, payload, timeout_seconds=280); validator(receipt)
        p.write_new(directory, name + '.terminal.json', {'status': 'acknowledged_exact_receipt', 'receipt': receipt})
        return receipt
    try:
        for ordinal, item in enumerate(plan):
            def valid_build(v, item=item):
                need(compactor.build_cell_receipt_is_valid(v) and v['cell_key_checksum'] == item['cell_key_checksum'],
                     'BUILD_RECEIPT_DIFFERS')
            phase(f'{ordinal:03d}.build', 'build_cell', {'dataset_id': ident.dataset_id, 'context': item['entry']}, valid_build)
            done['builds'] += 1
        for ordinal, item in enumerate(plan):
            entry = item['entry']; boards = set()
            envelope = {x: entry[x] for x in ('context', 'model_checksum', 'public_model_build_receipt', 'model_build_receipt_checksum')}
            for offset in range(k):
                phase(f'{ordinal:03d}.heldout-{offset:02d}', 'freeze_model',
                      {'dataset_id': ident.dataset_id, 'context': envelope, 'preparation_offset': ordinal,
                       'heldout_board_offset': offset},
                      lambda v, item=item, offset=offset, boards=boards: heldout_receipt(
                          ident, v, item, offset, snapshot['selection_receipt_checksum'], boards))
                done['physics'] += 1
        for ordinal, item in enumerate(plan):
            payload = {'dataset_id': ident.dataset_id, 'phase': 'prepare_cell', 'preparation_offset': ordinal,
                       'cell_key_checksum': item['cell_key_checksum'], **{x: item['entry'][x] for x in p.FIELDS}}
            receipts.append(phase(f'{ordinal:03d}.prepare', 'seal_dataset', payload,
                                  lambda v, item=item, ordinal=ordinal: prepared_receipt(ident, v, item, ordinal)))
            done['preparations'] += 1
        sealed = phase('seal', 'seal_dataset', {'dataset_id': ident.dataset_id},
                       lambda v: need(compactor.seal_receipt_is_valid(v), 'SEAL_RECEIPT_DIFFERS'))

        def valid_status(v):
            row = compactor.dataset_item(v, ident.dataset_id, n)
            need(row['state'] == 'evaluating' and row['dataset_checksum'] == sealed['dataset_checksum'], 'SEALED_STATUS_DIFFERS')
        phase('status', 'certification_status', {'dataset_id': ident.dataset_id}, valid_status)
    except BaseException as error:
        failure = {'status': 'unknown_stop', 'phase': current,
                   'failure_classification': 'receipt_mismatch' if isinstance(error, Refusal) else
                   'gateway_http' if p.safe_failure(error)['http_status'] is not None else 'transport_or_unclassified',
                   'completed_builds': done['builds'], 'completed_physics': done['physics'],
                   'completed_preparations': done['preparations'], 'certified': False, **p.safe_failure(error)}
        if not (directory / (current + '.terminal.json')).exists():
            p.write_new(directory, current + '.terminal.json', failure)
        p.write_new(directory, 'terminal.json', failure)
        raise Refusal('OUTCOME_UNKNOWN_NO_RETRY') from None
    terminal = {'status': 'sealed_evaluating_requires_independent_readback', 'dataset_checksum': sealed['dataset_checksum'],
                'completed_builds': n, 'completed_physics': n * k, 'completed_preparations': n,
                'preparation_receipts_sha256': p.digest(p.canonical(receipts)), 'certified': False}
    p.write_new(directory, 'terminal.json', terminal); return terminal


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True); parser.add_argument('--config-sha256', required=True)
    args = parser.parse_args()
    try:
        config = p.strict_json(p.pinned({'path': args.config, 'sha256': args.config_sha256}, limit=64 * 1024))
        ident, client, compactor, plan, snapshot = admit(config)
        run_once(ident, client, compactor, plan, snapshot, config['output'], args.config_sha256); return 0
    except BaseException:
        print('public215 qualification stopped; inspect durable outcome; no automatic retry', file=sys.stderr); return 1


if __name__ == '__main__':
    raise SystemExit(main())
