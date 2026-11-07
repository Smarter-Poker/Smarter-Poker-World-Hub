#!/usr/bin/env python3
"""Finite private model freezing for ANY public215 dataset. No builds, seal, promotion or retry.

Dataset-agnostic successor of R7's freeze-corrected-models-once.py and of the
freeze loop in continue_r7_freeze_once.py: for every context in canonical
order, freeze the two approved Linux physics boards, then the model. The
dataset identity comes from a SHA-256-pinned public215_dataset_profile_v1
file (public215_profile.py). Controller tooling only, outside the nine
approved pipeline files. A stop is an unknown outcome: read durable SQL.
"""
from __future__ import annotations

import argparse
from dataclasses import replace
import importlib
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import public215_profile as p  # noqa: E402
from public215_profile import Refusal, need  # noqa: E402

CONFIG = {'format', 'profile', 'pipeline_root', 'manifest', 'model_index', 'prepared_map', 'output'}
FORMAT = 'public215_freeze_once_v1'
OUTPUT_PREFIX = 'model-freeze-once-'
PHYSICS_BOARDS = 2  # prepare-public215-feature-request.py approves two runtime cases per context


def admit(config):
    need(isinstance(config, dict) and set(config) == CONFIG and config['format'] == FORMAT, 'EXACT_CONFIG')
    profile = p.load_profile(config['profile'])
    root = Path(config['pipeline_root']); task = root.parent
    need(root.is_absolute() and root.resolve(strict=True) == root and root.name == 'pipeline' and
         task.name == profile.task_folder and
         Path(config['manifest']['path']) == profile.path(task, profile.manifest_relative) and
         isinstance(config['model_index'], dict) and
         Path(config['model_index'].get('path', '')) == profile.path(task, profile.model_index_relative),
         'PROFILE_TASK_LAYOUT_REQUIRED')
    output = Path(config['output'])
    need(output.parent == task and output.name.startswith(OUTPUT_PREFIX) and not output.exists(),
         'NEW_OFFICIAL_OUTPUT_REQUIRED')
    raw = p.strict_json(p.pinned(config['manifest'], profile.manifest_sha256, 16 * 1024 * 1024))
    names = p.verify_pipeline(root, raw, profile)
    directory = root / 'scripts' / 'horse-solver-v31'; sys.path.insert(0, str(directory)); modules = {}
    for name in ('contract', 'gateway', 'public_hist215', 'compactor'):
        module = importlib.import_module(name)
        need(Path(module.__file__).resolve() == directory / (name + '.py'), 'PINNED_IMPORT_ORIGIN')
        modules[name] = module
    contract = modules['contract']
    need(names == set(contract.PUBLIC215_PIPELINE_FILES), 'EXACT_NINE_REQUIRED')
    manifest = contract.load_manifest(config['manifest']['path'], expected_checksum=profile.manifest_sha256,
                                      input_root=task / 'inputs', pipeline_root=root)
    index_sha = config['model_index']['sha256']; need(p.sha(index_sha), 'ACTUAL_INDEX_SHA_REQUIRED')
    p.pinned(config['model_index'])
    models = modules['public_hist215'].load_model_build_index(
        config['model_index']['path'], expected_checksum=index_sha, dataset_id=profile.dataset_id,
        manifest={**manifest.raw, '_actual_manifest_checksum': manifest.checksum}, prepare_only=False)
    keys = [p.canonical(ctx) for ctx in modules['compactor'].declared_coverage(manifest)]
    need(len(keys) == profile.contexts == len(models) and keys == sorted(set(keys)) and set(keys) == set(models),
         'EXACT_FULL_LINUX_CENSUS_REQUIRED')
    expected = p.strict_json(p.pinned(config['prepared_map'], limit=512 * 1024))
    protocol = {p.canonical(g['context']): g['cases']
                for g in manifest.raw['public215_protocols']['runtime_parity_protocol']['contexts']}
    plan = freeze_plan(profile.dataset_id, profile.contexts, models, expected, index_sha, protocol)
    client = replace(modules['gateway'].GatewayClient.from_environment('COMPACTOR', manifest.provenance), attempts=1)
    return profile, client, plan, index_sha, config['prepared_map']['sha256']


