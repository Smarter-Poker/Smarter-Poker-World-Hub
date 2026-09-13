import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('sync', ROOT / 'scripts/sync-deployment-monitor-credential.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)
remote = {'__name__': 'configuration_test'}
exec(sync.REMOTE_CODE, remote)


class DeploymentMonitorConfiguration(unittest.TestCase):
    def test_validates_project_team_repository_and_deployment_access(self):
        calls = []
        def fetch(_token, path):
            calls.append(path)
            if path.startswith('/v9/projects/'):
                return {'id': sync.PROJECT_ID, 'accountId': sync.TEAM_ID, 'name': 'hub-vanguard',
                        'link': {'repo': 'Smarter-Poker-World-Hub'}}
            return {'deployments': []}
        sync.validate_vercel('test-credential-123456', fetch)
        self.assertEqual(len(calls), 2)
        with self.assertRaises(RuntimeError):
            sync.validate_vercel('test-credential-123456', lambda *_: {'id': 'wrong-project'})

    def test_no_shell_or_env_injection_in_credential(self):
        for value in ['x\nOTHER_SECRET=changed', '$(unexpected)', 'a b' * 12]:
            with self.assertRaises(ValueError):
                sync.validate_token_shape(value)

    def test_atomic_configuration_preserves_other_values_owner_mode_and_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            original = b'OTHER_SECRET=unchanged\nVERCEL_TOKEN=old-value\nTHIRD=preserve\n'
            path.write_bytes(original)
            path.chmod(0o600)
            initial = path.stat()
            health = lambda: {'status': 'ok', 'sha': 'current-release', 'container': 'current-container'}
            result = remote['stage_config'](path, 'test-credential-123456', health)
            self.assertTrue(result['runtime_unchanged'])
            self.assertTrue(result['changed'])
            self.assertEqual(path.read_bytes(), original.replace(b'old-value', b'test-credential-123456'))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.stat().st_uid, initial.st_uid)
            self.assertEqual(path.stat().st_gid, initial.st_gid)
            backups = list(path.parent.glob('.env.before-deployment-monitor-*'))
            self.assertEqual(backups[0].read_bytes(), original)
            self.assertFalse(remote['stage_config'](path, 'test-credential-123456', health)['changed'])

    def test_health_failure_restores_exact_previous_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            original = b'VERCEL_TOKEN=old-value\nOTHER=still-present\n'
            path.write_bytes(original)
            path.chmod(0o600)
            values = iter([{'status': 'ok', 'sha': 'old', 'container': 'original'},
                           {'status': 'ok', 'sha': 'new', 'container': 'replacement'}])
            with self.assertRaises(RuntimeError):
                remote['stage_config'](path, 'test-credential-123456', lambda: next(values))
            self.assertEqual(path.read_bytes(), original)

    def test_unhealthy_service_or_exposed_configuration_is_not_changed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            path.write_bytes(b'VERCEL_TOKEN=old-value\n')
            path.chmod(0o600)
            with self.assertRaises(RuntimeError):
                remote['stage_config'](path, 'test-credential-123456', lambda: {'status': 'unhealthy'})
            self.assertEqual(path.read_bytes(), b'VERCEL_TOKEN=old-value\n')
            path.chmod(0o644)
            with self.assertRaises(RuntimeError):
                remote['stage_config'](path, 'test-credential-123456')


if __name__ == '__main__':
    unittest.main()
