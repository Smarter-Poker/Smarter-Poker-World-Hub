"""Build only the reviewed M1 pair from protected source; no database or Pio."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

repo = Path(__file__).resolve().parents[2]
scripts = repo / 'scripts/preflop-deep'
sys.path.insert(0, str(scripts))
import build_m1_bounded_canary as builder

commit = os.environ['EXPECTED_COMMIT']
pipeline_commit = os.environ['QUALIFIED_PIPELINE_COMMIT']
if os.environ['GITHUB_REF'] != 'refs/heads/main' or os.environ['GITHUB_SHA'] != commit or os.environ['GITHUB_RUN_ATTEMPT'] != '1':
    raise SystemExit('protected first-attempt main identity required')
def blob(path, ref=pipeline_commit):
    return subprocess.check_output(['git', '-C', str(repo), 'show', ref + ':' + path])
source_manifest = blob('scripts/preflop-deep/phases.json', '002cb37bbd89df86f4cc054fcf370f794b14f413')
if hashlib.sha256(source_manifest).hexdigest() != '78cef3238d62f559f158b7cddffef27a2b18cc084fc829577bf607a00e8360e0':
    raise SystemExit('original protected source manifest changed')
old = (repo/'.github/qualification/training-m1-original-phases.json').read_bytes()
if hashlib.sha256(old).hexdigest() != '3115537d7169913cac08db6a40797af7b516e33d1e4faa8d51310704aaf58a25':
    raise SystemExit('original bounded manifest changed')
original = json.loads(old)
if json.loads(source_manifest) != original:
    raise SystemExit('delivered approval differs from protected source contract')
payloads = {name: blob('scripts/preflop-deep/' + name) for name in builder.PIPELINE_FILES}
aggregate = hashlib.sha256()
for name in builder.PIPELINE_FILES:
    aggregate.update(name.encode('ascii') + b'\0' + payloads[name] + b'\0')
packet = dict(schema=builder.INPUT_SCHEMA, migration_version='20261023233000', manifest_version=5,
    review=dict(approved_by='M1 Training version-attestation repair 2026-10-23', expected_training_game_count=107,
                expected_chip_ev_contract_count=18, expected_icm_contract_count=7,
                expected_tree_geometry='srp_parameterized_four_action_v3'),
    pipeline=dict(commit=pipeline_commit, distribution='controller-local-bundle.v1',
                  files_sha256={n: hashlib.sha256(b).hexdigest() for n,b in payloads.items()}, bundle_sha256=aggregate.hexdigest()),
    pio=dict(machine_id='M1', solver_version='PioSOLVER-pro 3.8.0 (Sep 22 2025, 11:05:45)',
             binary_sha256='e21ea7ad1dbc2a9d826c25ac264688f632dd461b92de2bc35a53f6b78bcf5ceb',
             source_combo_order_sha256=original['source_combo_order_sha256']),
    phase=original['phases'][0], canary=original['bounded_canary_contracts'][0], self_test=original['self_test'])
output = Path(os.environ['RUNNER_TEMP']) / 'training-m1-qualified-release'
output.mkdir(exist_ok=False)
packet_path = output / 'reviewed-packet.json'
packet_path.write_text(json.dumps(packet,sort_keys=True,separators=(',',':'))+'\n')
receipt = builder.build(packet_path, output/'generated', repo, builder.CANONICAL_PROTECTED_REF, commit)
manifest = (output/'generated/phases.json').read_bytes()
assert hashlib.sha256(manifest).hexdigest() == receipt['manifest_sha256']
new = json.loads(manifest)
for key in ('phases','self_test','bounded_canary_contracts','training_game_contracts','training_contract_scope'):
    assert new[key] == original[key], key
assert new['release_gate']['bounded_canary_ready'] and not new['release_gate']['solver_ready']
with zipfile.ZipFile(output/'m1-bounded-release.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name,data in {**payloads,'phases.json':manifest}.items():
        archive.writestr(name,data)
(output/'qualification.json').write_text(json.dumps(dict(status='QUALIFIED_NO_EXECUTION',pipelineCommit=pipeline_commit,
    manifestChecksum=receipt['manifest_sha256'],releaseZipSha256=hashlib.sha256((output/'m1-bounded-release.zip').read_bytes()).hexdigest(),
    exactOriginalPairAndGameContractsPreserved=True,machine='M1',partition=[2,0],solves=0,databaseWrites=0),indent=2)+'\n')
print(json.dumps(receipt))