def freeze_plan(dataset_id, contexts, models, expected, index_sha, protocol):
    need(isinstance(expected, dict) and set(expected) == {'dataset_id', 'index_sha256', 'contexts'} and
         expected['dataset_id'] == dataset_id and expected['index_sha256'] == index_sha and
         isinstance(expected['contexts'], list) and len(expected['contexts']) == contexts == len(models) and
         set(protocol) == set(models), 'EXACT_PREPARED_MAP_REQUIRED')
    rows = {}
    for row in expected['contexts']:
        need(isinstance(row, dict) and set(row) == {'context', 'cell_key_checksum', 'model_checksum',
             'template_checksum', 'training_provenance_checksum'}, 'EXACT_PREPARED_ROW_REQUIRED')
        key = p.canonical(row['context'])
        need(key in models and key not in rows and p.sha(row['cell_key_checksum']) and
             all(row[k] == models[key][k] for k in ('model_checksum', 'template_checksum', 'training_provenance_checksum')),
             'PREPARED_BINDING_DIFFERS')
        rows[key] = row
    plan = []
    for offset, (key, entry) in enumerate(sorted(models.items())):
        cases = entry['public_model_build_receipt']['cases']; approved = protocol[key]
        need(isinstance(cases, list) and isinstance(approved, list) and len(cases) == len(approved), 'APPROVED_CASE_CENSUS')
        cards = p.STREET_CARDS.get(entry['context'].get('street')); boards = []
        for case, allowed in zip(cases, approved):
            need(isinstance(allowed, dict) and set(allowed) == {'board', 'own'} and
                 {k: case.get(k) for k in ('board', 'own')} == allowed, 'APPROVED_LINUX_CASE_REQUIRED')
            board = allowed['board']
            need(cards is not None and isinstance(board, str) and len(board) == cards * 2 and
                 re.fullmatch(r'(?:[2-9TJQKA][cdhs]){3,5}', board) is not None and
                 len({board[i:i + 2] for i in range(0, len(board), 2)}) == cards,
                 'APPROVED_CHRONOLOGICAL_BOARD_REQUIRED')
            if board not in boards:
                boards.append(board)
        need(len(boards) == PHYSICS_BOARDS, 'EXACT_TWO_APPROVED_PHYSICS_BOARDS')
        plan.append({'entry': entry, 'cell_key_checksum': rows[key]['cell_key_checksum'], 'boards': boards,
                     'preparation_offset': offset})
    return plan


def physics_receipt(dataset_id, value, item, board):
    e = item['entry']
    need(isinstance(value, dict) and set(value) == {'format', 'dataset_id', 'context', 'cell_key_checksum',
         'model_checksum', 'template_checksum', 'board', 'audit_key'} and
         value['format'] == 'public215_prepared_physics_v1' and value['dataset_id'] == dataset_id and
         value['context'] == e['context'] and value['cell_key_checksum'] == item['cell_key_checksum'] and
         value['model_checksum'] == e['model_checksum'] and value['template_checksum'] == e['template_checksum'] and
         value['board'] == board and p.sha(value['audit_key']), 'PHYSICS_RECEIPT_DIFFERS')


