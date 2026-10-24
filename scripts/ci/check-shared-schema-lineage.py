#!/usr/bin/env python3
"""Keep pinned history immutable; admit three exact, freshly qualified DML transitions."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

TRANSITIONS = (
    ('supabase/migrations/20261023233140_training_m1_version_attestation_repin.sql',
     'db76250600559267781decf480070d5e177e01cd62b5207b0f944fa1ef9c3b41'),
    ('supabase/migrations/20261024014250_training_m1_low_memory_repin.sql',
     'db6442684fe844523877d31b6111d9818312080dcac08fb27dbb9a8b390d0900'),
    ('supabase/migrations/20261024034508_training_m1_float16_normalization_repin.sql',
     'b6deee756e3426b8a9fa67e74cb490a3aaf68f53ebea7fe6df58bf234979ed8d'),
)
EVIDENCE_PREFIX = 'Phase 6 Training solver catalog verification passed: '
REQUIRED_CHECKS = (
    'exactTwoTargets', 'schemaUnchanged', 'm2Unchanged',
    'receiptsAndArtifactsPreserved', 'duplicateRefused', 'guardDriftRefused',
    'unexpectedReceiptRefused', 'wrongTargetRolledBack',
    'interruptedTransactionRolledBack', 'recoveryRetiresNewOnly', 'oldRetirementImmutable',
    'wrongPredecessorRefused', 'retiredRequestsRefused', 'backlogRefused',
)


def fingerprint(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (root / 'supabase/migrations').rglob('*.sql')}


def validate_inputs(inventory, forward, actual):
    if forward.get('hub') != []:
        raise ValueError('A different Hub forward transition requires independent qualification')
    records = inventory['repositories']['hub']['files']
    expected = {record['path']: record['sha256'] for record in records}
    if len(expected) != len(records):
        raise ValueError('Duplicate historical migration identity')
    if set(expected) - set(actual):
        raise ValueError('Historical migration missing')
    if any(actual[p] != digest for p, digest in expected.items()):
        raise ValueError('Historical migration bytes changed')
    new = set(actual) - set(expected)
    if new != set(dict(TRANSITIONS)) or any(actual.get(p) != digest for p, digest in TRANSITIONS):
        raise ValueError('Only the three exact reviewed M1 repins may receive forward qualification')


def extend_inventory(inventory, forward, actual, proof):
    validate_inputs(inventory, forward, actual)
    if not isinstance(proof, list) or len(proof) != len(TRANSITIONS):
        raise ValueError('Native proof must cover all three transitions in order')
    for item, (migration, digest) in zip(proof, TRANSITIONS):
        if not isinstance(item, dict) or item.get('path') != migration or item.get('sha256') != digest:
            raise ValueError('Native proof does not bind the exact migration sequence')
        if type(item.get('postgresMajor')) is not int or item['postgresMajor'] != 17:
            raise ValueError('PostgreSQL 17 qualification required')
        if any(item.get(check) is not True for check in REQUIRED_CHECKS):
            raise ValueError('Incomplete native M1 transition qualification')
    admitted = copy.deepcopy(inventory)
    admitted['repositories']['hub']['files'].extend(
        {'path': migration, 'sha256': digest} for migration, digest in TRANSITIONS)
    return admitted


def native_proof(stdout):
    receipts = [line[len(EVIDENCE_PREFIX):] for line in stdout.splitlines()
                if line.startswith(EVIDENCE_PREFIX)]
    if len(receipts) != 1:
        raise ValueError('Expected exactly one fresh native qualification receipt')
    return json.loads(receipts[0])['m1RepinTransitions']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkout', required=True, type=Path)
    parser.add_argument('--shared-source', required=True, type=Path)
    args = parser.parse_args()
    root, shared = args.checkout.resolve(), args.shared_source.resolve()
    inventory = json.loads((shared / 'supabase/bootstrap/source-history.json').read_text())
    forward_path = shared / 'supabase/bootstrap/forward-schema.json'
    forward = json.loads(forward_path.read_text())
    actual = fingerprint(root)
    validate_inputs(inventory, forward, actual)
    # No production connection settings or credentials reach the disposable verifier.
    allowed = ('PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'TMP', 'TEMP',
               'SYSTEMROOT', 'PHASE6_POSTGRES_BIN')
    environment = {key: os.environ[key] for key in allowed if key in os.environ}
    result = subprocess.run(['node', str(root / 'scripts/verify-training-solver-catalog-postgres.mjs')],
                            cwd=root, env=environment, check=True, capture_output=True, text=True)
    proof = native_proof(result.stdout)
    # Re-read migration bytes after execution so the receipt cannot admit changed input.
    admitted = extend_inventory(inventory, forward, fingerprint(root), proof)
    with tempfile.TemporaryDirectory(prefix='training-qualified-lineage-') as scratch:
        derived = Path(scratch) / 'qualified-inventory.json'
        derived.write_text(json.dumps(admitted), encoding='utf-8')
        # The canonical checker and captured inventory stay unchanged. No file is ignored.
        subprocess.run([sys.executable, str(shared / 'scripts/schema-rebuild/check_history.py'),
                        '--checkout', str(root), '--repo', 'hub', '--inventory', str(derived),
                        '--forward', str(forward_path)], check=True, env=environment)
    print(json.dumps({'status': 'EXACT_DML_TRANSITIONS_QUALIFIED', 'proof': proof,
                      'productionDatabaseAccess': False, 'solverExecution': False}, sort_keys=True))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as error:
        # Native tests contain only isolated fixtures; retain their diagnostic failure.
        print(error.stdout or '', file=sys.stderr)
        print(error.stderr or '', file=sys.stderr)
        raise
