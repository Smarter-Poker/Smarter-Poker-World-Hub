from contextlib import redirect_stderr, redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from urllib import error


ROOT = Path(__file__).resolve().parents[1]
HELPER_PATH = ROOT / 'scripts/ci/provision-training-m1-hmac.py'
WORKFLOW_PATH = ROOT / '.github/workflows/provision-training-m1-hmac.yml'
spec = importlib.util.spec_from_file_location('phase6_m1_provision', HELPER_PATH)
provisioner = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = provisioner
spec.loader.exec_module(provisioner)


class FakeApi:
    def __init__(self, before, after=None):
        self.before = before
        self.after = after if after is not None else before
        self.list_count = 0
        self.patches = []

    def list_entries(self):
        self.list_count += 1
        return self.before if self.list_count == 1 else self.after

    def patch_value(self, entry_id, value):
        self.patches.append((entry_id, bytes(value)))


def entry(entry_id='env_m1', *, key=provisioner.SECRET_KEY, target=None,
          env_type='sensitive', branch=None, updated=1000):
    return {
        'id': entry_id,
        'key': key,
        'target': ['production'] if target is None else target,
        'type': env_type,
        'gitBranch': branch,
        'updatedAt': updated,
        # A provider response is allowed to carry an opaque field; it must
        # never enter safe metadata or any retained receipt.
        'value': 'provider-opaque-value',
    }


