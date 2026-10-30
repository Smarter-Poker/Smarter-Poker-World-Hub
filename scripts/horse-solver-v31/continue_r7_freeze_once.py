#!/usr/bin/env python3
"""Explicit R7 known-partial continuation. Never trains, captures or retries.

This controller is outside the approved nine producer files. It imports their
unchanged code only after verifying the original approved manifest/source pins.
Root supplies a fresh authenticated read-only SQL snapshot, pinned in config.
"""
from __future__ import annotations

import argparse
from dataclasses import replace
from datetime import datetime, timezone
import hashlib
import importlib
import json
import os
import re
from pathlib import Path
import sys

DATASET = '2f9499d5-64de-456c-bbd7-97369cc6f48b'
MANIFEST = '8aa268a7b929672fa49b9b914b4d2f226f9af016aa12e63ee897ea58cb4cf51f'
INDEX = 'fdafe80bc08a69a737c8d242a3bb2aa5dc2b59be43e22f096d770d8b8dcdea6f'
EXPECTED = '4a2d9ea323ee73694ad0a8ed503c30c3ebfd0ec00730e02d5688f0df347de699'
FAILED = '8a0dc8fc557757484f27bf05bb0499840742a43a2b0ea500222ad1c6280c3e04'
EMPTY = hashlib.sha256(b'').hexdigest()
PRODUCER = 'c6341c31eb9ba3530aabe3f923079a53fe4c5aa7'
R1_OUTER = '36d12f429fc4b0ae539fb95739d8ddcc72be01fbd31c515ffd54efc7a2592f9a'
R1_TERMINAL = '66ccfa96b20431d378d480d60ad1dc150aa34c426eec2a3485208debdbaa7f75'
FIELDS = ('model_checksum', 'template_checksum', 'training_provenance_checksum',
          'model_build_receipt_checksum')
CONFIG = {'format', 'dataset_id', 'pipeline_root', 'input_root', 'manifest',
          'model_index', 'failed_claim', 'failed_result', 'expected_freezes',
          'snapshot', 'snapshot_observed_at', 'expected_existing_count',
          'r1_outer_result', 'r1_terminal', 'output'}


class Refusal(ValueError):
    pass


def need(value, code):
    if not value:
        raise Refusal(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'),
                      ensure_ascii=False, allow_nan=False).encode('ascii')


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def strict_json(payload, bom=False):
    def pairs(items):
        need(len(items) == len({k for k, _ in items}), 'DUPLICATE_JSON_KEY')
        return dict(items)
    def constant(_):
        raise Refusal('NONFINITE_JSON')
    return json.loads(payload.decode('utf-8-sig' if bom else 'utf-8'),
                      object_pairs_hook=pairs, parse_constant=constant)


def regular(path):
    p = Path(path)
    need(p.is_absolute() and p.resolve(strict=True) == p and p.is_file()
         and not p.is_symlink() and not any(x.startswith('.env') for x in p.parts),
         'CANONICAL_REGULAR_FILE_REQUIRED')
    return p


def pinned(pin, expected=None, limit=128 * 1024 * 1024):
    need(isinstance(pin, dict) and set(pin) == {'path', 'sha256'}, 'EXACT_FILE_PIN')
    sha = pin['sha256']
    need(isinstance(sha, str) and len(sha) == 64 and
         all(c in '0123456789abcdef' for c in sha), 'VALID_SHA_REQUIRED')
    if expected is not None:
        need(sha == expected, 'ORIGINAL_PIN_REQUIRED')
    with regular(pin['path']).open('rb') as f:
        payload = f.read(limit + 1)
    need(len(payload) <= limit and digest(payload) == sha, 'PINNED_BYTES_DIFFER')
    return payload


def timestamp(value):
    need(isinstance(value, str), 'TIMESTAMP_REQUIRED')
    stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(stamp.tzinfo is not None, 'UTC_TIMESTAMP_REQUIRED')
    return stamp


def fresh_snapshot(value, now=None):
    age = ((now or datetime.now(timezone.utc)) - timestamp(value)).total_seconds()
    need(0 <= age <= 300, 'FRESH_ROOT_SQL_SNAPSHOT_REQUIRED')


