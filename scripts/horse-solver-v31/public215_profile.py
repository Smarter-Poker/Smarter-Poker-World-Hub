#!/usr/bin/env python3
"""Dataset profile for the dataset-agnostic public215 one-shot controllers.

Controller tooling only: this file is NOT one of the nine approved pipeline
files and is never pinned in a manifest. Every R7 controller (`*_r7_once.py`)
keeps its own hard-coded R7 identity unchanged; the generic controllers
(`freeze_public215_once.py`, `qualify_public215_once.py`) read the same kind
of identity from one SHA-256-pinned profile file instead, so R8 and later
datasets need no source edit. `R7_PROFILE` records the R7 corrected identity
in this shape so the equivalence is tested, not assumed.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import traceback

FORMAT = 'public215_dataset_profile_v1'
KEYS = {'format', 'dataset_key', 'dataset_id', 'manifest_sha256', 'input_bundle_checksum',
        'pipeline_commit', 'contexts', 'm1_per_context', 'm2_per_context', 'task_folder',
        'manifest_relative', 'model_index_relative', 'm2_terminal_relative',
        'm2_terminal_contract', 'm2_completion_format'}
FIELDS = ('model_checksum', 'template_checksum', 'training_provenance_checksum',
          'model_build_receipt_checksum')
STREET_CARDS = {'flop': 3, 'turn': 4, 'river': 5}
LEGAL_COMBOS = {'flop': 1176, 'turn': 1128, 'river': 1081}
UUID = r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'

# The corrected R7 identity, exactly as hard-coded in qualify_r7_once.py and
# R7's freeze-corrected-models-once.py. Pinned by a test; never edited.
R7_PROFILE = {
    'format': FORMAT,
    'dataset_key': 'horse-v31-public215-independent-20261030-r7-corrected-r1',
    'dataset_id': '187815b1-3701-46c8-8514-93db3cdb6d07',
    'manifest_sha256': 'eb30f11bfdccf8f017270c7e808c56fcc96a47781e52c3ee6d74a6efdcb04a4c',
    'input_bundle_checksum': 'e98fc34ec7a7ffa251c94cb0b31c5e08f9dbd5939b9f594c5d69e162ef79601d',
    'pipeline_commit': '291a8e5658b6a706066b39fba6c75a714f578695',
    'contexts': 107, 'm1_per_context': 57, 'm2_per_context': 8,
    'task_folder': 'mac-v31-public215-r7-corrected-20261030-01a17e88',
    'manifest_relative': 'inputs/manifests/public215-r7-corrected-r1.json',
    'model_index_relative': 'model-builds-final-r1/model-index.json',
    'm2_terminal_relative': 'capture-M2-once/terminal.json',
    'm2_terminal_contract': 'smarter-poker.r7-corrected-M2-capture-terminal.v1',
    'm2_completion_format': 'public215_r7_m2_completion_readback_v1',
}


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


def sha(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None and value != '0' * 64


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
    value = pin['sha256']
    need(isinstance(value, str) and len(value) == 64 and
         all(c in '0123456789abcdef' for c in value), 'VALID_SHA_REQUIRED')
    if expected is not None:
        need(value == expected, 'ORIGINAL_PIN_REQUIRED')
    with regular(pin['path']).open('rb') as f:
        payload = f.read(limit + 1)
    need(len(payload) <= limit and digest(payload) == value, 'PINNED_BYTES_DIFFER')
    return payload


def timestamp(value):
    need(isinstance(value, str), 'TIMESTAMP_REQUIRED')
    stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(stamp.tzinfo is not None, 'UTC_TIMESTAMP_REQUIRED')
    return stamp


def fresh_snapshot(value, now=None):
    age = ((now or datetime.now(timezone.utc)) - timestamp(value)).total_seconds()
    need(0 <= age <= 300, 'FRESH_ROOT_SQL_SNAPSHOT_REQUIRED')


def write_new(directory, name, value):
    payload = canonical({**value, 'observed_at': datetime.now(timezone.utc).isoformat()})
    with (Path(directory) / name).open('xb') as f:
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    if os.name != 'nt':
        fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def safe_failure(error):
    """Class, frame names and status codes only; never messages, URLs or bodies."""
    clean = lambda value, limit: re.sub(r'[^A-Za-z0-9_.<>-]', '_', value)[:limit]
    result = {'exception_class': clean(type(error).__name__, 80),
              'traceback': [{'basename': clean(Path(f.filename).name, 128),
                             'function': clean(f.name, 80), 'line': f.lineno}
                            for f in traceback.extract_tb(error.__traceback__)[-32:]]}
    if isinstance(error, Refusal) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,127}', str(error)):
        result['refusal_code'] = str(error)
    status = getattr(error, 'status', None)
    result['http_status'] = status if type(status) is int and 100 <= status <= 599 else None
    return result


def _relative(value):
    if not isinstance(value, str) or not value or '\\' in value:
        return False
    path = PurePosixPath(value)
    return (not path.is_absolute() and '..' not in path.parts and '.' not in path.parts
            and not any(x.startswith('.env') for x in path.parts) and str(path) == value)


@dataclass(frozen=True)
class Profile:
    dataset_key: str
    dataset_id: str
    manifest_sha256: str
    input_bundle_checksum: str
    pipeline_commit: str
    contexts: int
    m1_per_context: int
    m2_per_context: int
    task_folder: str
    manifest_relative: str
    model_index_relative: str
    m2_terminal_relative: str
    m2_terminal_contract: str
    m2_completion_format: str

    @property
    def m1_targets(self):
        return self.contexts * self.m1_per_context

    @property
    def m2_targets(self):
        return self.contexts * self.m2_per_context

    def path(self, task, relative):
        return Path(task).joinpath(*PurePosixPath(relative).parts)


def profile_from(value):
    need(isinstance(value, dict) and set(value) == KEYS and value['format'] == FORMAT,
         'EXACT_PROFILE_KEYS')
    need(isinstance(value['dataset_id'], str) and re.fullmatch(UUID, value['dataset_id']) is not None,
         'PROFILE_DATASET_ID')
    need(isinstance(value['dataset_key'], str) and
         re.fullmatch(r'[a-z0-9][a-z0-9.-]{7,127}', value['dataset_key']) is not None,
         'PROFILE_DATASET_KEY')
    need(all(sha(value[k]) for k in ('manifest_sha256', 'input_bundle_checksum')) and
         isinstance(value['pipeline_commit'], str) and
         re.fullmatch(r'[0-9a-f]{40}', value['pipeline_commit']) is not None and
         value['pipeline_commit'] != '0' * 40, 'PROFILE_CHECKSUMS')
    need(all(type(value[k]) is int and 0 < value[k] <= 10000
             for k in ('contexts', 'm1_per_context', 'm2_per_context')), 'PROFILE_CENSUS')
    need(isinstance(value['task_folder'], str) and
         re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{7,127}', value['task_folder']) is not None,
         'PROFILE_TASK_FOLDER')
    need(all(_relative(value[k]) for k in ('manifest_relative', 'model_index_relative',
                                           'm2_terminal_relative')) and
         value['manifest_relative'].startswith('inputs/manifests/'), 'PROFILE_RELATIVE_PATHS')
    need(all(isinstance(value[k], str) and re.fullmatch(r'[a-z0-9][a-z0-9._-]{7,127}', value[k], re.I)
             for k in ('m2_terminal_contract', 'm2_completion_format')), 'PROFILE_FORMAT_NAMES')
    return Profile(**{k: value[k] for k in KEYS - {'format'}})


def load_profile(pin):
    return profile_from(strict_json(pinned(pin, limit=64 * 1024)))


def verify_pipeline(root, raw, profile):
    """Producer bytes named by the manifest; returns the verified source names."""
    need(raw.get('pipeline_commit') == profile.pipeline_commit and
         raw.get('dataset_key') == profile.dataset_key and
         raw.get('input_bundle_checksum') == profile.input_bundle_checksum and
         isinstance(raw.get('pipeline_files'), list) and len(raw['pipeline_files']) == 9,
         'ORIGINAL_PRODUCER_REQUIRED')
    names = set()
    for pin in raw['pipeline_files']:
        name = pin['path']
        need(isinstance(name, str) and
             re.fullmatch(r'scripts/horse-solver-v31/[A-Za-z0-9_.-]+', name) is not None and
             name not in names, 'SOURCE_PIN_PATH')
        names.add(name)
        pinned({'path': str(Path(root).joinpath(*name.split('/'))), 'sha256': pin['checksum']},
               limit=16 * 1024 * 1024)
    return names
