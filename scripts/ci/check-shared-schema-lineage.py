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

REPORT_TRANSITIONS = (
    ('supabase/migrations/20261027183951_digest_player_report_bbj_and_result_breakdown.sql', '31c5122fd4bafa935af8bd35077dfe2e0c5c594230e6e3f378866cdaf83186f4'),
    ('supabase/migrations/20261028150757_digest_spins_and_spend.sql', '3a607b11d99c9a2481bcbe6e847a6e1ca47d7e771a1361b477ba71e4830e6edd'),
    ('supabase/migrations/20261028151456_digest_promo_wallet_payouts.sql', '5f2184d05ae638a1aab374f25bb98b2788bef1add2d037312b71b6dc94ad3335'),
    ('supabase/migrations/20261028152704_digest_profit_fractional_diamonds.sql', '961ffaa783c58f92b17d56f4679882403c7770f96cf3924f79dde60cab7ef5a1'),
    ('supabase/migrations/20261111220642_digest_bbj_rake_and_horse_cash_chips.sql', '090fd87d701c208c6b64150856737e4c2dcbb18ef3b0648588552c1c923a78f1'),
    ('supabase/migrations/20261112140947_digest_kingfish_player_totals.sql', '8b9b4bc938146e52e3fa4c50879902028f7054c4e2caf94f1c0a7cb2c1733f6a'),
    ('supabase/migrations/20261112140952_digest_daily_chip_reconciliation.sql', '122ad1c93b827f7f6eb7bdcb613f16a30f88d7d02fe4811fddd438b6d6e858b3'),
    ('supabase/migrations/20261112141236_digest_daily_results_bounded_plan.sql', '3e5c3830e6245d575e0964558ccf75a8bc39637bc5f474124a6f37a4a2f65270'),
    ('supabase/migrations/20261112141734_digest_daily_chip_supply_verification.sql', '0304ddce853ff9dc12e4ff1e0c9b953a13e1f457da3e4d17e9107b12ecac9458'),
    ('supabase/migrations/20261113154407_digest_tournaments_reconcile_on_start_day.sql', 'cc3614b127a23375bb85f098dfa91186ba1a340921c740e452eb08b238cf69ca'),
    ('supabase/migrations/20261113154919_digest_start_day_index_ranges.sql', '4340469bf0fc9389fa17d937125e5d124c10587fddc029adbfa692e8b0667f42'),
    ('supabase/migrations/20261113160502_digest_start_day_primary_key_probe.sql', '3678a9ca026854fe7375be9bc3e34908d12cace9f566fad7d20f94a0bb4bed60'),
    ('supabase/migrations/20261114163320_digest_daily_results_are_computed_before_the_digest.sql', '4816656716d5f77aaeb1ddb3a6f507ae35114f02d1a4fa42772a0893e3465fd8'),
    ('supabase/migrations/20261114163112_welcome_back_only_for_players_who_never_received_chips.sql', 'c9e0dea577b03a48c70dcb716daf275ea1985fdcb816328646f5e0c1d84561c3'),
    ('supabase/migrations/20261114163728_digest_promo_chips_agent_to_player_and_automated.sql', '8129f4a676297c65d345d135346f562a17817f8dcd869319fa79973105b0d57d'),
    ('supabase/migrations/20261114171206_welcome_back_refused_at_the_ledger_write.sql', 'b4beceecfc6e5cbc0a124d424ee5220140746096c16d2db0193a0a46b9ca4e46'),
    ('supabase/migrations/20261114171319_digest_promo_rule_check.sql', '1e62a3a8ac7daa1bcc8faffaabcf9d06a20cefc90e9a9daddc86e47926da1760'),
    ('supabase/migrations/20261114174204_agent_promo_daily_cap.sql', 'f03ca24510581a4654f638849fe502b7df445ca392437794fc17077ad3b8c4f3'),
    ('supabase/migrations/20261114174518_cashier_history_names_the_union_or_club_that_sent.sql', '7ae0cd350be74ecea3635c1e30869de2197d1263e102e89e7e2089d87aca0701'),
)
MARKETPLACE_TRANSITIONS = (('supabase/migrations/20261031191337_signup_audit_checks_auth_triggers_by_name.sql', '16618b0db7ce11823bdfe685af7b3253976354dfcb099d13b4b926434a679021'), ('supabase/migrations/20261102011118_marketplace_whole_dollar_prices.sql', '8183a4285311c4e74d4e39e4e376ccc53b0dea3aba4fce8b1e2809b3b496f663'),)
MARKETPLACE_PREFIX = 'Marketplace PostgreSQL qualification passed: '
REPORT_PREFIX = 'Digest PostgreSQL qualification passed: '

