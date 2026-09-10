"""Narrow HMAC client for the V31 solver ingress gateway.

Solver hosts never receive a Supabase service-role credential. Each host gets
one independently attributed HMAC key and can invoke only its fixed operation
set. Network retries use a new nonce while retaining the exact operation body;
the database functions provide operation-level idempotency.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from contract import ContractError, _json_bytes


PROTOCOL = "smarter-poker.horse-solver-v31-ingress.v1"
MAX_BODY_BYTES = 4 * 1024 * 1024
OPERATIONS = {
    "M1": {"dataset_contract", "worker_heartbeat", "ingest_artifact"},
    "M2": {"dataset_contract", "worker_heartbeat", "ingest_artifact"},
    "COMPACTOR": {
        "dataset_contract",
        "register_dataset",
        "build_cell",
        "seal_dataset",
        "compact_heartbeat",
        "certification_status",
    },
}


class GatewayError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def decode_success_response(raw: bytes, operation: str) -> Any:
    """Decode one exact gateway success envelope without JSON ambiguity."""

    try:
        decoded = _json_bytes(raw, "gateway response")
    except ContractError as error:
        raise GatewayError("gateway returned invalid strict JSON") from error
    if (
        not isinstance(decoded, dict)
        or set(decoded) != {"success", "operation", "result"}
        or decoded.get("success") is not True
        or decoded.get("operation") != operation
    ):
        raise GatewayError("gateway returned an invalid success envelope")
    return decoded["result"]


def decode_error_response(raw: bytes, status: int) -> str:
    """Return only the bounded message from one exact gateway error envelope."""

    try:
        decoded = _json_bytes(raw, "gateway error response")
    except ContractError:
        return f"HTTP {status}"
    if (
        not isinstance(decoded, dict)
        or set(decoded) != {"success", "error"}
        or decoded.get("success") is not False
        or not isinstance(decoded.get("error"), str)
        or not decoded["error"]
    ):
        return f"HTTP {status}"
    return decoded["error"][:500]


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def signature_message(principal: str, timestamp: str, nonce: str, body_sha256: str) -> bytes:
    return "\n".join((PROTOCOL, principal, timestamp, nonce, body_sha256)).encode("utf-8")


def sign_request(
    secret: bytes, principal: str, timestamp: str, nonce: str, body_sha256: str
) -> str:
    return hmac.new(
        secret,
        signature_message(principal, timestamp, nonce, body_sha256),
        hashlib.sha256,
    ).hexdigest()


def decode_secret(value: str) -> bytes:
    text = str(value or "").strip().lower()
    if len(text) != 64 or text == "0" * 64:
        raise GatewayError("HORSE_SOLVER_V31_HMAC_SECRET must be a nonzero 32-byte hex key")
    try:
        secret = bytes.fromhex(text)
    except ValueError as error:
        raise GatewayError("HORSE_SOLVER_V31_HMAC_SECRET is not hex") from error
    if len(secret) != 32:
        raise GatewayError("HORSE_SOLVER_V31_HMAC_SECRET must decode to 32 bytes")
    return secret


@dataclass(frozen=True)
class GatewayClient:
    endpoint: str
    principal: str
    secret: bytes
    provenance: dict[str, str]
    timeout_seconds: float = 30.0
    attempts: int = 3

    @classmethod
    def from_environment(
        cls,
        principal: str,
        provenance: dict[str, str],
        environment: dict[str, str] | None = None,
    ) -> "GatewayClient":
        env = environment if environment is not None else os.environ
        endpoint = str(env.get("HORSE_SOLVER_V31_GATEWAY_URL", "")).strip()
        parsed = urlparse(endpoint)
        allow_http = env.get("HORSE_SOLVER_V31_ALLOW_HTTP") == "1"
        if (
            not endpoint
            or parsed.scheme not in ({"https", "http"} if allow_http else {"https"})
            or not parsed.netloc
            or parsed.username
            or parsed.password
            or parsed.fragment
        ):
            raise GatewayError("HORSE_SOLVER_V31_GATEWAY_URL must be an approved HTTPS endpoint")
        if principal not in OPERATIONS:
            raise GatewayError("solver gateway principal is invalid")
        return cls(
            endpoint=endpoint,
            principal=principal,
            secret=decode_secret(env.get("HORSE_SOLVER_V31_HMAC_SECRET", "")),
            provenance=dict(provenance),
        )

    def _body(self, operation: str, payload: dict[str, Any]) -> bytes:
        if operation not in OPERATIONS[self.principal]:
            raise GatewayError(f"{self.principal} cannot invoke {operation}")
        if not isinstance(payload, dict):
            raise GatewayError("gateway payload must be an object")
        body = canonical_json(
            {
                "contract": PROTOCOL,
                "principal": self.principal,
                "operation": operation,
                "provenance": self.provenance,
                "payload": payload,
            }
        )
        if not 2 <= len(body) <= MAX_BODY_BYTES:
            raise GatewayError(f"gateway body exceeds {MAX_BODY_BYTES} bytes")
        return body

    def call(
        self,
        operation: str,
        payload: dict[str, Any],
        *,
        timeout_seconds: float | None = None,
    ) -> Any:
        body = self._body(operation, payload)
        request_timeout = self.timeout_seconds if timeout_seconds is None else timeout_seconds
        if not 0 < request_timeout <= 300:
            raise GatewayError("gateway timeout must be between 0 and 300 seconds")
        body_sha256 = hashlib.sha256(body).hexdigest()
        last_error: Exception | None = None
        for attempt in range(max(1, self.attempts)):
            timestamp = str(int(time.time()))
            nonce = str(uuid.uuid4())
            signature = sign_request(
                self.secret, self.principal, timestamp, nonce, body_sha256
            )
            request = Request(
                self.endpoint,
                data=body,
                method="POST",
                headers={
                    "Content-Type": "application/json; charset=utf-8",
                    "Content-Length": str(len(body)),
                    "X-SP-V31-Principal": self.principal,
                    "X-SP-V31-Timestamp": timestamp,
                    "X-SP-V31-Nonce": nonce,
                    "X-SP-V31-Content-SHA256": body_sha256,
                    "X-SP-V31-Signature": signature,
                    "User-Agent": "smarter-poker-v31-solver/1",
                },
            )
            try:
                with urlopen(request, timeout=request_timeout) as response:
                    raw = response.read(MAX_BODY_BYTES + 1)
                if len(raw) > MAX_BODY_BYTES:
                    raise GatewayError("gateway response exceeds the client limit")
                return decode_success_response(raw, operation)
            except HTTPError as error:
                raw = error.read(4096)
                last_error = GatewayError(
                    decode_error_response(raw, error.code), error.code
                )
                if error.code not in {429, 500, 502, 503, 504}:
                    raise last_error
            except (URLError, TimeoutError, OSError) as error:
                last_error = error
            if attempt + 1 < max(1, self.attempts):
                time.sleep(min(4.0, 0.5 * (2**attempt)))
        if isinstance(last_error, GatewayError):
            raise last_error
        raise GatewayError(f"gateway request failed: {last_error}") from last_error