def freeze_once(profile, client, plan, output, index_sha, map_sha):
    n = profile.contexts
    need(client.attempts == 1 and len(plan) == n and [x['preparation_offset'] for x in plan] == list(range(n)) and
         p.sha(index_sha) and p.sha(map_sha), 'FINITE_SINGLE_ATTEMPT_REQUIRED')
    keys = [p.canonical(x['entry']['context']) for x in plan]
    need(keys == sorted(set(keys)) and all(len(x['boards']) == PHYSICS_BOARDS and len(set(x['boards'])) == PHYSICS_BOARDS
                                           for x in plan), 'ADMITTED_CANONICAL_PLAN_REQUIRED')
    directory = Path(output)
    need(directory.is_absolute() and directory.parent.resolve(strict=True) == directory.parent and
         not directory.exists(), 'NEW_EXCLUSIVE_OPERATION_REQUIRED')
    directory.mkdir()
    p.write_new(directory, 'claim.json', {'format': 'public215_freeze_once_claim_v1', 'dataset_id': profile.dataset_id,
                'dataset_key': profile.dataset_key, 'manifest_checksum': profile.manifest_sha256,
                'index_sha256': index_sha, 'prepared_map_sha256': map_sha, 'attempts': 1, 'contexts': n,
                'physics_boards': n * PHYSICS_BOARDS})
    completed = 0; phase = 'admission'
    for ordinal, item in enumerate(plan):
        e = item['entry']
        base = {'dataset_id': profile.dataset_id, 'ordinal': ordinal, 'context': e['context'],
                **{k: e[k] for k in p.FIELDS}, 'cell_key_checksum': item['cell_key_checksum']}
        envelope = {k: e[k] for k in ('context', 'model_checksum', 'public_model_build_receipt', 'model_build_receipt_checksum')}
        try:
            for board_offset, board in enumerate(item['boards']):
                phase = f'{ordinal:03d}.physics-{board_offset:02d}'
                p.write_new(directory, phase + '.started.json', {**base, 'board': board})
                response = client.call('freeze_model', {'dataset_id': profile.dataset_id, 'context': envelope,
                                       'physics_board': board, 'preparation_offset': ordinal}, timeout_seconds=280)
                physics_receipt(profile.dataset_id, response, item, board)
                p.write_new(directory, phase + '.terminal.json', {**base, 'status': 'acknowledged_exact_approved_physics_receipt',
                            'receipt': response})
            phase = f'{ordinal:03d}.freeze'; p.write_new(directory, phase + '.started.json', base)
            receipt = client.call('freeze_model', {'dataset_id': profile.dataset_id, 'context': envelope}, timeout_seconds=280)
            need(receipt == e['model_build_receipt_checksum'], 'FREEZE_RECEIPT_DIFFERS')
            p.write_new(directory, phase + '.terminal.json', {**base, 'status': 'acknowledged_exact_freeze_receipt'})
        except BaseException as error:
            facts = p.safe_failure(error)
            failure = {**base, 'status': 'unknown_stop', 'phase': phase, 'http_status': facts['http_status'],
                       'failure_classification': 'receipt_mismatch' if isinstance(error, Refusal) else
                       'gateway_http' if facts['http_status'] is not None else 'transport_or_unclassified',
                       'completed': completed}
            if not (directory / (phase + '.terminal.json')).exists():
                p.write_new(directory, phase + '.terminal.json', failure)
            p.write_new(directory, 'terminal.json', failure)
            raise Refusal('OUTCOME_UNKNOWN_NO_RETRY') from None
        completed += 1
    terminal = {'status': 'freeze_acknowledgments_require_independent_sql_and_signed_authority',
                'dataset_id': profile.dataset_id, 'completed': n, 'sealed': False, 'certified': False}
    p.write_new(directory, 'terminal.json', terminal); return terminal


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True); parser.add_argument('--config-sha256', required=True)
    args = parser.parse_args()
    try:
        config = p.strict_json(p.pinned({'path': args.config, 'sha256': args.config_sha256}, limit=64 * 1024))
        profile, client, plan, index_sha, map_sha = admit(config)
        freeze_once(profile, client, plan, config['output'], index_sha, map_sha); return 0
    except BaseException:
        print('public215 freeze stopped; inspect durable SQL before explicit recovery; no retry', file=sys.stderr); return 1


if __name__ == '__main__':
    raise SystemExit(main())