class ProvisionTrainingM1Hmac(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key_dir = tempfile.TemporaryDirectory()
        cls.private_key = Path(cls.key_dir.name) / 'private.pem'
        cls.public_key = Path(cls.key_dir.name) / 'public.der'
        subprocess.run(
            ['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:4096',
             '-out', str(cls.private_key)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ['openssl', 'pkey', '-in', str(cls.private_key), '-pubout', '-outform', 'DER',
             '-out', str(cls.public_key)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        cls.spki = cls.public_key.read_bytes()
        cls.fingerprint = hashlib.sha256(cls.spki).hexdigest()

    @classmethod
    def tearDownClass(cls):
        cls.key_dir.cleanup()

    def config(self, directory):
        return provisioner.Config(
            expected_commit='a' * 40,
            github_sha='a' * 40,
            github_ref=provisioner.MAIN_REF,
            github_run_id='1234',
            github_run_attempt='1',
            request_id='phase6-m1-test-1234',
            token='vercel-token-never-logged',
            project_id=provisioner.PROJECT_ID,
            team_id=provisioner.TEAM_ID,
            public_key_spki=self.spki,
            public_key_fingerprint=self.fingerprint,
            artifact_dir=Path(directory) / provisioner.ARTIFACT_DIRECTORY_NAME,
            github_output=None,
        )

    def test_rsa_4096_spki_and_oaep_sha256_round_trip(self):
        provisioner.validate_rsa_4096_spki(self.spki, self.fingerprint)
        plaintext = bytearray(b'a' * 64)
        ciphertext = provisioner.encrypt_oaep_sha256(self.spki, plaintext)
        self.assertEqual(len(ciphertext), 512)
        decrypted = subprocess.run(
            ['openssl', 'pkeyutl', '-decrypt', '-inkey', str(self.private_key),
             '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256',
             '-pkeyopt', 'rsa_mgf1_md:sha256'],
            input=ciphertext, check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        ).stdout
        self.assertEqual(decrypted, bytes(plaintext))

    def test_invalid_key_or_fingerprint_fails_before_random_generation_or_patch(self):
        calls = {'random': 0}
        def random_bytes(_size):
            calls['random'] += 1
            return b'x' * 32
        with self.assertRaises(provisioner.ProvisionError):
            provisioner.validate_rsa_4096_spki(self.spki, '0' * 64)
        with tempfile.TemporaryDirectory() as directory:
            config = self.config(directory)
            api = FakeApi([entry(target=['production', 'preview'], branch='release')])
            with self.assertRaises(provisioner.ProvisionError):
                provisioner.provision(config, api, random_bytes=random_bytes)
            self.assertEqual(calls['random'], 0)
            self.assertEqual(api.patches, [])

    def test_environment_shape_failures_are_closed_before_secret_generation(self):
        invalid_sets = [
            [entry(key='OTHER')],
            [entry(), entry('env_duplicate')],
            [entry(branch='release')],
            [entry(branch='')],
            [entry(env_type='encrypted')],
            [entry(target=['preview'])],
        ]
        for entries in invalid_sets:
            with self.subTest(entries=entries):
                generated = []
                with tempfile.TemporaryDirectory() as directory:
                    with self.assertRaises(provisioner.ProvisionError):
                        provisioner.provision(
                            self.config(directory), FakeApi(entries),
                            random_bytes=lambda _size: generated.append(True) or b'x' * 32,
                        )
                self.assertEqual(generated, [])

    def test_shared_scope_is_separated_without_reading_or_writing_old_value(self):
        for kind in ('sensitive', 'encrypted'):
            before = [entry(target=['production','preview','development'], env_type=kind), entry('other', key='OTHER', updated=10)]
            separated = [entry(target=['preview','development'], env_type=kind, updated=1001), before[1]]
            created = [*separated, entry('new_prod', updated=1002)]
            with tempfile.TemporaryDirectory() as directory:
                config = self.config(directory)
                class ScopeApi:
                    def __init__(self): self.reads=0; self.writes=[]
                    def list_entries(self):
                        self.reads+=1
                        return [before,separated,created][self.reads-1]
                    def patch_targets(self, identity, targets):
                        receipt=json.loads((config.artifact_dir/provisioner.RECEIPT_FILENAME).read_text())
                        self_outer.assertEqual(receipt['mutationStep'],'scope_patch_attempted')
                        self_outer.assertTrue((config.artifact_dir/provisioner.CIPHERTEXT_FILENAME).exists())
                        self.writes.append(('targets',identity,targets))
                    def create_production(self, secret):
                        receipt=json.loads((config.artifact_dir/provisioner.RECEIPT_FILENAME).read_text())
                        self_outer.assertEqual(receipt['mutationStep'],'production_create_attempted')
                        self_outer.assertEqual(receipt['scopeSeparatedInventory'],list(map(provisioner.safe_metadata,separated)))
                        self.writes.append(('create',bytes(secret)))
                self_outer=self;api=ScopeApi()
                receipt=provisioner.provision(config,api,random_bytes=lambda _:b'x'*32,encryptor=lambda *_:b'c'*512)
                self.assertEqual(receipt['status'],'complete')
                self.assertEqual(receipt['environmentVariableId'],'new_prod')
                self.assertEqual(api.writes[0],('targets','env_m1',['development','preview']))
                self.assertEqual(len(api.writes),2)
                self.assertNotIn('provider-opaque-value',(config.artifact_dir/provisioner.RECEIPT_FILENAME).read_text())

    def test_scope_recovery_requires_verified_precreate_receipt_and_exact_inventory(self):
        original=entry(target=['production','preview'])
        remainder=[entry(target=['preview'],updated=1001)]
        receipt={'operation':'phase6_m1_hmac_rotation','projectId':provisioner.PROJECT_ID,'teamId':provisioner.TEAM_ID,
                 'status':'scope_separated','mutationStep':'scope_patch_verified','scopeBefore':provisioner.safe_metadata(original),
                 'scopeSeparatedInventory':list(map(provisioner.safe_metadata,remainder)), 'ciphertext':{'sha256':'c'*64}, 'requestId':'prior-request'}
        self.assertEqual(provisioner.scope_plan(remainder,receipt)[0],'create_after_verified_separation')
        for mutation in ({'status':'mutation_unverified'},{'mutationStep':'production_create_attempted'},{'teamId':'other'}, {'scopeSeparatedInventory':[]}):
            with self.assertRaises(provisioner.ProvisionError): provisioner.scope_plan(remainder,{**receipt,**mutation})
        with self.assertRaises(provisioner.ProvisionError): provisioner.scope_plan(remainder)

    def test_scope_failure_retains_unknown_operation_and_never_creates_after_unverified_patch(self):
        with tempfile.TemporaryDirectory() as directory:
            config=self.config(directory)
            class FailedScopeApi:
                creates=0;patches=0
                def list_entries(self): return [entry(target=['production','preview'])]
                def patch_targets(self,*args): self.patches+=1;raise provisioner.ProvisionError('transport unknown')
                def create_production(self,*args): self.creates+=1
            api=FailedScopeApi()
            with self.assertRaises(provisioner.ProvisionError):
                provisioner.provision(config,api,encryptor=lambda *_:b'c'*512)
            receipt=json.loads((config.artifact_dir/provisioner.RECEIPT_FILENAME).read_text())
            self.assertEqual(receipt['status'],'mutation_unverified')
            self.assertEqual(receipt['mutationStep'],'scope_patch_attempted')
            self.assertEqual((api.patches,api.creates),(1,0))

    def test_scope_metadata_rejects_overlap_branch_and_invalid_targets(self):
        for rows in ([entry(target=['production','preview']),entry('other',target=['preview'])],
                     [entry(target=['production','production'])], [entry(target=['unknown'])],
                     [entry(target=[])], [entry(target=['production','preview'],branch='branch')]):
            with self.assertRaises(provisioner.ProvisionError):provisioner.scope_plan(rows)
        before=[entry(),entry('preview',target=['preview'])]
        self.assertEqual(provisioner.scope_plan(before)[0],'rotate')

    def test_create_unknown_is_not_retried_or_eligible_for_recovery(self):
        before=[entry(target=['production','preview'])]
        separated=[entry(target=['preview'],updated=1001)]
        with tempfile.TemporaryDirectory() as directory:
            config=self.config(directory)
            class UnknownApi:
                lists=0; creates=0
                def list_entries(self):
                    self.lists+=1;return before if self.lists==1 else separated
                def patch_targets(self,*args): pass
                def create_production(self,*args):
                    self.creates+=1;raise provisioner.ProvisionError('POST acknowledgement unknown')
            api=UnknownApi()
            with self.assertRaises(provisioner.ProvisionError):provisioner.provision(config,api,encryptor=lambda *_:b'c'*512)
            receipt=json.loads((config.artifact_dir/provisioner.RECEIPT_FILENAME).read_text())
            self.assertEqual(api.creates,1)
            self.assertEqual(receipt['mutationStep'],'production_create_attempted')
            with self.assertRaises(provisioner.ProvisionError):provisioner.scope_plan(separated,receipt)

    def test_scope_and_create_readbacks_refuse_unrelated_or_partial_inventory(self):
        before=[entry(target=['production','preview']),entry('other',key='OTHER')]
        separated=[entry(target=['preview'],updated=1001),before[1]]
        provisioner.verify_separation(before,separated,provisioner.safe_metadata(before[0]))
        for bad in ([entry(target=['production','preview'],updated=1001),before[1]],
                    [separated[0],entry('other',key='OTHER',updated=1001)]):
            with self.assertRaises(provisioner.ProvisionError):provisioner.verify_separation(before,bad,provisioner.safe_metadata(before[0]))
        created=[*separated,entry('new_prod',updated=1002)]
        self.assertEqual(provisioner.verify_creation(separated,created)['id'],'new_prod')
        with self.assertRaises(provisioner.ProvisionError):provisioner.verify_creation(separated,created+[entry('extra',key='EXTRA')])

    def test_target_patch_omits_value_and_create_is_sensitive_production_without_upsert(self):
        calls=[]
        api=provisioner.VercelApi('token',provisioner.PROJECT_ID,provisioner.TEAM_ID)
        def capture(method,path,payload=None,raw_body=None):
            calls.append((method,path,payload,bytes(raw_body) if raw_body else None))
        api._request=capture
        api.patch_targets('old',['preview','development'])
        api.create_production(bytearray(b'a'*64))
        self.assertEqual(calls[0][2],{'target':['preview','development']})
        self.assertIsNone(calls[0][3])
        self.assertNotIn('upsert',calls[1][1])
        body=json.loads(calls[1][3]);self.assertEqual(body['target'],['production']);self.assertEqual(body['type'],'sensitive')

    def test_success_patches_only_value_retains_only_ciphertext_and_safe_receipt(self):
        secret_bytes = bytes(range(32))
        secret_hex = secret_bytes.hex()
        before = [entry(), entry('env_other', key='OTHER_KEY', updated=500)]
        after = [entry(updated=1001), entry('env_other', key='OTHER_KEY', updated=500)]
        api = FakeApi(before, after)
        plaintext_buffers = []
        def encrypt(_key, plaintext):
            plaintext_buffers.append(plaintext)
            return b'c' * 512
        with tempfile.TemporaryDirectory() as directory:
            config = self.config(directory)
            receipt = provisioner.provision(
                config,
                api,
                random_bytes=lambda size: secret_bytes,
                encryptor=encrypt,
                now=lambda: '2026-09-30T00:00:00Z',
            )
            self.assertEqual(api.patches, [('env_m1', secret_hex.encode())])
            self.assertEqual(receipt['status'], 'complete')
            self.assertFalse(receipt['plaintextPersisted'])
            files = sorted(path.name for path in config.artifact_dir.iterdir())
            self.assertEqual(files, [provisioner.CIPHERTEXT_FILENAME, provisioner.RECEIPT_FILENAME])
            retained = b''.join(path.read_bytes() for path in config.artifact_dir.iterdir())
            self.assertNotIn(secret_hex.encode(), retained)
            self.assertNotIn(b'provider-opaque-value', retained)
        self.assertEqual(bytes(plaintext_buffers[0]), b'\x00' * 64)

    def test_failed_patch_upload_receipt_is_fail_closed_and_never_prints_api_body(self):
        api = FakeApi([entry()])
        def fail_patch(_entry_id, _value):
            raise provisioner.ProvisionError('Vercel PATCH request failed with HTTP 500')
        api.patch_value = fail_patch
        stdout = io.StringIO()
        stderr = io.StringIO()
        with tempfile.TemporaryDirectory() as directory:
            config = self.config(directory)
            with redirect_stdout(stdout), redirect_stderr(stderr):
                with self.assertRaises(provisioner.ProvisionError):
                    provisioner.provision(
                        config, api,
                        random_bytes=lambda _size: b'z' * 32,
                        encryptor=lambda _key, _plain: b'c' * 512,
                    )
            receipt = json.loads((config.artifact_dir / provisioner.RECEIPT_FILENAME).read_text())
            self.assertEqual(receipt['status'], 'mutation_unverified')
            self.assertEqual(
                sorted(path.name for path in config.artifact_dir.iterdir()),
                [provisioner.CIPHERTEXT_FILENAME, provisioner.RECEIPT_FILENAME],
            )
        self.assertEqual(stdout.getvalue() + stderr.getvalue(), '')

    def test_http_error_body_is_discarded_without_reaching_error_or_logs(self):
        marker = b'do-not-print-response-body-or-secret'
        def opener(request, timeout):
            raise error.HTTPError(request.full_url, 500, 'provider error', {}, io.BytesIO(marker))
        api = provisioner.VercelApi(
            'token-never-logged', provisioner.PROJECT_ID, provisioner.TEAM_ID, opener=opener,
        )
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            with self.assertRaisesRegex(provisioner.ProvisionError, 'HTTP 500') as caught:
                api.list_entries()
        combined = stdout.getvalue() + stderr.getvalue() + str(caught.exception)
        self.assertNotIn(marker.decode(), combined)

    def test_vercel_requests_never_decrypt_and_patch_body_is_value_only(self):
        calls = []
        api = provisioner.VercelApi('token', provisioner.PROJECT_ID, provisioner.TEAM_ID)
        def fake_request(method, path, payload=None, raw_body=None):
            calls.append((method, path, payload, raw_body))
            if method == 'GET':
                return {'envs': [entry()]}
            return None
        api._request = fake_request
        api.list_entries()
        api.patch_value('env/m1', bytearray(b'a' * 64))
        self.assertNotIn('decrypt', calls[0][1].lower())
        self.assertEqual(calls[1][0], 'PATCH')
        self.assertIn('/env/env%2Fm1?', calls[1][1])
        self.assertIsNone(calls[1][2])
        self.assertEqual(bytes(calls[1][3]), b'\x00' * 76)

    def test_post_rotation_verification_rejects_unrelated_metadata_change(self):
        before = [entry(), entry('env_other', key='OTHER', updated=50)]
        changed = [entry(updated=1001), entry('env_other', key='OTHER', updated=51)]
        with self.assertRaises(provisioner.ProvisionError):
            provisioner.verify_after(before, changed)

    def test_workflow_is_manual_main_bound_protected_and_ciphertext_only(self):
        source = WORKFLOW_PATH.read_text()
        self.assertRegex(source, r'(?m)^on:\n  workflow_dispatch:\n')
        for forbidden in ('schedule:', 'workflow_call:', 'pull_request:', 'push:'):
            self.assertNotIn(forbidden, source)
        self.assertIn('permissions:\n  contents: read', source)
        self.assertIn('cancel-in-progress: false', source)
        self.assertIn('environment: Production – hub-vanguard', source)
        self.assertIn('EXPECTED_COMMIT: ${{ inputs.expected_commit }}', source)
        self.assertIn('PHASE6_REQUEST_ID: ${{ inputs.request_id }}', source)
        self.assertIn('PHASE6_ROTATION_CONFIRM: ${{ inputs.confirm }}', source)
        self.assertIn('ref: ${{ inputs.expected_commit }}', source)
        self.assertRegex(source, r'actions/checkout@[0-9a-f]{40}')
        self.assertRegex(source, r'actions/upload-artifact@[0-9a-f]{40}')
        self.assertIn('retention-days: 1', source)
        self.assertIn('${{ runner.temp }}/phase6-m1-hmac/m1-hmac.oaep-sha256.bin', source)
        self.assertIn('${{ runner.temp }}/phase6-m1-hmac/receipt.json', source)
        self.assertNotRegex(source.lower(), r'\b(vercel deploy|vercel --prod|deploy hook|redeploy)\b')

    def test_load_config_requires_request_id_and_exact_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            base = {
                'EXPECTED_COMMIT': 'a' * 40,
                'GITHUB_SHA': 'a' * 40,
                'GITHUB_REF': provisioner.MAIN_REF,
                'VERCEL_PROJECT_ID': provisioner.PROJECT_ID,
                'VERCEL_ORG_ID': provisioner.TEAM_ID,
                'VERCEL_TOKEN': 'token',
                'M1_PUBLIC_KEY_SPKI_B64': __import__('base64').b64encode(self.spki).decode(),
                'M1_PUBLIC_KEY_SPKI_SHA256': self.fingerprint,
                'RUNNER_TEMP': directory,
                'PHASE6_REQUEST_ID': 'phase6-m1-request-1234',
                'PHASE6_ROTATION_CONFIRM': provisioner.ROTATION_CONFIRMATION,
            }
            self.assertEqual(provisioner.load_config(base).request_id, 'phase6-m1-request-1234')
            for key, value in (
                ('PHASE6_REQUEST_ID', 'bad'),
                ('PHASE6_ROTATION_CONFIRM', 'WRONG'),
            ):
                broken = dict(base)
                broken[key] = value
                with self.assertRaises(provisioner.ProvisionError):
                    provisioner.load_config(broken)


if __name__ == '__main__':
    unittest.main()