def bindings(coverage, models, expected, snapshot, expected_existing_count):
    """Complete independent identity comparison, before any operation claim."""
    need(len(coverage) == len(models) == 107, 'EXACT107_REQUIRED')
    keys = [canonical(c) for c in coverage]
    need(len(set(keys)) == 107 and set(keys) == set(models) and keys == sorted(keys),
         'EXACT_CANONICAL_CONTEXT_CENSUS')
    need(type(expected_existing_count) is int and expected_existing_count == 2,
         'EXACT_TWO_COMMITTED_PREFIX_REQUIRED')
    need(isinstance(expected, dict) and set(expected) ==
         {'contexts', 'dataset_id', 'index_sha256'} and
         expected['dataset_id'] == DATASET and expected['index_sha256'] == INDEX and
         isinstance(expected['contexts'], list) and len(expected['contexts']) == 107,
         'EXPECTED107_IDENTITY')
    observed = {}
    for row in expected['contexts']:
        need(isinstance(row, dict) and set(row) == {'context', 'context_id', *FIELDS},
             'EXPECTED_CONTEXT_SHAPE')
        key = canonical(row['context'])
        need(key in models and key not in observed and row['context_id'] == digest(key),
             'EXPECTED_CONTEXT_IDENTITY')
        need(all(row[f] == models[key][f] for f in FIELDS), 'EXPECTED_MODEL_BINDINGS')
        observed[key] = row
    need(set(observed) == set(keys), 'EXPECTED_CONTEXT_CENSUS')
    need(isinstance(snapshot, list) and len(snapshot) == expected_existing_count,
         'EXPLICIT_EXISTING_PREFIX_CENSUS_REQUIRED')
    frozen = set()
    for row in snapshot:
        need(isinstance(row, dict) and set(row) == {'context', 'frozen_at', *FIELDS},
             'EXACT_EXISTING_FREEZE_SHAPE')
        key = canonical(row['context'])
        need(key in keys[:expected_existing_count] and key not in frozen,
             'ONLY_EXACT_COMMITTED_PREFIX_MAY_BE_SKIPPED')
        timestamp(row['frozen_at'])
        need(all(row[f] == models[key][f] for f in FIELDS), 'EXISTING_FREEZE_DIFFERS')
        frozen.add(key)
    need(frozen == set(keys[:expected_existing_count]), 'EXACT_COMMITTED_PREFIX_REQUIRED')
    return [models[k] for k in keys[expected_existing_count:]]


def approved_boards(entry, approved):
    """Derive only distinct chronological boards from admitted Linux case pairs."""
    cases = entry['public_model_build_receipt'].get('cases')
    need(isinstance(cases, list) and isinstance(approved, list) and
         2 <= len(cases) == len(approved) <= 32, 'APPROVED_CASE_CENSUS_REQUIRED')
    boards = []
    streets = {'flop': 3, 'turn': 4, 'river': 5}
    street = streets.get(entry['context'].get('street'))
    need(street is not None, 'APPROVED_STREET_REQUIRED')
    for case, allowed in zip(cases, approved):
        need(isinstance(case, dict) and isinstance(allowed, dict) and
             set(allowed) == {'board', 'own'} and
             {k: case.get(k) for k in ('board', 'own')} == allowed,
             'APPROVED_LINUX_CASE_PAIR_REQUIRED')
        board = allowed['board']
        need(isinstance(board, str) and len(board) == street * 2 and
             re.fullmatch(r'(?:[2-9TJQKA][cdhs]){3,5}', board) is not None and
             len({board[i:i+2] for i in range(0, len(board), 2)}) == street,
             'CANONICAL_APPROVED_BOARD_REQUIRED')
        if board not in boards:
            boards.append(board)
    return boards


def plan_remaining(coverage, models, expected, snapshot, expected_existing_count, approved):
    remaining = bindings(coverage, models, expected, snapshot, expected_existing_count)
    need(isinstance(approved, dict) and set(approved) == set(models),
         'COMPLETE_APPROVED_PROTOCOL_CONTEXTS_REQUIRED')
    return [{'preparation_offset': offset, 'entry': entry,
             'physics_boards': approved_boards(entry, approved[canonical(entry['context'])])}
            for offset, entry in enumerate(remaining, expected_existing_count)]


