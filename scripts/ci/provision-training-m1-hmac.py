#!/usr/bin/env python3
"""Rotate the production M1 worker HMAC and seal it to M1's public key.

This helper is intentionally usable only from the protected, manual GitHub
Actions workflow that owns it.  The plaintext exists only in this process and
in the TLS request body sent to Vercel.  The only retained payload is the
RSA-OAEP ciphertext plus a receipt containing non-secret metadata.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import resource
import secrets
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Sequence
from urllib import error, parse, request


PROJECT_ID = "prj_op66GkZyZcygXQKm76iyycfVFAQx"
TEAM_ID = "team_SVD8r7AOPH065G3usBxVvrBc"
SECRET_KEY = "SOLVER_WORKER_M1_HMAC_SECRET"
MAIN_REF = "refs/heads/main"
ARTIFACT_DIRECTORY_NAME = "phase6-m1-hmac"
CIPHERTEXT_FILENAME = "m1-hmac.oaep-sha256.bin"
RECEIPT_FILENAME = "receipt.json"
RSA_ENCRYPTION_OID_DER = bytes.fromhex("06092a864886f70d010101")
HEX_RE = re.compile(r"^[0-9a-f]{64}$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
REQUEST_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{7,63}$")
ROTATION_CONFIRMATION = "M1_PHASE6_ROTATE_ONCE"


class ProvisionError(RuntimeError):
    """An expected fail-closed provisioning error safe to show in logs."""


@dataclass(frozen=True)
class Config:
    expected_commit: str
    github_sha: str
    github_ref: str
    github_run_id: str
    github_run_attempt: str
    request_id: str
    token: str
    project_id: str
    team_id: str
    public_key_spki: bytes
    public_key_fingerprint: str
    artifact_dir: Path
    github_output: Path | None


def _read_tlv(data: bytes, offset: int) -> tuple[int, bytes, int]:
    if offset >= len(data):
        raise ProvisionError("public key is truncated")
    tag = data[offset]
    offset += 1
    if offset >= len(data):
        raise ProvisionError("public key length is truncated")
    first = data[offset]
    offset += 1
    if first & 0x80:
        count = first & 0x7F
        if count == 0 or count > 4 or offset + count > len(data):
            raise ProvisionError("public key has an invalid DER length")
        if data[offset] == 0:
            raise ProvisionError("public key has a non-canonical DER length")
        length = int.from_bytes(data[offset : offset + count], "big")
        if length < 128:
            raise ProvisionError("public key has a non-canonical DER length")
        offset += count
    else:
        length = first
    end = offset + length
    if end > len(data):
        raise ProvisionError("public key value is truncated")
    return tag, data[offset:end], end


def _read_positive_integer(data: bytes, offset: int) -> tuple[int, int]:
    tag, value, end = _read_tlv(data, offset)
    if tag != 0x02 or not value:
        raise ProvisionError("public key contains an invalid RSA integer")
    if value[0] & 0x80:
        raise ProvisionError("public key contains a negative RSA integer")
    if len(value) > 1 and value[0] == 0 and not (value[1] & 0x80):
        raise ProvisionError("public key contains a non-canonical RSA integer")
    return int.from_bytes(value, "big"), end


def validate_rsa_4096_spki(spki: bytes, expected_fingerprint: str) -> None:
    if not HEX_RE.fullmatch(expected_fingerprint):
        raise ProvisionError("public-key fingerprint must be 64 lowercase hexadecimal characters")
    if len(spki) < 512 or len(spki) > 1024:
        raise ProvisionError("public key has an impossible RSA-4096 SPKI size")
    actual_fingerprint = hashlib.sha256(spki).hexdigest()
    if not hmac.compare_digest(actual_fingerprint, expected_fingerprint):
        raise ProvisionError("public-key SPKI fingerprint does not match")

    tag, outer, end = _read_tlv(spki, 0)
    if tag != 0x30 or end != len(spki):
        raise ProvisionError("public key is not one canonical SPKI sequence")
    algorithm_tag, algorithm, cursor = _read_tlv(outer, 0)
    if algorithm_tag != 0x30:
        raise ProvisionError("public key has no SPKI algorithm identifier")
    oid_tag, oid, algorithm_cursor = _read_tlv(algorithm, 0)
    if oid_tag != 0x06 or bytes([oid_tag, len(oid)]) + oid != RSA_ENCRYPTION_OID_DER:
        raise ProvisionError("public key is not rsaEncryption SPKI")
    if algorithm_cursor < len(algorithm):
        null_tag, null_value, algorithm_cursor = _read_tlv(algorithm, algorithm_cursor)
        if null_tag != 0x05 or null_value:
            raise ProvisionError("public key has an invalid RSA algorithm parameter")
    if algorithm_cursor != len(algorithm):
        raise ProvisionError("public key has trailing algorithm data")

    bit_tag, bit_string, cursor = _read_tlv(outer, cursor)
    if bit_tag != 0x03 or not bit_string or bit_string[0] != 0 or cursor != len(outer):
        raise ProvisionError("public key has an invalid SPKI bit string")
    rsa_tag, rsa_sequence, rsa_end = _read_tlv(bit_string[1:], 0)
    if rsa_tag != 0x30 or rsa_end != len(bit_string) - 1:
        raise ProvisionError("public key has an invalid RSA sequence")
    modulus, rsa_cursor = _read_positive_integer(rsa_sequence, 0)
    exponent, rsa_cursor = _read_positive_integer(rsa_sequence, rsa_cursor)
    if rsa_cursor != len(rsa_sequence):
        raise ProvisionError("public key has trailing RSA data")
    if modulus.bit_length() != 4096:
        raise ProvisionError("public key must be RSA-4096")
    if exponent < 3 or exponent % 2 == 0:
        raise ProvisionError("public key has an invalid RSA exponent")


def _strict_base64(value: str) -> bytes:
    if not value or len(value) > 16_384 or re.search(r"\s", value):
        raise ProvisionError("public-key SPKI must be one bounded base64 value")
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ProvisionError("public-key SPKI is not strict base64") from exc


def load_config(env: Mapping[str, str]) -> Config:
    expected_commit = env.get("EXPECTED_COMMIT", "")
    github_sha = env.get("GITHUB_SHA", "")
    github_ref = env.get("GITHUB_REF", "")
    project_id = env.get("VERCEL_PROJECT_ID", "")
    team_id = env.get("VERCEL_ORG_ID", "")
    token = env.get("VERCEL_TOKEN", "")
    fingerprint = env.get("M1_PUBLIC_KEY_SPKI_SHA256", "")
    request_id = env.get("PHASE6_REQUEST_ID", "")

    if github_ref != MAIN_REF:
        raise ProvisionError("workflow must be dispatched from refs/heads/main")
    if not COMMIT_RE.fullmatch(expected_commit) or not COMMIT_RE.fullmatch(github_sha):
        raise ProvisionError("expected commit and GitHub SHA must be full lowercase commit IDs")
    if not hmac.compare_digest(expected_commit, github_sha):
        raise ProvisionError("expected commit is not the current workflow-dispatch main commit")
    if not REQUEST_ID_RE.fullmatch(request_id):
        raise ProvisionError("request ID has an invalid shape")
    if not hmac.compare_digest(env.get("PHASE6_ROTATION_CONFIRM", ""), ROTATION_CONFIRMATION):
        raise ProvisionError("one-time rotation acknowledgement is invalid")
    if project_id != PROJECT_ID or team_id != TEAM_ID:
        raise ProvisionError("Vercel project or team identity is not canonical hub-vanguard")
    if not token:
        raise ProvisionError("the protected Vercel token is unavailable")

    public_key = _strict_base64(env.get("M1_PUBLIC_KEY_SPKI_B64", ""))
    validate_rsa_4096_spki(public_key, fingerprint)

    runner_temp_raw = env.get("RUNNER_TEMP", "")
    if not runner_temp_raw:
        raise ProvisionError("RUNNER_TEMP is unavailable")
    runner_temp = Path(runner_temp_raw).resolve()
    if not runner_temp.is_dir():
        raise ProvisionError("RUNNER_TEMP is not a directory")
    artifact_dir = (runner_temp / ARTIFACT_DIRECTORY_NAME).resolve()
    if artifact_dir.parent != runner_temp:
        raise ProvisionError("artifact directory escaped RUNNER_TEMP")

    output_raw = env.get("GITHUB_OUTPUT", "")
    github_output = Path(output_raw) if output_raw else None
    return Config(
        expected_commit=expected_commit,
        github_sha=github_sha,
        github_ref=github_ref,
        github_run_id=env.get("GITHUB_RUN_ID", "unknown"),
        github_run_attempt=env.get("GITHUB_RUN_ATTEMPT", "unknown"),
        request_id=request_id,
        token=token,
        project_id=project_id,
        team_id=team_id,
        public_key_spki=public_key,
        public_key_fingerprint=fingerprint,
        artifact_dir=artifact_dir,
        github_output=github_output,
    )


def _targets(value: Any) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value,)
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return tuple(sorted(value))
    raise ProvisionError("Vercel environment target metadata is invalid")


def safe_metadata(entry: Mapping[str, Any]) -> dict[str, Any]:
    entry_id = entry.get("id")
    key = entry.get("key")
    env_type = entry.get("type")
    if not all(isinstance(item, str) and item for item in (entry_id, key, env_type)):
        raise ProvisionError("Vercel environment metadata is incomplete")
    return {
        "id": entry_id,
        "key": key,
        "target": list(_targets(entry.get("target"))),
        "type": env_type,
        "gitBranch": entry.get("gitBranch"),
        "updatedAt": entry.get("updatedAt"),
    }


def select_target(entries: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    safe_entries = [safe_metadata(entry) for entry in entries]
    ids = [entry["id"] for entry in safe_entries]
    if len(ids) != len(set(ids)):
        raise ProvisionError("Vercel environment metadata contains duplicate IDs")
    matches = [entry for entry in safe_entries if entry["key"] == SECRET_KEY]
    if len(matches) != 1:
        raise ProvisionError("expected exactly one M1 HMAC environment entry")
    target = matches[0]
    if target["target"] != ["production"]:
        raise ProvisionError("M1 HMAC environment entry must target production only")
    if target["gitBranch"] is not None:
        raise ProvisionError("M1 HMAC environment entry must not be branch-scoped")
    if target["type"].lower() != "sensitive":
        raise ProvisionError("M1 HMAC environment entry must be Vercel Sensitive")
    return target


def _timestamp(value: Any) -> float:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError as exc:
            raise ProvisionError("Vercel environment updatedAt is invalid") from exc
    raise ProvisionError("Vercel environment updatedAt is missing")


def verify_after(before_entries: Sequence[Mapping[str, Any]], after_entries: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    before_safe = {entry["id"]: entry for entry in map(safe_metadata, before_entries)}
    after_safe = {entry["id"]: entry for entry in map(safe_metadata, after_entries)}
    if set(before_safe) != set(after_safe):
        raise ProvisionError("Vercel environment entry inventory changed during rotation")
    before_target = select_target(before_entries)
    after_target = select_target(after_entries)
    if before_target["id"] != after_target["id"]:
        raise ProvisionError("M1 HMAC environment identity changed during rotation")

    target_id = before_target["id"]
    for entry_id in before_safe:
        if entry_id == target_id:
            before_shape = {k: v for k, v in before_safe[entry_id].items() if k != "updatedAt"}
            after_shape = {k: v for k, v in after_safe[entry_id].items() if k != "updatedAt"}
            if before_shape != after_shape:
                raise ProvisionError("M1 HMAC environment scope changed during rotation")
        elif before_safe[entry_id] != after_safe[entry_id]:
            raise ProvisionError("an unrelated Vercel environment entry changed during rotation")
    if _timestamp(after_target["updatedAt"]) <= _timestamp(before_target["updatedAt"]):
        raise ProvisionError("M1 HMAC environment updatedAt did not advance")
    return after_target


class VercelApi:
    def __init__(self, token: str, project_id: str, team_id: str, opener: Callable[..., Any] = request.urlopen):
        self._token = token
        self._project_id = project_id
        self._team_id = team_id
        self._opener = opener

    def _request(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None = None,
        raw_body: bytearray | None = None,
    ) -> Any:
        url = f"https://api.vercel.com{path}"
        if payload is not None and raw_body is not None:
            raise ProvisionError("Vercel request supplied two bodies")
        body = raw_body if raw_body is not None else (
            None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        )
        req = request.Request(
            url,
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        try:
            response = self._opener(req, timeout=20)
            with response:
                if method == "PATCH":
                    while response.read(64 * 1024):
                        pass
                    return None
                return json.load(response)
        except error.HTTPError as exc:
            exc.close()
            raise ProvisionError(f"Vercel {method} request failed with HTTP {exc.code}") from None
        except (error.URLError, TimeoutError, OSError):
            raise ProvisionError(f"Vercel {method} request transport failed") from None

    def list_entries(self) -> list[Mapping[str, Any]]:
        query = parse.urlencode({"teamId": self._team_id, "limit": "100"})
        payload = self._request("GET", f"/v10/projects/{self._project_id}/env?{query}")
        if not isinstance(payload, Mapping):
            raise ProvisionError("Vercel environment metadata response is invalid")
        pagination = payload.get("pagination")
        if isinstance(pagination, Mapping) and pagination.get("next") not in (None, ""):
            raise ProvisionError("Vercel environment inventory exceeded the bounded metadata page")
        entries = payload.get("envs", payload.get("env"))
        if not isinstance(entries, list) or not entries:
            raise ProvisionError("Vercel returned no environment metadata")
        if not all(isinstance(entry, Mapping) for entry in entries):
            raise ProvisionError("Vercel returned malformed environment metadata")
        return entries

    def patch_value(self, entry_id: str, secret_value: bytearray) -> None:
        quoted_id = parse.quote(entry_id, safe="")
        query = parse.urlencode({"teamId": self._team_id})
        body = bytearray(b'{"value":"')
        body.extend(secret_value)
        body.extend(b'"}')
        try:
            self._request(
                "PATCH",
                f"/v9/projects/{self._project_id}/env/{quoted_id}?{query}",
                raw_body=body,
            )
        finally:
            for index in range(len(body)):
                body[index] = 0


def _new_secret(random_bytes: Callable[[int], bytes]) -> bytearray:
    raw = bytearray(random_bytes(32))
    if len(raw) != 32:
        raise ProvisionError("cryptographic random source returned the wrong length")
    alphabet = b"0123456789abcdef"
    encoded = bytearray(64)
    for index, value in enumerate(raw):
        encoded[index * 2] = alphabet[value >> 4]
        encoded[index * 2 + 1] = alphabet[value & 0x0F]
    for index in range(len(raw)):
        raw[index] = 0
    return encoded


def encrypt_oaep_sha256(public_key_spki: bytes, plaintext: bytearray) -> bytes:
    openssl = shutil.which("openssl")
    if not openssl or not os.path.isabs(openssl):
        raise ProvisionError("OpenSSL is unavailable")
    with tempfile.TemporaryDirectory(prefix="phase6-m1-key-") as directory:
        key_path = Path(directory) / "m1-public-key.der"
        descriptor = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            os.write(descriptor, public_key_spki)
        finally:
            os.close(descriptor)
        child_env = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}
        process = subprocess.Popen(
            [
                openssl,
                "pkeyutl",
                "-encrypt",
                "-pubin",
                "-keyform",
                "DER",
                "-inkey",
                str(key_path),
                "-pkeyopt",
                "rsa_padding_mode:oaep",
                "-pkeyopt",
                "rsa_oaep_md:sha256",
                "-pkeyopt",
                "rsa_mgf1_md:sha256",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=child_env,
        )
        ciphertext, _stderr = process.communicate(plaintext)
        if process.returncode != 0:
            raise ProvisionError("OpenSSL rejected the validated RSA public key")
    if len(ciphertext) != 512:
        raise ProvisionError("RSA-4096 encryption returned an unexpected ciphertext length")
    return ciphertext


def _write_exclusive(path: Path, payload: bytes) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(descriptor, payload)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _write_receipt(path: Path, receipt: Mapping[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    payload = (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode("utf-8")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(descriptor, payload)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.replace(temporary, path)


def _mark_ciphertext_created(output_path: Path | None) -> None:
    if output_path is None:
        return
    with output_path.open("a", encoding="utf-8") as stream:
        stream.write("ciphertext_created=true\n")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def provision(
    config: Config,
    api: Any,
    *,
    random_bytes: Callable[[int], bytes] = secrets.token_bytes,
    encryptor: Callable[[bytes, bytearray], bytes] = encrypt_oaep_sha256,
    now: Callable[[], str] = _utc_now,
) -> dict[str, Any]:
    before_entries = api.list_entries()
    before_target = select_target(before_entries)
    if config.artifact_dir.exists():
        raise ProvisionError("artifact directory already exists")

    secret = _new_secret(random_bytes)
    receipt: dict[str, Any] | None = None
    receipt_path: Path | None = None
    try:
        ciphertext = encryptor(config.public_key_spki, secret)
        if not isinstance(ciphertext, bytes) or len(ciphertext) != 512:
            raise ProvisionError("encryptor did not return one RSA-4096 ciphertext")

        config.artifact_dir.mkdir(mode=0o700)
        ciphertext_path = config.artifact_dir / CIPHERTEXT_FILENAME
        receipt_path = config.artifact_dir / RECEIPT_FILENAME
        _write_exclusive(ciphertext_path, ciphertext)
        receipt = {
            "schemaVersion": 1,
            "operation": "phase6_m1_hmac_rotation",
            "status": "ciphertext_ready",
            "expectedCommit": config.expected_commit,
            "githubRunId": config.github_run_id,
            "githubRunAttempt": config.github_run_attempt,
            "requestId": config.request_id,
            "projectId": config.project_id,
            "teamId": config.team_id,
            "environmentVariableId": before_target["id"],
            "publicKeySpkiSha256": config.public_key_fingerprint,
            "ciphertext": {
                "filename": CIPHERTEXT_FILENAME,
                "bytes": len(ciphertext),
                "sha256": hashlib.sha256(ciphertext).hexdigest(),
                "algorithm": "RSA-4096-OAEP-SHA256-MGF1-SHA256",
            },
            "updatedAtBefore": before_target["updatedAt"],
            "plaintextPersisted": False,
            "deploymentTriggered": False,
            "recordedAt": now(),
        }
        _write_receipt(receipt_path, receipt)
        _mark_ciphertext_created(config.github_output)

        try:
            receipt["status"] = "mutation_in_progress"
            receipt["recordedAt"] = now()
            _write_receipt(receipt_path, receipt)
            api.patch_value(before_target["id"], secret)
            after_entries = api.list_entries()
            after_target = verify_after(before_entries, after_entries)
        except Exception:
            receipt["status"] = "mutation_unverified"
            receipt["recordedAt"] = now()
            _write_receipt(receipt_path, receipt)
            raise

        receipt["status"] = "complete"
        receipt["updatedAtAfter"] = after_target["updatedAt"]
        receipt["recordedAt"] = now()
        _write_receipt(receipt_path, receipt)
        final_files = sorted(path.name for path in config.artifact_dir.iterdir())
        if final_files != [CIPHERTEXT_FILENAME, RECEIPT_FILENAME]:
            raise ProvisionError("artifact directory contains an unexpected file")
        return receipt
    finally:
        for index in range(len(secret)):
            secret[index] = 0


def main() -> int:
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    try:
        config = load_config(os.environ)
        api = VercelApi(config.token, config.project_id, config.team_id)
        receipt = provision(config, api)
        print(
            "PHASE6_M1_HMAC_ROTATION_COMPLETE "
            f"env_id={receipt['environmentVariableId']} "
            f"ciphertext_sha256={receipt['ciphertext']['sha256']}"
        )
        return 0
    except ProvisionError as exc:
        print(f"PHASE6_M1_HMAC_ROTATION_FAILED: {exc}", file=sys.stderr)
        return 1
    except Exception:
        print("PHASE6_M1_HMAC_ROTATION_FAILED: unexpected fail-closed error", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
