#!/usr/bin/env python3
"""One approved COMPACTOR registration for ANY public215 dataset; never compaction.

Dataset-agnostic form of R7's register-corrected-public215-once.py: the identity it
hard-coded (manifest, bundle, dataset key, producer, census) comes from one
SHA-256-pinned `public215_registration_pins_v1` file that the M2 supervisor
(`register_public215_once.ps1`) also reads. Controller tooling only (not an
approved pipeline file). One attempt: an unknown outcome is read back from durable
SQL, never retried. Gateway calls, in order: register_dataset, dataset_contract.
"""
from __future__ import annotations
import argparse
from dataclasses import replace
import datetime
import json
import os
from pathlib import Path
import re
import sys

PINS_FORMAT = 'public215_registration_pins_v1'
READBACK_CONTRACT = 'smarter-poker.public215-registered-contract-readback.v1'
PIN_KEYS = {'format', 'host', 'account', 'task_root', 'python', 'python_sha256', 'git', 'recipient_root',
            'gateway_url', 'controller_sha256', 'manifest_relative', 'manifest_sha256', 'input_bundle_id',
            'input_bundle_checksum', 'dataset_key', 'pipeline_commit', 'pipeline_bundle_checksum', 'contexts'}
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
# The corrected R7 registration identity, exactly as R7 hard-coded it.
R7_DATASET_KEY = 'horse-v31-public215-independent-20261030-r7-corrected-r1'


class Refusal(RuntimeError):
    pass


def need(value, code):
    if not value:
        raise Refusal(code)


def _hex(value, n):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{%d}' % n, value) is not None and value != '0' * n


def validate_pins(value):
    """Exact public pins; refuses R7's dataset key so R7 is never re-registered."""
    need(isinstance(value, dict) and set(value) == PIN_KEYS and value['format'] == PINS_FORMAT, 'EXACT_PIN_KEYS')
    need(all(_hex(value[k], 64) for k in ('manifest_sha256', 'input_bundle_checksum', 'pipeline_bundle_checksum',
                                            'controller_sha256', 'python_sha256')) and _hex(value['pipeline_commit'], 40),
         'PIN_CHECKSUMS')
    need(isinstance(value['input_bundle_id'], str) and re.fullmatch(UUID, value['input_bundle_id']) is not None and
         value['input_bundle_id'].replace('-', '')[:8] == value['input_bundle_checksum'][:8], 'PIN_BUNDLE_ID')
    need(isinstance(value['dataset_key'], str) and re.fullmatch(r'[a-z0-9][a-z0-9._:-]{2,127}', value['dataset_key'])
         is not None and value['dataset_key'] != R7_DATASET_KEY, 'PIN_DATASET_KEY')
    need(type(value['contexts']) is int and 0 < value['contexts'] <= 10000, 'PIN_CENSUS')
    need(isinstance(value['manifest_relative'], str) and re.fullmatch(r'manifests/[A-Za-z0-9._-]+\.json',
         value['manifest_relative']) is not None, 'PIN_MANIFEST_PATH')
    need(value['gateway_url'] == 'https://smarter.poker/api/internal/horse-solver-v31', 'PIN_GATEWAY')
    for key in ('host', 'account', 'task_root', 'python', 'git', 'recipient_root'):
        need(isinstance(value[key], str) and 0 < len(value[key]) <= 260 and '"' not in value[key], 'PIN_HOST_PATHS')
    return value


def load_pins(path, expected_sha256):
    import hashlib
    payload = Path(path).read_bytes()
    need(len(payload) <= 64 * 1024 and _hex(expected_sha256, 64) and hashlib.sha256(payload).hexdigest() == expected_sha256,
         'PINS_SHA256')
    def pairs(items):
        need(len(items) == len({k for k, _ in items}), 'DUPLICATE_JSON_KEY')
        return dict(items)
    return validate_pins(json.loads(payload.decode('utf-8-sig'), object_pairs_hook=pairs))