TRANSITIONS = (
    ('supabase/migrations/20261023233140_training_m1_version_attestation_repin.sql',
     'db76250600559267781decf480070d5e177e01cd62b5207b0f944fa1ef9c3b41'),
    ('supabase/migrations/20261024014250_training_m1_low_memory_repin.sql',
     'db6442684fe844523877d31b6111d9818312080dcac08fb27dbb9a8b390d0900'),
    ('supabase/migrations/20261024040402_training_m1_float16_normalization_repin.sql',
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
    if new != set(dict(TRANSITIONS + REPORT_TRANSITIONS + MARKETPLACE_TRANSITIONS)) or any(actual.get(p) != digest for p, digest in TRANSITIONS + REPORT_TRANSITIONS + MARKETPLACE_TRANSITIONS):
        raise ValueError('Only exact independently qualified M1, digest and marketplace transitions are admitted')


def extend_inventory(inventory, forward, actual, proof, report_proof=None, marketplace_proof=None):
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
    expected_reports = [{'path': p, 'sha256': digest, 'postgresMajor': 17} for p, digest in REPORT_TRANSITIONS]
    if report_proof != expected_reports:
        raise ValueError('Fresh exact PostgreSQL 17 digest qualification required')
    expected_marketplace = [{'path': p, 'sha256': digest, 'postgresMajor': 17} for p, digest in MARKETPLACE_TRANSITIONS]
    if marketplace_proof != expected_marketplace:
        raise ValueError('Fresh exact PostgreSQL 17 marketplace qualification required')
    admitted = copy.deepcopy(inventory)
    admitted['repositories']['hub']['files'].extend(
        {'path': migration, 'sha256': digest} for migration, digest in TRANSITIONS + REPORT_TRANSITIONS + MARKETPLACE_TRANSITIONS)
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
    report_result = subprocess.run(['node', str(root / 'scripts/verify-digest-player-report-postgres.mjs')],
                                  cwd=root, env=environment, check=True, capture_output=True, text=True)
    receipts = [line[len(REPORT_PREFIX):] for line in report_result.stdout.splitlines() if line.startswith(REPORT_PREFIX)]
    if len(receipts) != 1:
        raise ValueError('Expected one fresh digest native qualification receipt')
    report_proof = json.loads(receipts[0])
    with tempfile.TemporaryDirectory(prefix='marketplace-qualified-') as scratch:
        marketplace_env = dict(environment, VIP_GIFT_POSTGRES_ROOT=scratch)
        if environment.get('PHASE6_POSTGRES_BIN'):
            marketplace_env['PG17_BINDIR'] = environment['PHASE6_POSTGRES_BIN']
        marketplace_result = subprocess.run(['node', '--test', str(root / '__tests__/vip-gifts-postgres.test.mjs')],
                                           cwd=root, env=marketplace_env, check=True, capture_output=True, text=True)
    # Node's spec/TAP reporters can prefix console output with '# '.
    receipts = [line[line.index(MARKETPLACE_PREFIX) + len(MARKETPLACE_PREFIX):]
                for line in marketplace_result.stdout.splitlines() if MARKETPLACE_PREFIX in line]
    if len(receipts) != 1:
        raise ValueError('Expected one fresh marketplace native qualification receipt')
    marketplace_proof = json.loads(receipts[0])
    # Re-read migration bytes after execution so the receipt cannot admit changed input.
    admitted = extend_inventory(inventory, forward, fingerprint(root), proof, report_proof, marketplace_proof)
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