def physics_receipt(value, entry, board):
    need(isinstance(value, dict) and set(value) == {'format', 'dataset_id', 'context',
         'cell_key_checksum', 'model_checksum', 'template_checksum', 'board', 'audit_key'} and
         value['format'] == 'public215_prepared_physics_v1' and
         value['dataset_id'] == DATASET and value['context'] == entry['context'] and
         value['model_checksum'] == entry['model_checksum'] and
         value['template_checksum'] == entry['template_checksum'] and value['board'] == board,
         'PHYSICS_RECEIPT_DIFFERS')
    for key in ('cell_key_checksum', 'audit_key'):
        sha = value[key]
        need(isinstance(sha, str) and re.fullmatch(r'[0-9a-f]{64}', sha) is not None and
             sha != '0' * 64, 'PHYSICS_RECEIPT_DIFFERS')
    return value


def admit(config):
    need(isinstance(config, dict) and set(config) == CONFIG and
         config['format'] == 'public215_r7_freeze_continuation_v2' and
         config['dataset_id'] == DATASET, 'EXACT_R7_CONFIG_REQUIRED')
    raw = strict_json(pinned(config['manifest'], MANIFEST, 16 * 1024 * 1024))
    root = Path(config['pipeline_root'])
    need(root.is_absolute() and root.resolve(strict=True) == root and
         raw['pipeline_commit'] == PRODUCER and len(raw['pipeline_files']) == 9,
         'ORIGINAL_PRODUCER_REQUIRED')
    task = root.parent
    need(root.name == 'pipeline' and Path(config['input_root']) == task / 'inputs' and
         Path(config['model_index']['path']) == task / 'model-builds-final-r1' / 'model-index.json' and
         Path(config['failed_claim']['path']) == task / 'public215-freeze.claim' and
         Path(config['failed_result']['path']) == task / 'public215-freeze-result.json',
         'ORIGINAL_OFFICIAL_TASK_PATHS_REQUIRED')
    output = Path(config['output'])
    need(output.is_absolute() and output.parent.resolve(strict=True) == output.parent and
         output.parent == task and output.name.startswith('public215-freeze-continuation-r2-')
         and not output.exists(), 'NEW_R2_OFFICIAL_OUTPUT_REQUIRED')
    files = set()
    for pin in raw['pipeline_files']:
        name = pin['path']
        need(name.startswith('scripts/horse-solver-v31/') and '..' not in name.split('/')
             and name not in files, 'SOURCE_PIN_PATH_REQUIRED')
        files.add(name)
        pinned({'path': str(root / name), 'sha256': pin['checksum']}, limit=16 * 1024 * 1024)
    codec_dir = root / 'scripts' / 'horse-solver-v31'
    # The maintained loader independently verifies the exact required nine set.
    sys.path.insert(0, str(codec_dir))
    loaded = {}
    for name in ('contract', 'gateway', 'public_hist215', 'compactor'):
        module = importlib.import_module(name)
        need(Path(module.__file__).resolve() == codec_dir / (name + '.py'),
             'PINNED_IMPORT_ORIGIN_REQUIRED')
        loaded[name] = module
    contract, codec = loaded['contract'], loaded['public_hist215']
    need(files == set(contract.PUBLIC215_PIPELINE_FILES), 'EXACT_NINE_SOURCE_SET')
    manifest = contract.load_manifest(config['manifest']['path'], expected_checksum=MANIFEST,
                                     input_root=config['input_root'], pipeline_root=root)
    pinned(config['model_index'], INDEX)
    models = codec.load_model_build_index(config['model_index']['path'],
        expected_checksum=INDEX, dataset_id=DATASET,
        manifest={**manifest.raw, '_actual_manifest_checksum': manifest.checksum})
    need(pinned(config['failed_claim'], EMPTY, 0) == b'', 'ORIGINAL_FAILED_CLAIM_REQUIRED')
    result = strict_json(pinned(config['failed_result'], FAILED, 16 * 1024), bom=True)
    need(isinstance(result, dict) and set(result) == {'operation', 'host', 'exitCode',
         'manifestChecksum', 'pipelineCommit', 'publicModelBuilds',
         'publicModelBuildsChecksum', 'principal', 'promotionRequested'} and
         result['operation'] == 'freeze' and result['host'] == 'SMARTERPOKER' and
         type(result['exitCode']) is int and result['exitCode'] == 1 and
         result['manifestChecksum'] == MANIFEST and result['pipelineCommit'] == PRODUCER and
         result['publicModelBuilds'] == config['model_index']['path'] and
         result['publicModelBuildsChecksum'] == INDEX and result['principal'] == 'COMPACTOR'
         and result['promotionRequested'] is False, 'ORIGINAL_FAILURE_REQUIRED')
    expected = strict_json(pinned(config['expected_freezes'], EXPECTED, 256 * 1024))
    snapshot = strict_json(pinned(config['snapshot'], limit=256 * 1024))
    need(Path(config['r1_outer_result']['path']) == task / 'public215-freeze-continuation-r1-launch' / 'result.json'
         and Path(config['r1_terminal']['path']) == task / 'public215-freeze-continuation-r1' / 'terminal.json',
         'PRESERVED_R1_TERMINAL_PATHS_REQUIRED')
    outer = strict_json(pinned(config['r1_outer_result'], R1_OUTER, 16 * 1024))
    terminal = strict_json(pinned(config['r1_terminal'], R1_TERMINAL, 16 * 1024))
    need(outer.get('dataset_id') == DATASET and type(outer.get('native_exit_code')) is int
         and outer['native_exit_code'] == 1 and type(outer.get('wrapper_exit_code')) is int
         and outer['wrapper_exit_code'] == 1 and outer.get('certified') is False and
         outer.get('seed_opened') is False and terminal.get('status') == 'incomplete_unknown_stop'
         and type(terminal.get('completed_new')) is int and terminal['completed_new'] == 0
         and type(terminal.get('existing_verified')) is int and terminal['existing_verified'] == 1
         and type(terminal.get('failed_ordinal')) is int and terminal['failed_ordinal'] == 1,
         'CLOSED_R1_UNKNOWN_OUTCOME_REQUIRED')
    approved = {canonical(g['context']): g['cases'] for g in
                manifest.raw['public215_protocols']['runtime_parity_protocol']['contexts']}
    remaining = plan_remaining(loaded['compactor'].declared_coverage(manifest), models,
        expected, snapshot, config['expected_existing_count'], approved)
    fresh_snapshot(config['snapshot_observed_at'])
    client = replace(loaded['gateway'].GatewayClient.from_environment('COMPACTOR',
                     manifest.provenance), attempts=1)
    return client, remaining