def register(manifest, pins, client, declared_coverage, registration_receipt_is_valid, readback_path):
    """The R7 sequence with pinned identity; returns the public readback."""
    need(manifest.checksum == pins['manifest_sha256'], 'OFFICIAL_MANIFEST_IDENTITY')
    need(manifest.raw['input_bundle_id'] == pins['input_bundle_id'] and
         manifest.raw['input_bundle_checksum'] == pins['input_bundle_checksum'], 'APPROVED_INPUT_IDENTITY')
    coverage = declared_coverage(manifest)
    need(len(coverage) == pins['contexts'] == len(manifest.raw.get('public215_contexts', [])), 'COMPLETE_CONTEXT_CENSUS')
    need(manifest.raw['dataset_key'] == pins['dataset_key'] and manifest.raw['pipeline_commit'] == pins['pipeline_commit'] and
         manifest.raw['pipeline_bundle_checksum'] == pins['pipeline_bundle_checksum'], 'PRODUCER_IDENTITY')
    need(not Path(readback_path).exists(), 'REGISTERED_READBACK_EXISTS')
    registration = client.call('register_dataset', {'input_bundle_id': manifest.raw['input_bundle_id'],
                                                    'declared_coverage': coverage,
                                                    'quality_gates': manifest.raw['quality_gates']})
    need(registration_receipt_is_valid(registration) and registration['state'] == 'building', 'BUILDING_RECEIPT')
    contract = client.call('dataset_contract', {})
    need(isinstance(contract, dict) and contract.get('dataset_id') == registration['dataset_id'] and
         contract.get('state') == 'building' and contract.get('dataset_key') == manifest.raw['dataset_key'] and
         contract.get('manifest_checksum') == manifest.checksum and
         contract.get('input_bundle_checksum') == manifest.raw['input_bundle_checksum'] and
         contract.get('pipeline_commit') == manifest.raw['pipeline_commit'] and
         contract.get('input_approval_status') == 'approved', 'FRESH_REGISTERED_CONTRACT')
    receipt = {'contract': READBACK_CONTRACT, 'dataset_id': registration['dataset_id'],
               'dataset_key': manifest.raw['dataset_key'], 'input_bundle_checksum': manifest.raw['input_bundle_checksum'],
               'input_bundle_id': manifest.raw['input_bundle_id'], 'manifest_checksum': manifest.checksum,
               'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'state': 'building'}
    with Path(readback_path).open('x', encoding='ascii', newline='') as f:
        f.write(json.dumps(receipt, sort_keys=True, separators=(',', ':')))
        f.flush()
        os.fsync(f.fileno())
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('manifest', 'input-root', 'pipeline-root', 'pins', 'pins-sha256'):
        parser.add_argument('--' + name, required=True)
    a = parser.parse_args()
    try:
        sys.path.insert(0, str(Path(a.pipeline_root) / 'scripts/horse-solver-v31'))
        from contract import load_manifest
        from gateway import GatewayClient
        from compactor import declared_coverage, registration_receipt_is_valid
        pins = load_pins(a.pins, a.pins_sha256)
        need(os.environ.get('APPROVED_MANIFEST_CHECKSUM') == pins['manifest_sha256'], 'APPROVED_MANIFEST_ENV')
        manifest = load_manifest(a.manifest, expected_checksum=pins['manifest_sha256'], input_root=a.input_root,
                                 pipeline_root=a.pipeline_root)
        client = replace(GatewayClient.from_environment('COMPACTOR', manifest.provenance), attempts=1)
        receipt = register(manifest, pins, client, declared_coverage, registration_receipt_is_valid,
                           Path(a.input_root).parent / 'registered-contract.json')
        print(json.dumps(receipt, sort_keys=True, separators=(',', ':')))
    except BaseException as error:
        code = str(error) if isinstance(error, Refusal) else type(error).__name__
        print('Registration stopped (' + re.sub(r'[^A-Za-z0-9_]', '_', code)[:80] +
              '); inspect durable SQL before any explicit recovery; no retry', file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