def write_new(directory, name, value):
    payload = canonical({**value, 'observed_at': datetime.now(timezone.utc).isoformat()})
    with (directory / name).open('xb') as f:
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    if os.name != 'nt':
        fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def run_remaining(client, plan, output, config_sha, existing_count):
    need(client.attempts == 1 and type(existing_count) is int and existing_count == 2
         and len(plan) == 107 - existing_count and
         [item['preparation_offset'] for item in plan] == list(range(existing_count, 107)),
         'EXPLICIT_SINGLE_ATTEMPT_REMAINDER_REQUIRED')
    for item in plan:
        entry = item['entry']
        # The caller cannot substitute or omit a planned board after admission.
        cases = entry['public_model_build_receipt']['cases']
        pairs = [{k: case.get(k) for k in ('board', 'own')} for case in cases]
        need(item['physics_boards'] == approved_boards(entry, pairs),
             'ADMITTED_PHYSICS_PLAN_CHANGED')
    directory = Path(output)
    need(directory.is_absolute() and directory.parent.resolve(strict=True) == directory.parent
         and not directory.exists(), 'NEW_EXCLUSIVE_OPERATION_REQUIRED')
    directory.mkdir()
    write_new(directory, 'claim.json', {'format': 'public215_r7_freeze_claim_v2',
        'dataset_id': DATASET, 'config_sha256': config_sha, 'index_sha256': INDEX,
        'existing_verified': existing_count, 'remaining': len(plan), 'attempts': 1})
    completed = 0
    for ordinal, item in enumerate(plan, 1):
        entry = item['entry']
        cid = digest(canonical(entry['context']))
        base = {'dataset_id': DATASET, 'ordinal': ordinal, 'context_id': cid,
                'preparation_offset': item['preparation_offset'],
                'model_checksum': entry['model_checksum'],
                'model_build_receipt_checksum': entry['model_build_receipt_checksum']}
        write_new(directory, f'{ordinal:03d}.started.json', base)
        envelope = {k: entry[k] for k in ('context', 'model_checksum',
                    'public_model_build_receipt', 'model_build_receipt_checksum')}
        phase, phase_name, board = 'physics', None, None
        try:
            for board_ordinal, board in enumerate(item['physics_boards']):
                phase_name = f'{ordinal:03d}.physics-{board_ordinal:02d}'
                write_new(directory, phase_name + '.started.json', {**base,
                    'phase': 'physics', 'physics_board': board})
                response = client.call('freeze_model', {'dataset_id': DATASET,
                    'context': envelope, 'physics_board': board,
                    'preparation_offset': item['preparation_offset']}, timeout_seconds=280)
                receipt = physics_receipt(response, entry, board)
                write_new(directory, phase_name + '.terminal.json', {**base,
                    'phase': 'physics', 'physics_board': board,
                    'status': 'acknowledged_exact_approved_physics_receipt', 'receipt': receipt})
            phase, phase_name, board = 'freeze', f'{ordinal:03d}.freeze', None
            write_new(directory, phase_name + '.started.json', {**base, 'phase': phase})
            receipt = client.call('freeze_model', {'dataset_id': DATASET,
                                  'context': envelope}, timeout_seconds=280)
            need(receipt == entry['model_build_receipt_checksum'], 'FREEZE_RECEIPT_DIFFERS')
            write_new(directory, phase_name + '.terminal.json', {**base,
                'phase': phase, 'status': 'acknowledged_exact_sql_freeze_receipt'})
        except BaseException as error:
            # Never serialize exception/URL/body/environment/credential values.
            status = getattr(error, 'status', None)
            http_status = status if type(status) is int and 100 <= status <= 599 else None
            classification = ('receipt_mismatch' if isinstance(error, Refusal) and
                              error.args in [('FREEZE_RECEIPT_DIFFERS',), ('PHYSICS_RECEIPT_DIFFERS',)]
                              else 'gateway_http' if http_status is not None else
                              'transport_or_unclassified')
            failure = {**base, 'phase': phase, 'physics_board': board,
                'status': 'unknown_inspect_durable_sql_before_explicit_recovery',
                'failure_classification': classification, 'http_status': http_status}
            if phase_name is not None and not (directory / (phase_name + '.terminal.json')).exists():
                write_new(directory, phase_name + '.terminal.json', failure)
            write_new(directory, f'{ordinal:03d}.terminal.json', failure)
            write_new(directory, 'terminal.json', {'status': 'incomplete_unknown_stop',
                'completed_new': completed, 'existing_verified': existing_count,
                'failed_ordinal': ordinal, 'failed_phase': phase, 'certified': False})
            raise Refusal('FREEZE_OUTCOME_UNKNOWN_NO_RETRY') from None
        completed += 1
        write_new(directory, f'{ordinal:03d}.terminal.json', {**base,
                   'status': 'acknowledged_exact_sql_freeze_receipt'})
    terminal = {'status': '107_freeze_receipts_require_independent_sql_readback',
                'completed_new': completed, 'existing_verified': existing_count, 'certified': False}
    write_new(directory, 'terminal.json', terminal)
    return terminal


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--config-sha256', required=True)
    args = parser.parse_args()
    try:
        config = strict_json(pinned({'path': args.config, 'sha256': args.config_sha256},
                                    limit=64 * 1024))
        client, remaining = admit(config)
        fresh_snapshot(config['snapshot_observed_at'])
        print(json.dumps(run_remaining(client, remaining, config['output'], args.config_sha256,
                                       config['expected_existing_count'])))
    except BaseException:
        print('R7 freeze continuation refused; inspect durable operation evidence; no automatic retry',
              file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
