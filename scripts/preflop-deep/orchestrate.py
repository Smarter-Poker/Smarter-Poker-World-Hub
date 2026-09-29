"""
SMARTER-POKER SOLVER ORCHESTRATOR  (launch once; runs until every phase is done)
================================================================================
One command per machine. Self-tests, then works through the immutable manifest
verified and injected by the launcher. Each phase carries its OWN
game config -> pot_chips (antes), eff_chips (blind depth), rake (cash vs
tournament), ranges (format/depth) -> so cash and tournament and each stack solve
completely different games. Per flop solve it also harvests the turn rows off the
same tree. Sends one checksummed artifact at a time through the signed worker
gateway (deletes nothing; resumable; 2-machine auto-split; bounded heartbeat).

This module is not a standalone launcher. run_machine.py injects the approved
UPI transport and range-weighted EV reader, then calls main(). The range files
must be independently approved 1326-combo artifacts in RANGE_DIRECTORY; the
research-only make_ranges.py output is not accepted.
"""
import sys, os, json, time, datetime, hashlib, hmac, math, re, tempfile, uuid
import urllib.error, urllib.parse, urllib.request
import pio_harvest as h

MID = sys.argv[1] if len(sys.argv) > 1 else "M1"
NUM = int(sys.argv[2]) if len(sys.argv) > 2 else 2
IDX = int(sys.argv[3]) if len(sys.argv) > 3 else 0
if MID not in ("M1", "M2"):
    raise SystemExit("machine id must be M1 or M2")
if NUM < 1 or IDX < 0 or IDX >= NUM:
    raise SystemExit("worker partition must satisfy NUM >= 1 and 0 <= IDX < NUM")
extra_arguments = sys.argv[4:]
if not extra_arguments:
    RUN_MODE = "backlog"
elif extra_arguments == ["--canary"]:
    RUN_MODE = "canary"
else:
    raise SystemExit("usage: run_machine.py M1|M2 NUM IDX [--canary]")

# Solver hosts are untrusted producers, not database clients. Any direct
# Supabase/Postgres configuration creates an unsafe mixed mode, even if the
# scoped signed gateway is also configured.
# remove SUPABASE_SERVICE_ROLE_KEY; solver workers must use scoped signed ingestion
LEGACY_DATABASE_ENV = (
    "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_KEY",
    "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_DB_URL",
    "SUPABASE_CONNECTION_POOL_URL", "SUPABASE_DB_HOST", "SUPABASE_DB_PORT",
    "SUPABASE_DB_USER", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_NAME",
    "SUPABASE_DB_SSL", "SUPABASE_DB_CA", "SUPABASE_JWT_SECRET",
    "SUPABASE_PROJECT_REF", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY",
    "FALLBACK_SUPABASE_URL", "SUPABASE_URL_FALLBACK", "SUPABASE_URL_WITH_PASS",
    "DATABASE_URL", "DIRECT_URL",
    "POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING",
    "POSTGRES_PASSWORD", "PG_PASSWORD", "PGHOST", "PGPORT", "PGDATABASE",
    "PGUSER", "PGPASSWORD",
)
configured_legacy_database_env = [
    name for name in LEGACY_DATABASE_ENV if os.environ.get(name, "").strip()
]
if configured_legacy_database_env:
    raise SystemExit(
        "remove direct database configuration (%s); solver workers must use scoped signed ingestion"
        % ",".join(configured_legacy_database_env)
    )
WORKER_API_URL = os.environ.get("SOLVER_WORKER_API_URL", "").strip()
WORKER_HMAC_SECRET_HEX = os.environ.get("SOLVER_WORKER_HMAC_SECRET", "").strip()
parsed_worker_url = urllib.parse.urlsplit(WORKER_API_URL)
if (parsed_worker_url.scheme != "https"
        or parsed_worker_url.netloc != "smarter.poker"
        or parsed_worker_url.username is not None
        or parsed_worker_url.password is not None
        or parsed_worker_url.path.rstrip("/") != "/api/training/solver-worker"
        or parsed_worker_url.query
        or parsed_worker_url.fragment):
    raise SystemExit("SOLVER_WORKER_API_URL must be the exact HTTPS solver-worker endpoint")
if (len(WORKER_HMAC_SECRET_HEX) != 64
        or any(c not in "0123456789abcdef" for c in WORKER_HMAC_SECRET_HEX)):
    raise SystemExit("SOLVER_WORKER_HMAC_SECRET must be one distinct 32-byte lowercase hex key")
WORKER_HMAC_SECRET = bytes.fromhex(WORKER_HMAC_SECRET_HEX)
WORKER_PROTOCOL = "smarter-poker.solver-worker.v2"
WORKER_MAX_BODY_BYTES = 2 * 1024 * 1024
WORKER_MAX_RESPONSE_BYTES = 4 * 1024 * 1024


class WorkerGatewayError(RuntimeError):
    """Fatal signed-gateway failure; continuing could waste unpersisted solves."""


class _NoWorkerRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward worker identity or HMAC headers to another origin (or
        # even another URL on the same origin). Operators must update the
        # checksum-pinned client when the canonical endpoint changes.
        return None

WORKER_HTTP = urllib.request.build_opener(_NoWorkerRedirects())
PIPELINE_COMMIT = os.environ.get("PIPELINE_COMMIT", "").strip().lower()
PIO_SOLVER_VERSION = os.environ.get("PIO_SOLVER_VERSION", "").strip()
PIO_BINARY_CHECKSUM = os.environ.get("PIO_BINARY_CHECKSUM", "").strip().lower()
APPROVED_MANIFEST_CHECKSUM = os.environ.get("APPROVED_MANIFEST_CHECKSUM", "").strip().lower()
RANGE_DIRECTORY = os.environ.get("RANGE_DIRECTORY", "").strip()
if len(PIPELINE_COMMIT) != 40 or any(c not in "0123456789abcdef" for c in PIPELINE_COMMIT):
    raise SystemExit("PIPELINE_COMMIT must pin one exact protected repository commit")
if not PIO_SOLVER_VERSION:
    raise SystemExit("PIO_SOLVER_VERSION is required for certifiable exports")
if len(PIO_BINARY_CHECKSUM) != 64 or any(c not in "0123456789abcdef" for c in PIO_BINARY_CHECKSUM):
    raise SystemExit("PIO_BINARY_CHECKSUM must identify the approved executable bytes")
if len(APPROVED_MANIFEST_CHECKSUM) != 64 or any(c not in "0123456789abcdef" for c in APPROVED_MANIFEST_CHECKSUM):
    raise SystemExit("APPROVED_MANIFEST_CHECKSUM must pin the exact approved manifest bytes")
if not RANGE_DIRECTORY:
    raise SystemExit("RANGE_DIRECTORY must point to the approved solver range artifacts")
APPROVED_MANIFEST_BYTES = None  # Set only by the checksum-pinned launcher.
ACTIVE_ADMISSION_MODE = None  # Set only after the exact manifest validates.

# Injected only by the pinned run_machine.py launcher. Direct execution fails
# before any solve or write, which prevents an ad-hoc transport from bypassing
# the self-test and manifest checksum gates.
def pio(cmd):
    raise NotImplementedError("wire to your PioSOLVER UPI wrapper -> full command output")
def read_results():
    """Return (ev_oop_bb, ev_ip_bb, exploitability_chips) from calc_results."""
    raise NotImplementedError("return (ev_oop_bb, ev_ip_bb, exploit_pct)")
# ===================================================


def _worker_envelope(operation, payload, manifest_version, manifest_checksum):
    if ACTIVE_ADMISSION_MODE not in ("backlog", "bounded_canary"):
        raise RuntimeError(
            "solver worker admission mode is unavailable before manifest validation"
        )
    return {
        "protocol": WORKER_PROTOCOL,
        "operation": operation,
        "worker": {
            "machine_id": MID,
            "solver_version": PIO_SOLVER_VERSION,
            "solver_binary_checksum": PIO_BINARY_CHECKSUM,
            "pipeline_commit": PIPELINE_COMMIT,
            "manifest_version": str(manifest_version),
            "manifest_checksum": manifest_checksum,
            "admission_mode": ACTIVE_ADMISSION_MODE,
        },
        "payload": payload,
    }

def _worker_request(operation, payload, manifest_version, manifest_checksum):
    """Send one bounded, signed request without exposing a database credential.

    Artifact retries deliberately reuse the exact nonce and bytes: a response
    can be lost after commit, and the database RPC returns the durable receipt
    for that identical replay. Metadata operations are not retried here because
    their nonce is consumed before execution; the next polling cycle is safe.
    """
    envelope = _worker_envelope(operation, payload, manifest_version, manifest_checksum)
    body = json.dumps(
        envelope, sort_keys=True, separators=(",", ":"),
        ensure_ascii=False, allow_nan=False,
    ).encode("utf-8")
    if len(body) > WORKER_MAX_BODY_BYTES:
        raise ValueError("signed solver worker request exceeds the 2 MiB limit")
    timestamp = str(int(time.time()))
    nonce = str(uuid.uuid4())
    body_sha256 = hashlib.sha256(body).hexdigest()
    signature_message = "\n".join(
        (WORKER_PROTOCOL, MID, timestamp, nonce, body_sha256)
    ).encode("utf-8")
    signature = hmac.new(WORKER_HMAC_SECRET, signature_message, hashlib.sha256).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "Content-Encoding": "identity",
        "X-SP-Solver-Worker": MID,
        "X-SP-Solver-Timestamp": timestamp,
        "X-SP-Solver-Nonce": nonce,
        "X-SP-Solver-Content-SHA256": body_sha256,
        "X-SP-Solver-Signature": signature,
        "User-Agent": "SmarterPokerSolverWorker/2",
    }
    attempts = 3 if operation == "ingest_artifact" else 1
    last_error = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                WORKER_API_URL, data=body, headers=headers, method="POST"
            )
            with WORKER_HTTP.open(request, timeout=90) as response:
                raw_response = response.read(WORKER_MAX_RESPONSE_BYTES + 1)
                if len(raw_response) > WORKER_MAX_RESPONSE_BYTES:
                    raise WorkerGatewayError("solver worker gateway response exceeds its bound")
                if response.status != 200:
                    raise WorkerGatewayError("solver worker gateway returned HTTP %d" % response.status)
            try:
                decoded = json.loads(raw_response.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise WorkerGatewayError("solver worker gateway returned invalid JSON") from error
            if (not isinstance(decoded, dict)
                    or decoded.get("success") is not True
                    or decoded.get("operation") != operation):
                raise WorkerGatewayError("solver worker gateway returned an invalid response")
            return decoded
        except urllib.error.HTTPError as error:
            last_error = WorkerGatewayError("solver worker gateway returned HTTP %d" % error.code)
            if error.code < 500 or attempt + 1 >= attempts:
                raise last_error
        except (urllib.error.URLError, TimeoutError) as error:
            last_error = WorkerGatewayError(
                "solver worker gateway transport failed: %s" % getattr(error, "reason", error)
            )
            if attempt + 1 >= attempts:
                raise last_error
        if attempt + 1 < attempts:
            time.sleep(1 << attempt)
    raise last_error or WorkerGatewayError("solver worker gateway request failed")

def fetch_text(name):
    """Re-use the sealed manifest for canary and backlog revalidation."""
    if name != "phases.json":
        raise SystemExit("only the approved phases.json may be read")
    if not isinstance(APPROVED_MANIFEST_BYTES, bytes):
        raise SystemExit("approved manifest bytes must be supplied by the pinned launcher")
    if hashlib.sha256(APPROVED_MANIFEST_BYTES).hexdigest() != APPROVED_MANIFEST_CHECKSUM:
        raise SystemExit("manifest checksum does not match APPROVED_MANIFEST_CHECKSUM")
    return APPROVED_MANIFEST_BYTES.decode("utf-8")

SAFE_TOKEN = re.compile(r"^[A-Za-z0-9_]+$")
CARD = re.compile(r"^[AKQJT98765432][cdhs]$")
RAKE_CONTRACT = re.compile(r"^(?:0|1|0\.\d*[1-9]) (?:0|[1-9][0-9]*)$")
UUID_V4 = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
TRAINING_SOLVER_CONTRACTS = {
    "hu_cash": frozenset((40, 100, 200)),
    "mtt_3max_chipev": frozenset((20,)),
    "mtt_6max_chipev": frozenset((10, 20, 40, 100)),
    "mtt_9max_chipev": frozenset((20, 40, 80, 100)),
    "mtt_hu_chipev": frozenset((40,)),
    "postflop_complete": frozenset((100,)),
    "spin_3max_chipev": frozenset((20, 25)),
    "spin_hu_chipev": frozenset((10, 20)),
}
TRAINING_ICM_CONTRACTS = {
    "mtt_6max_icm": frozenset((20, 40)),
    "mtt_9max_icm": frozenset((40, 60)),
    "spin_3max_icm": frozenset((20, 25)),
    "spin_hu_icm": frozenset((10,)),
}


def canonical_contract_pairs(contract_map):
    return [
        {"game_type": game_type, "stack": stack}
        for game_type in sorted(contract_map)
        for stack in sorted(contract_map[game_type])
    ]


def contract_scope_checksum(contract_pairs):
    payload = json.dumps(
        contract_pairs, sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


PHASE_CONTRACT_SCHEMA = "training-solver-phase-contracts.v1"
PHASE_CONTRACT_FIELDS = (
    "id", "game_type", "stack", "street", "streets", "objective",
    "pot_chips", "eff_chips", "rake", "accuracy_fraction", "ip_range",
    "ip_range_checksum", "oop_range", "oop_range_checksum", "ip_player",
    "oop_player", "harvest",
)


def canonical_phase_contracts(phases):
    """Return the exact phase specs that the 107-game ledger is allowed to use.

    Keeping this projection in one place is intentional: family/stack coverage
    alone is not enough to identify a solve. Street prefix, actor/node targets,
    chip geometry, rake, convergence threshold, and both range artifact hashes
    are all part of the row identity and therefore the protected manifest
    digest.
    """
    if not isinstance(phases, list):
        raise ValueError("phase contract list must be an array")
    contracts = []
    for phase in phases:
        if not isinstance(phase, dict):
            raise ValueError("phase contract must be an object")
        missing = [field for field in PHASE_CONTRACT_FIELDS if field not in phase]
        if missing:
            raise ValueError(
                "phase %s is missing contract fields: %s"
                % (phase.get("id", "<unknown>"), ",".join(missing))
            )
        harvest = phase["harvest"]
        if not isinstance(harvest, list):
            raise ValueError("phase %s harvest must be an array" % phase.get("id"))
        normalized_harvest = []
        for target in harvest:
            if not isinstance(target, dict):
                raise ValueError("phase %s harvest target must be an object" % phase.get("id"))
            normalized_harvest.append({
                "node": target.get("node"),
                "hero": target.get("hero"),
                "position": target.get("position"),
            })
        contract = {field: phase[field] for field in PHASE_CONTRACT_FIELDS}
        contract["harvest"] = sorted(
            normalized_harvest,
            key=lambda target: (str(target["node"]), str(target["hero"]),
                                str(target["position"])),
        )
        contracts.append(contract)
    return sorted(contracts, key=lambda phase: str(phase["id"]))


def phase_contracts_checksum(phases_or_contracts):
    """Hash normalized phase specs with stable JSON bytes and key ordering."""
    contracts = phases_or_contracts
    if (isinstance(phases_or_contracts, list)
            and any(isinstance(item, dict) and "harvest" in item
                    for item in phases_or_contracts)):
        contracts = canonical_phase_contracts(phases_or_contracts)
    payload = json.dumps(
        contracts, sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def canonical_training_game_ids():
    """The immutable 107-card Training library identity, in canonical order."""
    ids = []
    for prefix, count in (("cash", 25), ("mtt", 25), ("spins", 10),
                          ("psy", 20), ("adv", 20)):
        ids.extend("%s-%03d" % (prefix, index) for index in range(1, count + 1))
    ids.extend(("tournament-prep", "final-table-sim", "quiz-gauntlet",
                "hand-lab", "bluff-catcher", "mixed-strategy-lab",
                "study-group"))
    return ids


def training_game_registry_contract():
    """Return the exact runtime game-to-truth-family registry.

    This mirrors PIOQueryService's protected 107-game registry without importing
    application code on an untrusted solver host. The manifest must repeat this
    ledger byte-for-byte (plus its independently approved digest), so a worker
    cannot silently substitute a family, stack, objective engine, or street.
    """
    registry = {}

    # Cash: one scenario game, two protected preflop-range games, two explicit
    # postflop-complete games, and the declared HU depths for the remainder.
    for index in range(1, 26):
        game_id = "cash-%03d" % index
        if index == 20:
            registry[game_id] = {"engine": "SCENARIO"}
            continue
        family, stack, street = "hu_cash", 100, "postflop"
        if index == 9:
            stack = 200
        elif index == 10:
            stack = 40
        elif index in (12, 25):
            family = "postflop_complete"
        if index in (1, 8):
            street = "preflop"
        elif index == 12:
            street = "river"
        registry[game_id] = {
            "engine": "PIO_PREFLOP_RANGE" if street == "preflop" else "PIO_CHIP_EV",
            "game_type": family, "stack_depth": stack,
            "required_street": street,
        }

    mtt = {
        2: ("mtt_6max_icm", 20), 3: ("mtt_6max_icm", 40),
        4: ("mtt_9max_icm", 60), 5: ("mtt_6max_icm", 40),
        6: ("mtt_6max_icm", 20), 7: ("mtt_9max_chipev", 100),
        8: ("mtt_6max_chipev", 10), 9: ("mtt_6max_chipev", 20),
        10: ("mtt_9max_chipev", 40), 11: ("mtt_9max_icm", 60),
        12: ("mtt_9max_chipev", 80), 13: ("mtt_6max_icm", 40),
        14: ("mtt_3max_chipev", 20), 15: ("mtt_hu_chipev", 40),
        17: ("mtt_9max_chipev", 20), 18: ("mtt_6max_chipev", 40),
        19: ("mtt_9max_icm", 60), 20: ("mtt_9max_chipev", 80),
        21: ("mtt_6max_chipev", 100), 22: ("mtt_6max_icm", 40),
        23: ("mtt_9max_icm", 60), 24: ("mtt_9max_chipev", 80),
        25: ("mtt_6max_chipev", 100),
    }
    for index in range(1, 26):
        game_id = "mtt-%03d" % index
        if index in (1, 16):
            registry[game_id] = {
                "engine": "ICMIZER", "stack_depth": 10,
                "required_street": "preflop",
            }
            continue
        family, stack = mtt[index]
        registry[game_id] = {
            "engine": "PIO_ICM_REQUIRED" if family.endswith("_icm") else "PIO_CHIP_EV",
            "game_type": family, "stack_depth": stack,
            "required_street": "postflop",
        }

    spins = {
        1: ("spin_3max_chipev", 20), 2: ("spin_3max_icm", 20),
        3: ("spin_3max_chipev", 20), 4: ("spin_hu_chipev", 10),
        5: ("spin_3max_chipev", 25), 6: ("spin_3max_icm", 20),
        7: ("spin_hu_icm", 10), 8: ("spin_hu_chipev", 20),
        9: ("spin_3max_icm", 25), 10: ("spin_3max_chipev", 25),
    }
    for index, (family, stack) in spins.items():
        registry["spins-%03d" % index] = {
            "engine": "PIO_ICM_REQUIRED" if family.endswith("_icm") else "PIO_CHIP_EV",
            "game_type": family, "stack_depth": stack,
            "required_street": "postflop",
        }

    for index in range(1, 21):
        registry["psy-%03d" % index] = {"engine": "SCENARIO"}
    for index in range(1, 21):
        registry["adv-%03d" % index] = {
            "engine": "PIO_CHIP_EV", "game_type": "postflop_complete",
            "stack_depth": 100, "required_street": "postflop",
        }
    registry.update({
        "tournament-prep": {
            "engine": "PIO_ICM_REQUIRED", "game_type": "mtt_9max_icm",
            "stack_depth": 40, "required_street": "postflop",
        },
        "final-table-sim": {
            "engine": "PIO_ICM_REQUIRED", "game_type": "mtt_9max_icm",
            "stack_depth": 60, "required_street": "postflop",
        },
    })
    for game_id in ("quiz-gauntlet", "hand-lab", "bluff-catcher",
                    "mixed-strategy-lab", "study-group"):
        registry[game_id] = {
            "engine": "PIO_CHIP_EV", "game_type": "postflop_complete",
            "stack_depth": 100, "required_street": "postflop",
        }
    ordered_ids = canonical_training_game_ids()
    if set(registry) != set(ordered_ids):
        raise AssertionError("internal Training game registry is not exactly 107 games")
    return registry


def canonical_training_game_contracts(phases):
    """Bind all 107 games to exact phase IDs and their sealed matchup contracts."""
    phases_by_family_stack = {}
    for phase in phases:
        key = (phase.get("game_type"), phase.get("stack"))
        phases_by_family_stack.setdefault(key, []).append(str(phase.get("id") or ""))
    registry = training_game_registry_contract()
    phase_contracts = canonical_phase_contracts(phases)
    phase_contract_by_id = {contract["id"]: contract for contract in phase_contracts}
    contracts = []
    for game_id in canonical_training_game_ids():
        contract = {"game_id": game_id, **registry[game_id]}
        if contract["engine"] == "PIO_CHIP_EV" and contract["required_street"] != "preflop":
            contract["phase_ids"] = sorted(phases_by_family_stack.get(
                (contract["game_type"], contract["stack_depth"]), []
            ))
        else:
            contract["phase_ids"] = []
        contract["phase_contracts"] = [
            phase_contract_by_id[phase_id]
            for phase_id in contract["phase_ids"]
            if phase_id in phase_contract_by_id
        ]
        contracts.append(contract)
    return contracts


def training_game_contracts_checksum(contracts):
    payload = json.dumps(
        contracts, sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


BOUNDED_CANARY_CONTRACT_SCHEMA = "training-solver-bounded-canary-contracts.v1"
BOUNDED_CANARY_CONTRACT_FIELDS = (
    "machine_id", "partition_count", "partition_index", "phase_id",
    "parent_artifact_id", "parent_scenario_hash", "parent_node",
    "child_artifact_id", "child_scenario_hash", "child_node",
)
BOUNDED_CANARY_PARTITIONS = {
    "M1": (2, 0),
    "M2": (2, 1),
}
EXECUTION_SCOPE_BACKLOG = "training_backlog"
EXECUTION_SCOPE_BOUNDED_CANARY = "bounded_canary"


def canonical_bounded_canary_contracts(contracts):
    """Canonicalize only the fields the bounded runner is allowed to consume."""
    if not isinstance(contracts, list) or len(contracts) != 2:
        raise ValueError("bounded canary contracts must contain exactly M1 and M2 targets")
    canonical = []
    for contract in contracts:
        if (not isinstance(contract, dict)
                or set(contract) != set(BOUNDED_CANARY_CONTRACT_FIELDS)):
            raise ValueError("bounded canary target must contain only its sealed fields")
        canonical.append({field: contract[field] for field in BOUNDED_CANARY_CONTRACT_FIELDS})
    return sorted(canonical, key=lambda contract: str(contract["machine_id"]))


def bounded_canary_contracts_checksum(contracts):
    payload = json.dumps(
        canonical_bounded_canary_contracts(contracts),
        sort_keys=True, separators=(",", ":"), allow_nan=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _canonical_uuid_v4(value, label):
    if not isinstance(value, str) or not UUID_V4.fullmatch(value):
        raise SystemExit("bounded canary %s must be one lowercase UUIDv4" % label)
    try:
        parsed = uuid.UUID(value)
    except ValueError:
        raise SystemExit("bounded canary %s must be one lowercase UUIDv4" % label)
    if parsed.version != 4 or str(parsed) != value:
        raise SystemExit("bounded canary %s must be one lowercase UUIDv4" % label)
    return value


def validate_bounded_canary_contracts(manifest):
    """Validate the checksum-sealed one-parent/one-child target per machine."""
    try:
        contracts = canonical_bounded_canary_contracts(
            manifest.get("bounded_canary_contracts")
        )
    except ValueError as error:
        raise SystemExit(str(error))
    declared_checksum = str(
        manifest.get("bounded_canary_contracts_sha256") or ""
    ).lower()
    if (manifest.get("bounded_canary_contracts_schema")
            != BOUNDED_CANARY_CONTRACT_SCHEMA
            or not re.fullmatch(r"[0-9a-f]{64}", declared_checksum)
            or declared_checksum == "0" * 64
            or declared_checksum != bounded_canary_contracts_checksum(contracts)):
        raise SystemExit(
            "manifest must checksum-seal its machine-bound bounded canary contracts"
        )

    phases_by_id = {str(phase["id"]): phase for phase in manifest["phases"]}
    seen_machines = set()
    seen_artifact_ids = set()
    seen_scenarios = set()
    for contract in contracts:
        machine_id = contract["machine_id"]
        if machine_id not in ("M1", "M2") or machine_id in seen_machines:
            raise SystemExit(
                "bounded canary contracts require unique canonical machine identities"
            )
        seen_machines.add(machine_id)
        partition_count = contract["partition_count"]
        partition_index = contract["partition_index"]
        if (not isinstance(partition_count, int) or isinstance(partition_count, bool)
                or not isinstance(partition_index, int) or isinstance(partition_index, bool)
                or (partition_count, partition_index)
                != BOUNDED_CANARY_PARTITIONS[machine_id]):
            raise SystemExit(
                "bounded canary partition must bind M1 to 2/0 and M2 to 2/1"
            )
        phase = phases_by_id.get(str(contract["phase_id"]))
        if phase is None:
            raise SystemExit("bounded canary target references an unknown phase")
        if "turn" not in phase["streets"]:
            raise SystemExit("bounded canary phase must seal both Flop and Turn targets")

        parent_id = _canonical_uuid_v4(
            contract["parent_artifact_id"], "parent_artifact_id"
        )
        child_id = _canonical_uuid_v4(
            contract["child_artifact_id"], "child_artifact_id"
        )
        if parent_id == child_id or parent_id in seen_artifact_ids or child_id in seen_artifact_ids:
            raise SystemExit("bounded canary artifact UUIDs must be globally distinct")
        seen_artifact_ids.update((parent_id, child_id))

        if (not isinstance(contract["parent_scenario_hash"], str)
                or not isinstance(contract["parent_node"], str)
                or not isinstance(contract["child_scenario_hash"], str)
                or not isinstance(contract["child_node"], str)):
            raise SystemExit("bounded canary scenarios and nodes must be canonical strings")
        matching_parent_targets = []
        for target in phase["harvest"]:
            prefix = "%s_%s_%dbb_" % (
                phase["game_type"], target["position"], phase["stack"]
            )
            scenario_hash = contract["parent_scenario_hash"]
            if (scenario_hash.startswith(prefix)
                    and contract["parent_node"] == target["node"]):
                matching_parent_targets.append((target, scenario_hash[len(prefix):]))
        if len(matching_parent_targets) != 1:
            raise SystemExit(
                "bounded canary parent must match exactly one sealed phase harvest target"
            )
        target, parent_board = matching_parent_targets[0]
        try:
            validate_board(parent_board, 3)
        except ValueError as error:
            raise SystemExit("bounded canary parent %s" % error)

        child_prefix = "turn_%s_%s_%dbb_" % (
            phase["game_type"], target["position"], phase["stack"]
        )
        child_scenario = contract["child_scenario_hash"]
        if not isinstance(child_scenario, str) or not child_scenario.startswith(child_prefix):
            raise SystemExit("bounded canary child must preserve parent family/seat/stack")
        child_board = child_scenario[len(child_prefix):]
        try:
            validate_board(child_board, 4)
        except ValueError as error:
            raise SystemExit("bounded canary child %s" % error)
        if child_board[:6] != parent_board:
            raise SystemExit("bounded canary child must be an exact Turn child of its parent")
        turn_card = child_board[6:]
        expected_child_node = node_templates(
            phase["pot_chips"], phase["eff_chips"], phase["streets"]
        )[target["hero"]]["turn"] % turn_card
        if contract["child_node"] != expected_child_node:
            raise SystemExit(
                "bounded canary child node does not match sealed phase tree geometry"
            )
        if contract["parent_scenario_hash"] in seen_scenarios or child_scenario in seen_scenarios:
            raise SystemExit("bounded canary scenarios must be globally distinct")
        seen_scenarios.update((contract["parent_scenario_hash"], child_scenario))
    if seen_machines != set(BOUNDED_CANARY_PARTITIONS):
        raise SystemExit("bounded canary contracts require exactly M1 and M2 targets")
    return contracts


def bounded_canary_for_machine(
        manifest, machine_id=MID, partition_count=NUM, partition_index=IDX):
    contracts = validate_bounded_canary_contracts(manifest)
    matches = [contract for contract in contracts
               if contract["machine_id"] == machine_id]
    if len(matches) != 1:
        raise SystemExit(
            "approved manifest has no unique bounded canary target for %s" % machine_id
        )
    contract = matches[0]
    if (contract["partition_count"] != partition_count
            or contract["partition_index"] != partition_index):
        raise SystemExit(
            "bounded canary CLI partition does not match its sealed machine partition"
        )
    return contract

def validate_board(board, expected_cards):
    cards = [board[index:index + 2] for index in range(0, len(board), 2)]
    if (len(board) != expected_cards * 2 or len(cards) != expected_cards
            or len(set(cards)) != expected_cards or any(not CARD.match(card) for card in cards)):
        raise ValueError("board must contain %d unique canonical cards" % expected_cards)
    return cards

def validate_manifest(manifest_text, run_mode="backlog"):
    global ACTIVE_ADMISSION_MODE
    # A failed revalidation must not leave a prior manifest's execution mode
    # available to the signed transport in this process.
    ACTIVE_ADMISSION_MODE = None
    checksum = hashlib.sha256(manifest_text.encode()).hexdigest()
    if checksum != APPROVED_MANIFEST_CHECKSUM:
        raise SystemExit("manifest checksum does not match APPROVED_MANIFEST_CHECKSUM")
    manifest = json.loads(manifest_text)
    gate = manifest.get("release_gate", {})
    if run_mode not in ("backlog", "canary"):
        raise SystemExit("solver run mode must be backlog or canary")
    if run_mode == "backlog" and gate.get("solver_ready") is not True:
        raise SystemExit("manifest release gate is closed: %s" % gate.get("reason", "unspecified"))
    if run_mode == "canary" and gate.get("bounded_canary_ready") is not True:
        raise SystemExit(
            "manifest bounded canary gate is closed: %s"
            % gate.get("bounded_canary_reason", "unspecified")
        )
    expected_execution_scope = (
        EXECUTION_SCOPE_BACKLOG
        if run_mode == "backlog"
        else EXECUTION_SCOPE_BOUNDED_CANARY
    )
    if manifest.get("execution_scope") != expected_execution_scope:
        raise SystemExit(
            "manifest execution scope %r does not authorize %s mode"
            % (manifest.get("execution_scope"), run_mode)
        )
    if int(manifest.get("version", 0)) < 4 or not manifest.get("phases"):
        raise SystemExit("manifest must be version 4+ with at least one approved phase")
    expected_chip_ev = canonical_contract_pairs(TRAINING_SOLVER_CONTRACTS)
    expected_icm = canonical_contract_pairs(TRAINING_ICM_CONTRACTS)
    if (manifest.get("range_combo_order") != h.COMBO_ORDER
            or manifest.get("artifact_combo_order") != h.COMBO_ORDER
            or manifest.get("source_combo_order_schema") != h.SOURCE_COMBO_ORDER_SCHEMA
            or not isinstance(manifest.get("source_combo_order_sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", manifest["source_combo_order_sha256"])
            or manifest["source_combo_order_sha256"] == "0" * 64):
        raise SystemExit(
            "manifest must seal canonical range/artifact order and exact Pio show_hand_order"
        )
    scope = manifest.get("training_contract_scope")
    if (not isinstance(scope, dict)
            or scope.get("schema") != "training-solver-contract-scope.v1"
            or scope.get("objective") != "chip_ev"
            or scope.get("chip_ev_contract_count") != len(expected_chip_ev)
            or scope.get("chip_ev_contracts") != expected_chip_ev
            or scope.get("chip_ev_contracts_checksum") != contract_scope_checksum(expected_chip_ev)
            or scope.get("separate_icm_contract_count") != len(expected_icm)
            or scope.get("separate_icm_contracts") != expected_icm
            or scope.get("separate_icm_engine_required") is not True):
        raise SystemExit(
            "manifest must seal the exact 18 chip-EV and separate 7 ICM Training contracts"
        )
    bundle_checksum = str(manifest.get("pipeline_bundle_checksum") or "").lower()
    if len(bundle_checksum) != 64 or any(c not in "0123456789abcdef" for c in bundle_checksum):
        raise SystemExit("manifest must pin the approved pipeline bundle checksum")
    phase_ids = set()
    for ph in manifest["phases"]:
        required = ("id", "game_type", "stack", "street", "streets", "objective",
                    "pot_chips", "eff_chips", "rake", "accuracy_fraction",
                    "ip_range", "ip_range_checksum", "oop_range", "oop_range_checksum",
                    "ip_player", "oop_player", "harvest")
        missing = [field for field in required if ph.get(field) in (None, "", [])]
        if missing:
            raise SystemExit("phase %s missing approved inputs: %s" % (ph.get("id", "<unknown>"), ",".join(missing)))
        if ph["id"] in phase_ids:
            raise SystemExit("manifest contains duplicate phase id %s" % ph["id"])
        phase_ids.add(ph["id"])
        if not SAFE_TOKEN.match(str(ph["id"])) or not SAFE_TOKEN.match(str(ph["game_type"])):
            raise SystemExit("phase id and game type must be safe canonical tokens")
        if not isinstance(ph["stack"], int) or ph["stack"] <= 0:
            raise SystemExit("phase %s has an invalid stack" % ph["id"])
        if "_icm" in ph["game_type"]:
            raise SystemExit("PioSOLVER chip-EV worker cannot certify ICM phases; use an approved ICM objective engine")
        if ph["stack"] not in TRAINING_SOLVER_CONTRACTS.get(ph["game_type"], frozenset()):
            raise SystemExit(
                "phase %s is outside the exact Training solver family/stack contracts"
                % ph["id"]
            )
        if not isinstance(ph["pot_chips"], int) or ph["pot_chips"] <= 0:
            raise SystemExit("phase %s has an invalid pot" % ph["id"])
        if not isinstance(ph["eff_chips"], int) or ph["eff_chips"] <= 0:
            raise SystemExit("phase %s has an invalid effective stack" % ph["id"])
        if (isinstance(ph["accuracy_fraction"], bool)
                or not isinstance(ph["accuracy_fraction"], (int, float))
                or not math.isfinite(ph["accuracy_fraction"])
                or ph["accuracy_fraction"] <= 0
                or ph["accuracy_fraction"] > 0.01):
            raise SystemExit(
                "phase %s has an invalid accuracy_fraction" % ph["id"]
            )
        if ph["streets"] not in (["flop"], ["flop", "turn"], ["flop", "turn", "river"]):
            raise SystemExit("phase %s must declare an ordered street prefix" % ph["id"])
        if ph["street"] != "flop":
            raise SystemExit("phase %s must discover canonical flop parents" % ph["id"])
        if ph["objective"] != "chip_ev":
            raise SystemExit("PioSOLVER worker only accepts the explicit chip_ev objective")
        if (ph["oop_player"] not in h.POSITIONS
                or ph["ip_player"] not in h.POSITIONS
                or ph["oop_player"] == ph["ip_player"]):
            raise SystemExit(
                "phase %s must bind distinct canonical OOP/IP positions" % ph["id"]
            )
        if (not isinstance(ph["rake"], str)
                or not RAKE_CONTRACT.fullmatch(ph["rake"])):
            raise SystemExit("phase %s has a noncanonical rake contract" % ph["id"])
        rake_parts = ph["rake"].split(" ")
        try:
            rake_values = [float(value) for value in rake_parts]
        except ValueError:
            raise SystemExit("phase %s has an invalid rake contract" % ph["id"])
        if len(rake_values) != 2 or any(not math.isfinite(value) or value < 0 for value in rake_values):
            raise SystemExit("phase %s has an invalid rake contract" % ph["id"])
        for checksum_field in ("ip_range_checksum", "oop_range_checksum"):
            range_checksum = str(ph[checksum_field]).lower()
            if (len(range_checksum) != 64
                    or any(c not in "0123456789abcdef" for c in range_checksum)
                    or range_checksum == "0" * 64):
                raise SystemExit("phase %s has an invalid %s" % (ph["id"], checksum_field))
        if not isinstance(ph["harvest"], list) or not ph["harvest"]:
            raise SystemExit("phase %s has no harvest targets" % ph["id"])
        target_keys = set()
        for target in ph["harvest"]:
            if (target.get("hero") not in ("OOP", "IP")
                    or not SAFE_TOKEN.match(str(target.get("position") or ""))):
                raise SystemExit("phase %s has an invalid harvest target" % ph["id"])
            expected_position = (
                ph["oop_player"] if target["hero"] == "OOP" else ph["ip_player"]
            )
            if target["position"] != expected_position:
                raise SystemExit(
                    "phase %s harvest position does not match its declared actor"
                    % ph["id"]
                )
            expected_node = "r:0" if target["hero"] == "OOP" else "r:0:c"
            if target.get("node") != expected_node:
                raise SystemExit("phase %s harvest node does not match its declared actor" % ph["id"])
            target_key = (target["hero"], target["position"])
            if target_key in target_keys:
                raise SystemExit("phase %s contains a duplicate harvest target" % ph["id"])
            target_keys.add(target_key)
        try:
            node_templates(
                ph["pot_chips"], ph["eff_chips"], ph.get("streets", ["flop"])
            )
        except ValueError as error:
            raise SystemExit("phase %s has unavailable tree geometry: %s" % (ph["id"], error))
    expected_phase_specs = canonical_phase_contracts(manifest["phases"])
    declared_phase_specs = manifest.get("phase_contracts")
    declared_phase_digest = str(
        manifest.get("phase_contracts_sha256") or ""
    ).lower()
    if (manifest.get("phase_contracts_schema") != PHASE_CONTRACT_SCHEMA
            or declared_phase_specs != expected_phase_specs
            or not re.fullmatch(r"[0-9a-f]{64}", declared_phase_digest)
            or declared_phase_digest == "0" * 64
            or declared_phase_digest != phase_contracts_checksum(expected_phase_specs)):
        raise SystemExit(
            "manifest must seal exact phase streets, OOP/IP nodes, chip geometry, "
            "rake, accuracy, and range artifact checksums"
        )
    phase_contracts = {
        (phase["game_type"], phase["stack"]) for phase in manifest["phases"]
    }
    expected_phase_contracts = {
        (row["game_type"], row["stack"]) for row in expected_chip_ev
    }
    validated_canary_contracts = None
    if run_mode == "backlog":
        if phase_contracts != expected_phase_contracts:
            missing = sorted(expected_phase_contracts - phase_contracts)
            extra = sorted(phase_contracts - expected_phase_contracts)
            raise SystemExit(
                "manifest phase coverage is incomplete: missing=%s extra=%s"
                % (missing, extra)
            )
    else:
        validated_canary_contracts = validate_bounded_canary_contracts(manifest)
        referenced_canary_phase_ids = {
            contract["phase_id"] for contract in validated_canary_contracts
        }
        if phase_ids != referenced_canary_phase_ids:
            missing = sorted(referenced_canary_phase_ids - phase_ids)
            extra = sorted(phase_ids - referenced_canary_phase_ids)
            raise SystemExit(
                "bounded canary manifest phase set must exactly match its sealed targets: "
                "missing=%s extra=%s" % (missing, extra)
            )
        if not phase_contracts.issubset(expected_phase_contracts):
            raise SystemExit(
                "bounded canary phase is outside the approved Training chip-EV universe"
            )
    expected_game_contracts = canonical_training_game_contracts(manifest["phases"])
    declared_game_contracts = manifest.get("training_game_contracts")
    declared_game_checksum = str(
        manifest.get("training_game_contracts_sha256") or ""
    ).lower()
    if (manifest.get("training_game_contracts_schema")
            != "training-game-solver-contracts.v1"
            or declared_game_contracts != expected_game_contracts
            or len(expected_game_contracts) != 107
            or not re.fullmatch(r"[0-9a-f]{64}", declared_game_checksum)
            or declared_game_checksum == "0" * 64
            or declared_game_checksum
            != training_game_contracts_checksum(expected_game_contracts)):
        raise SystemExit(
            "manifest must seal the exact 107-game Training truth/family/stack/street/phase ledger"
        )
    referenced_phase_ids = {
        phase_id
        for contract in expected_game_contracts
        for phase_id in contract["phase_ids"]
    }
    if referenced_phase_ids != phase_ids:
        raise SystemExit(
            "every chip-EV phase must be reachable from the exact 107-game contract ledger"
        )
    self_test = manifest.get("self_test")
    if not isinstance(self_test, dict):
        raise SystemExit("approved manifest is missing its solver self-test contract")
    self_test_required = (
        "board", "pot_chips", "eff_chips", "rake", "accuracy_fraction",
        "oop_range", "oop_range_checksum",
        "ip_range", "ip_range_checksum", "oop_player", "ip_player", "ev_oop_min_bb", "ev_oop_max_bb")
    missing = [field for field in self_test_required if self_test.get(field) in (None, "")]
    if missing:
        raise SystemExit("solver self-test is missing approved inputs: %s" % ",".join(missing))
    if (not isinstance(self_test["rake"], str)
            or not RAKE_CONTRACT.fullmatch(self_test["rake"])):
        raise SystemExit("solver self-test has a noncanonical rake contract")
    if (isinstance(self_test["accuracy_fraction"], bool)
            or not isinstance(self_test["accuracy_fraction"], (int, float))
            or not math.isfinite(self_test["accuracy_fraction"])
            or self_test["accuracy_fraction"] <= 0
            or self_test["accuracy_fraction"] > 0.01):
        raise SystemExit("solver self-test has an invalid accuracy_fraction")
    try:
        validate_board(str(self_test["board"]), 3)
    except ValueError as error:
        raise SystemExit("solver self-test %s" % error)
    if float(self_test["ev_oop_min_bb"]) > float(self_test["ev_oop_max_bb"]):
        raise SystemExit("solver self-test EV bounds are reversed")
    canary_fields_present = any(
        field in manifest for field in (
            "bounded_canary_contracts_schema",
            "bounded_canary_contracts",
            "bounded_canary_contracts_sha256",
        )
    )
    if (run_mode == "canary" and validated_canary_contracts is None) or (
            run_mode != "canary" and canary_fields_present):
        validate_bounded_canary_contracts(manifest)
    ACTIVE_ADMISSION_MODE = (
        "backlog" if run_mode == "backlog" else "bounded_canary"
    )
    return manifest, checksum

def load_range(name, expected_checksum):
    if len(str(expected_checksum)) != 64:
        raise SystemExit("range checksum is missing for %s" % name)
    root = os.path.realpath(RANGE_DIRECTORY)
    file_path = os.path.realpath(os.path.join(root, name))
    try:
        within_root = os.path.commonpath((root, file_path)) == root
    except ValueError:
        within_root = False
    if not within_root or file_path == root:
        raise SystemExit("range path escapes RANGE_DIRECTORY: %s" % name)
    payload = open(file_path, "rb").read()
    checksum = hashlib.sha256(payload).hexdigest()
    if checksum != expected_checksum:
        raise SystemExit("range checksum mismatch for %s" % name)
    text = payload.decode().strip()
    values = text.split()
    try:
        weights = [float(value) for value in values]
    except ValueError:
        raise SystemExit("range %s contains a non-numeric weight" % name)
    if (len(weights) != 1326
            or any(not math.isfinite(value) or value < 0 or value > 1 for value in weights)
            or not any(value > 0 for value in weights)):
        raise SystemExit("range %s is not a valid 1326-combo weight vector" % name)
    # Pio's UPI is line-oriented. Return only a canonical single-space vector
    # so a checksummed file containing tabs/newlines cannot create a second
    # command when interpolated into `set_range`.
    return " ".join(values)

DECK = [r + s for r in "AKQJT98765432" for s in "cdhs"]

def turn_cards(flop):
    on = set(validate_board(flop, 3))
    return [c for c in DECK if c not in on]

def river_cards(board4):
    on = set(validate_board(board4, 4))
    return [c for c in DECK if c not in on]

def node_templates(pot, eff=None, streets=("flop", "turn", "river")):
    """Canonical SRP continuation (75% c-bet called); c-bet code derived from THIS
    phase's pot. Pio targets are cumulative across streets, so later tokens add
    the new street's increment to the already-matched contribution."""
    if not isinstance(pot, int) or isinstance(pot, bool) or pot <= 0:
        raise ValueError("root pot must be a positive integer")
    if eff is not None and (not isinstance(eff, int) or isinstance(eff, bool) or eff <= 0):
        raise ValueError("effective stack must be a positive integer")
    effective_cap = eff if eff is not None else 10 ** 12
    flop_target = min(effective_cap, int(round(pot * 0.75)))
    turn_pot = pot + 2 * flop_target
    turn_increment = int(round(turn_pot * 0.75))
    turn_target = min(effective_cap, flop_target + turn_increment)
    river_pot = turn_pot + 2 * (turn_target - flop_target)
    river_increment = int(round(river_pot * 0.75))
    river_target = min(effective_cap, turn_target + river_increment)
    turn_oop = "r:0:c:b%d:c:%%s" % flop_target
    river_oop = turn_oop + ":c:b%d:c:%%s" % turn_target
    requested = set(streets or ())
    if eff is not None:
        lines = h.tree_gen.build_lines(pot, eff)
        turn_prefix = [0, flop_target, flop_target]
        river_prefix = turn_prefix + [flop_target, turn_target, turn_target]
        if "turn" in requested and not any(line[:3] == turn_prefix for line in lines):
            raise ValueError("75% Flop call line does not reach a Turn decision")
        if "river" in requested and not any(line[:6] == river_prefix for line in lines):
            raise ValueError("75% Turn call line does not reach a River decision")
    return {
        "OOP": {"flop": "r:0", "turn": turn_oop, "river": river_oop},
        "IP": {"flop": "r:0:c", "turn": turn_oop + ":c", "river": river_oop + ":c"},
        "targets": {"flop": flop_target, "turn": turn_target, "river": river_target},
    }

def expand_targets(ph, flop):
    gt, stack = ph["game_type"], ph["stack"]
    tmpl = node_templates(
        ph.get("pot_chips", 550),
        ph.get("eff_chips"),
        ph.get("streets", ["flop"]),
    )
    out = []
    for street in ph.get("streets", ["flop"]):
        for t in ph["harvest"]:
            hero, pos = t["hero"], t["position"]
            if street == "flop":
                out.append((tmpl[hero]["flop"], hero, pos, flop,
                            "%s_%s_%dbb_%s" % (gt, pos, stack, flop)))
            elif street == "turn":
                for tc in turn_cards(flop):
                    b4 = flop + tc
                    out.append((tmpl[hero]["turn"] % tc, hero, pos, b4,
                                "turn_%s_%s_%dbb_%s" % (gt, pos, stack, b4)))
            elif street == "river":
                for tc in turn_cards(flop):
                    b4 = flop + tc
                    for rc in river_cards(b4):
                        b5 = b4 + rc
                        out.append((tmpl[hero]["river"] % (tc, rc), hero, pos, b5,
                                    "river_%s_%s_%dbb_%s" % (gt, pos, stack, b5)))
    return out

def row_relational_identity_matches(r, expected_scenario):
    """Bind resume state to the relational family, stack, street and board."""
    game_type = r.get("game_type")
    stack_depth = r.get("stack_depth")
    street = r.get("street")
    if (not isinstance(game_type, str)
            or not isinstance(stack_depth, int) or isinstance(stack_depth, bool)
            or street not in ("flop", "turn", "river")):
        return False
    street_prefix = "" if street == "flop" else street + "_"
    for position in h.POSITIONS:
        prefix = "%s%s_%s_%dbb_" % (
            street_prefix, game_type, position, stack_depth
        )
        if expected_scenario.startswith(prefix):
            try:
                h.canonical_board_cards(expected_scenario[len(prefix):], street)
                return True
            except ValueError:
                return False
    return False


def certified_row(r, manifest_version, manifest_checksum, expected_scenario):
    return (r.get("admitted") is True
            and r.get("scenario_hash") == expected_scenario
            and row_relational_identity_matches(r, expected_scenario)
            and r.get("solved_v2_at") and r.get("quality_status") == "validated"
            and r.get("solver_version") == PIO_SOLVER_VERSION
            and r.get("solver_binary_checksum") == PIO_BINARY_CHECKSUM
            and r.get("machine_id") in ("M1", "M2")
            and r.get("pipeline_commit") == PIPELINE_COMMIT
            and str(r.get("manifest_version") or "") == str(manifest_version)
            and r.get("manifest_checksum") == manifest_checksum
            and len(r.get("source_artifact_checksum") or "") == 64
            and r.get("audited_at"))

def row_states(hashes, manifest_version, manifest_checksum):
    """Read exact row identity and active-release certification in bounded batches."""
    states = {sh: {"row_ids": [], "certified": False} for sh in hashes}
    unique = sorted(set(hashes))
    for start in range(0, len(unique), 75):
        chunk = unique[start:start + 75]
        response = _worker_request(
            "row_states", {"scenario_hashes": chunk}, manifest_version, manifest_checksum
        )
        rows = response.get("rows")
        if not isinstance(rows, list) or len(rows) > len(chunk) * 2:
            raise RuntimeError("solver worker row-state response is malformed")
        for row in rows:
            sh = row.get("scenario_hash")
            if sh not in states:
                continue
            states[sh]["row_ids"].append(row.get("id"))
            states[sh]["certified"] = states[sh]["certified"] or bool(
                certified_row(row, manifest_version, manifest_checksum, sh))
    return {
        sh: {
            "count": len(state["row_ids"]),
            "row_id": state["row_ids"][0] if len(state["row_ids"]) == 1 else None,
            "certified": state["certified"] if len(state["row_ids"]) == 1 else False,
        }
        for sh, state in states.items()
    }

def row_state(sh, manifest_version, manifest_checksum):
    return row_states([sh], manifest_version, manifest_checksum)[sh]


def _bounded_canary_targets(manifest, contract):
    """Materialize the already-validated exact Flop parent and Turn child."""
    phase = next(
        phase for phase in manifest["phases"]
        if str(phase["id"]) == str(contract["phase_id"])
    )
    parent_target = next(
        target for target in phase["harvest"]
        if target["node"] == contract["parent_node"]
        and contract["parent_scenario_hash"].startswith(
            "%s_%s_%dbb_" % (
                phase["game_type"], target["position"], phase["stack"]
            )
        )
    )
    parent_prefix = "%s_%s_%dbb_" % (
        phase["game_type"], parent_target["position"], phase["stack"]
    )
    child_prefix = "turn_" + parent_prefix
    parent_board = contract["parent_scenario_hash"][len(parent_prefix):]
    child_board = contract["child_scenario_hash"][len(child_prefix):]
    return phase, [
        {
            "role": "parent",
            "artifact_id": contract["parent_artifact_id"],
            "scenario_hash": contract["parent_scenario_hash"],
            "node": contract["parent_node"],
            "hero": parent_target["hero"],
            "position": parent_target["position"],
            "board": parent_board,
            "street": "flop",
        },
        {
            "role": "child",
            "artifact_id": contract["child_artifact_id"],
            "scenario_hash": contract["child_scenario_hash"],
            "node": contract["child_node"],
            "hero": parent_target["hero"],
            "position": parent_target["position"],
            "board": child_board,
            "street": "turn",
        },
    ]


def _read_exact_bounded_canary_rows(
        targets, manifest_version, manifest_checksum, machine_id,
        partition_count, partition_index):
    hashes = [target["scenario_hash"] for target in targets]
    response = _worker_request(
        "row_states", {"scenario_hashes": hashes},
        manifest_version, manifest_checksum,
    )
    rows = response.get("rows")
    if not isinstance(rows, list) or len(rows) != 2:
        raise SystemExit(
            "bounded canary requires exactly two pre-existing warehouse identities"
        )
    by_scenario = {}
    for row in rows:
        scenario_hash = row.get("scenario_hash") if isinstance(row, dict) else None
        if scenario_hash not in hashes or scenario_hash in by_scenario:
            raise SystemExit(
                "bounded canary warehouse identities are missing, duplicated, or unexpected"
            )
        by_scenario[scenario_hash] = row
    if set(by_scenario) != set(hashes):
        raise SystemExit(
            "bounded canary warehouse identities are missing, duplicated, or unexpected"
        )
    for target in targets:
        row = by_scenario[target["scenario_hash"]]
        if (str(row.get("id")) != target["artifact_id"]
                or row.get("street") != target["street"]
                or not row_relational_identity_matches(
                    row, target["scenario_hash"]
                )):
            raise SystemExit(
                "bounded canary warehouse UUID or relational identity does not match its sealed target"
            )
        if (row.get("admission_mode") != "bounded_canary"
                or row.get("partition_count") != partition_count
                or row.get("partition_index") != partition_index
                or row.get("canary_target_role") != target["role"]
                or row.get("authorized_node") != target["node"]
                or row.get("authorized_hero_position") != target["position"]
                or row.get("canary_authorized") is not True):
            raise SystemExit(
                "bounded canary server authority does not match its sealed machine, partition, node, or position"
            )
    return by_scenario


def prepare_bounded_canary_execution(
        manifest, manifest_checksum, machine_id=MID,
        partition_count=NUM, partition_index=IDX):
    """Resolve both sealed UUIDs through the gateway before a solver is spawned."""
    contract = bounded_canary_for_machine(
        manifest, machine_id, partition_count, partition_index
    )
    phase, targets = _bounded_canary_targets(manifest, contract)
    rows = _read_exact_bounded_canary_rows(
        targets, manifest.get("version", "unversioned"), manifest_checksum,
        machine_id, partition_count, partition_index,
    )
    pending_targets = []
    certified_targets = []
    for target in targets:
        row = rows[target["scenario_hash"]]
        if row.get("admitted") is not True:
            pending_targets.append(target)
            continue
        if (row.get("node") != target["node"]
                or row.get("hero_position") != target["position"]
                or row.get("machine_id") != machine_id
                or not certified_row(
                    row, manifest.get("version", "unversioned"),
                    manifest_checksum, target["scenario_hash"],
                )):
            raise SystemExit(
                "bounded canary admitted target is foreign, stale, or ambiguously certified"
            )
        certified_targets.append(target)
    return {
        "manifest_checksum": manifest_checksum,
        "manifest_version": manifest.get("version", "unversioned"),
        "machine_id": machine_id,
        "partition_count": partition_count,
        "partition_index": partition_index,
        "contract": contract,
        "phase": phase,
        "targets": targets,
        "pending_targets": pending_targets,
        "certified_targets": certified_targets,
    }


def verify_bounded_canary_admission(plan):
    rows = _read_exact_bounded_canary_rows(
        plan["targets"], plan["manifest_version"], plan["manifest_checksum"],
        plan["machine_id"], plan["partition_count"], plan["partition_index"],
    )
    for target in plan["targets"]:
        row = rows[target["scenario_hash"]]
        if (row.get("node") != target["node"]
                or row.get("hero_position") != target["position"]
                or row.get("machine_id") != plan["machine_id"]
                or not certified_row(
                    row, plan["manifest_version"], plan["manifest_checksum"],
                    target["scenario_hash"],
                )):
            raise SystemExit(
                "bounded canary artifact was not admitted under the exact active machine tuple"
            )
    return rows


def complete_bounded_canary_without_solver(plan):
    """Verify an exactly completed retry and emit its terminal heartbeat."""
    if (not isinstance(plan, dict)
            or plan.get("machine_id") != MID
            or plan.get("partition_count") != NUM
            or plan.get("partition_index") != IDX
            or len(plan.get("targets") or []) != 2
            or plan.get("pending_targets") != []
            or plan.get("certified_targets") != plan.get("targets")):
        raise SystemExit("bounded canary no-op completion requires two certified targets")
    verify_bounded_canary_admission(plan)
    _worker_request("heartbeat", {
        "phase": "bounded-canary-complete",
        "board": plan["targets"][0]["board"],
        "spots_done": 1,
        "rows_written": 0,
        "bad": 0,
        "note": "sealed parent/child canary already certified; zero-write exit",
    }, plan["manifest_version"], plan["manifest_checksum"])
    print("[%s] bounded canary already complete; zero-write exit" % plan["machine_id"])

def canonical_jsonb_text_v1(value):
    """Serialize the worker payload exactly as PostgreSQL jsonb canonicalization.

    Python's default JSON encoder preserves float spellings that jsonb does not
    (for example 1e-06 and -0.0), so it cannot be used for a checksum that the
    database independently recomputes after parsing the payload.
    """
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("canonical solver artifacts require finite JSON numbers")
        number = str(value)
        if value == 0:
            number = number.lstrip("-")
        if "e" in number.lower():
            coefficient, exponent = number.lower().split("e")
            sign = ""
            if coefficient.startswith("-"):
                sign, coefficient = "-", coefficient[1:]
            whole, _, fraction = coefficient.partition(".")
            digits = whole + fraction
            decimal_position = len(whole) + int(exponent)
            if decimal_position <= 0:
                number = sign + "0." + ("0" * -decimal_position) + digits
            elif decimal_position >= len(digits):
                number = sign + digits + ("0" * (decimal_position - len(digits)))
            else:
                number = sign + digits[:decimal_position] + "." + digits[decimal_position:]
        return number
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical_jsonb_text_v1(item) for item in value) + "]"
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise ValueError("canonical solver artifact object keys must be strings")
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False, separators=(",", ":")) + ":"
            + canonical_jsonb_text_v1(value[key])
            for key in sorted(value)
        ) + "}"
    raise ValueError("unsupported canonical solver artifact value: %s" % type(value).__name__)

def patch_v2(row_id, sh, game_type, stack_depth, street, sm,
             manifest_version, manifest_checksum):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(
        timespec="microseconds").replace("+00:00", "Z")
    artifact_envelope = {"scenario_hash": sh, "strategy_matrix_v2": sm}
    artifact = canonical_jsonb_text_v1(artifact_envelope).encode("utf-8")
    body = {
        "id": str(row_id),
        "scenario_hash": sh,
        "game_type": game_type,
        "stack_depth": stack_depth,
        "street": street,
        "strategy_matrix_v2": sm,
        "solved_v2_at": now,
        "solver_version": PIO_SOLVER_VERSION,
        "solver_binary_checksum": PIO_BINARY_CHECKSUM,
        "machine_id": MID,
        "pipeline_commit": PIPELINE_COMMIT,
        "manifest_version": str(manifest_version),
        "manifest_checksum": manifest_checksum,
        "source_artifact_checksum": hashlib.sha256(artifact).hexdigest(),
        "quality_status": "validated",
        "audited_at": now,
    }
    response = _worker_request(
        "ingest_artifact", {"artifact": body}, manifest_version, manifest_checksum
    )
    receipt = response.get("receipt")
    if (not isinstance(receipt, dict)
            or str(receipt.get("artifact_id")) != str(row_id)
            or receipt.get("scenario_hash") != sh
            or receipt.get("source_artifact_checksum") != body["source_artifact_checksum"]
            or not isinstance(receipt.get("replayed"), bool)):
        raise WorkerGatewayError("solver worker gateway returned an invalid ingest receipt")
    return receipt


def write_backup(backup_path, payload):
    """Atomically persist local evidence without overstating DB admission."""
    directory = os.path.dirname(backup_path) or "."
    with tempfile.NamedTemporaryFile(
            "w", delete=False, dir=directory,
            prefix=os.path.basename(backup_path) + ".", suffix=".tmp") as backup:
        json.dump(payload, backup, sort_keys=True, separators=(",", ":"), allow_nan=False)
        backup.flush()
        os.fsync(backup.fileno())
        temporary_path = backup.name
    os.replace(temporary_path, backup_path)

def heartbeat(phase, board, done, wrote, bad, note, manifest_version, manifest_checksum):
    try:
        _worker_request("heartbeat", {
            "phase": phase, "board": board, "spots_done": done,
            "rows_written": wrote, "bad": bad, "note": note,
        }, manifest_version, manifest_checksum)
    except Exception as e:
        print("[hb] ", e)

def boards_for(gt, stack, street, positions, manifest_version, manifest_checksum):
    boards = set()
    for pos in positions:
        after_scenario = None
        page_size = 500
        for _ in range(10000):
            response = _worker_request("board_page", {
                "after_scenario": after_scenario,
                "game_type": gt,
                "limit": page_size,
                "position": pos,
                "stack_depth": stack,
                "street": street,
            }, manifest_version, manifest_checksum)
            rows = response.get("scenario_hashes")
            if not isinstance(rows, list) or len(rows) > page_size:
                raise RuntimeError("solver worker board-page response is malformed")
            if rows and (after_scenario is not None and rows[0] <= after_scenario):
                raise RuntimeError("solver worker board pagination did not advance")
            for scenario_hash in rows:
                board = scenario_hash.rsplit("_", 1)[-1]
                validate_board(board, 3)
                boards.add(board)
            if len(rows) < page_size:
                break
            after_scenario = rows[-1]
        else:
            raise RuntimeError("board discovery exceeded the bounded pagination ceiling")
    return sorted(boards)

def solve(board, oop_w, ip_w, pot=550, eff=9750, rake="0 0",
          accuracy_fraction=0.005):
    for cmd in h.build_setup_commands(
            board, oop_w, ip_w, pot, eff, rake, accuracy_fraction):
        pio(cmd)

def self_test(contract, source_combo_order_sha256,
              training_game_contracts_sha256):
    board = contract["board"]
    print("[selftest] solving approved reference %s..." % board)
    solve(board,
          load_range(contract["oop_range"], contract["oop_range_checksum"]),
          load_range(contract["ip_range"], contract["ip_range_checksum"]),
          contract["pot_chips"], contract["eff_chips"], contract["rake"],
          contract["accuracy_fraction"])
    ev_oop, ev_ip, exploitability_chips = read_results()
    _, sm = h.harvest_node(pio, "r:0", "OOP", board, contract["oop_player"],
                           contract["oop_player"], contract["ip_player"], ev_oop, ev_ip,
                           exploitability_chips,
                           contract["pot_chips"], contract["eff_chips"], contract["rake"],
                           "flop", contract.get("game_type", "self_test"),
                           int(contract.get("stack", contract["eff_chips"] / 100)),
                           contract["accuracy_fraction"], source_combo_order_sha256,
                           contract["oop_range_checksum"],
                           contract["ip_range_checksum"],
                           training_game_contracts_sha256)
    v = h.validate_row(sm)
    ok = (v["bad_sum_hands"] == 0 and v["live_hands"] > 0 and v["ev_ok"]
          and float(contract["ev_oop_min_bb"]) <= ev_oop <= float(contract["ev_oop_max_bb"]))
    print("[selftest] ev_oop=%.3f approved=[%.3f,%.3f] frac_ok=%.4f -> %s"
          % (ev_oop, float(contract["ev_oop_min_bb"]), float(contract["ev_oop_max_bb"]),
             v["frac_ok"], "PASS" if ok else "FAIL"))
    if not ok:
        raise SystemExit("SELF-TEST FAILED - Pio output != verified value; aborting so no bad data is written.")


PREPARED_BOUNDED_CANARY = None


def run_bounded_canary(plan):
    """Solve, validate, admit, and verify one sealed parent/child pair, then stop."""
    if (not isinstance(plan, dict)
            or plan.get("machine_id") != MID
            or plan.get("partition_count") != NUM
            or plan.get("partition_index") != IDX
            or not isinstance(plan.get("targets"), list)
            or len(plan["targets"]) != 2
            or not isinstance(plan.get("pending_targets"), list)
            or not 1 <= len(plan["pending_targets"]) <= 2):
        raise SystemExit(
            "bounded canary requires a launcher-prepared machine-bound execution plan"
        )
    target_identities = {
        (target["artifact_id"], target["scenario_hash"])
        for target in plan["targets"]
    }
    pending_identities = [
        (target.get("artifact_id"), target.get("scenario_hash"))
        for target in plan["pending_targets"]
        if isinstance(target, dict)
    ]
    targets_by_identity = {
        (target["artifact_id"], target["scenario_hash"]): target
        for target in plan["targets"]
    }
    if (len(target_identities) != 2
            or len(pending_identities) != len(plan["pending_targets"])
            or len(set(pending_identities)) != len(pending_identities)
            or not set(pending_identities).issubset(target_identities)
            or any(
                target != targets_by_identity.get(identity)
                for target, identity in zip(
                    plan["pending_targets"], pending_identities
                )
            )):
        raise SystemExit("bounded canary execution plan contains unexpected target identities")

    # Re-read the protected bytes after the Pio handshake and prove the exact
    # target prepared before process creation is still the one being executed.
    manifest_text = fetch_text("phases.json")
    manifest, manifest_checksum = validate_manifest(manifest_text, "canary")
    current_contract = bounded_canary_for_machine(manifest, MID, NUM, IDX)
    current_phase, current_targets = _bounded_canary_targets(
        manifest, current_contract
    )
    if (manifest_checksum != plan["manifest_checksum"]
            or str(manifest.get("version", "unversioned"))
            != str(plan["manifest_version"])
            or current_contract != plan["contract"]
            or current_phase != plan["phase"]
            or current_targets != plan["targets"]):
        raise SystemExit("bounded canary manifest or target changed after preflight")

    _worker_request("heartbeat", {
        "phase": "bounded-canary-startup", "board": "", "spots_done": 0,
        "rows_written": 0, "bad": 0,
        "note": "sealed parent/child canary starting",
    }, plan["manifest_version"], plan["manifest_checksum"])
    self_test(
        manifest["self_test"],
        manifest["source_combo_order_sha256"],
        manifest["training_game_contracts_sha256"],
    )

    phase = plan["phase"]
    parent = plan["targets"][0]
    oop_weights = load_range(phase["oop_range"], phase["oop_range_checksum"])
    ip_weights = load_range(phase["ip_range"], phase["ip_range_checksum"])
    solve(
        parent["board"], oop_weights, ip_weights,
        phase["pot_chips"], phase["eff_chips"], phase["rake"],
        phase["accuracy_fraction"],
    )
    ev_oop, ev_ip, exploitability_chips = read_results()

    # A retry after a first-artifact admission only prepares and ingests the
    # still-missing identity. Preflight proved any skipped identity was already
    # certified under this exact machine and manifest tuple.
    prepared_artifacts = []
    for target in plan["pending_targets"]:
        _, strategy_matrix = h.harvest_node(
            pio, target["node"], target["hero"], target["board"],
            target["position"], phase["oop_player"], phase["ip_player"],
            ev_oop, ev_ip, exploitability_chips,
            phase["pot_chips"], phase["eff_chips"], phase["rake"],
            target["street"], phase["game_type"], phase["stack"],
            phase["accuracy_fraction"], manifest["source_combo_order_sha256"],
            phase["oop_range_checksum"], phase["ip_range_checksum"],
            manifest["training_game_contracts_sha256"],
        )
        validation = h.validate_row(
            strategy_matrix, target["scenario_hash"],
            phase["game_type"], phase["stack"],
        )
        if (validation["bad_sum_hands"] != 0
                or validation["live_hands"] == 0
                or not validation["ev_ok"]):
            raise SystemExit(
                "bounded canary strict V2 validation failed before any ingest"
            )
        prepared_artifacts.append((target, strategy_matrix, validation))

    os.makedirs("backup", exist_ok=True)
    admitted = []
    for target, strategy_matrix, validation in prepared_artifacts:
        backup_path = os.path.join(
            "backup", "bounded-canary-%s-%s.json" % (MID, target["scenario_hash"])
        )
        backup_payload = {
            "scenario_hash": target["scenario_hash"],
            "strategy_matrix_v2": strategy_matrix,
            "_local_validation": validation,
            "_bounded_canary": {
                "machine_id": MID,
                "partition_count": NUM,
                "partition_index": IDX,
                "role": target["role"],
                "artifact_id": target["artifact_id"],
                "manifest_checksum": plan["manifest_checksum"],
            },
            "_admission": {"status": "pending", "scope": "local_validation_only"},
        }
        write_backup(backup_path, backup_payload)
        try:
            receipt = patch_v2(
                target["artifact_id"], target["scenario_hash"],
                phase["game_type"], phase["stack"], target["street"],
                strategy_matrix, plan["manifest_version"], plan["manifest_checksum"],
            )
        except Exception as error:
            backup_payload["_admission"] = {
                "status": "failed",
                "scope": "gateway_rejected_or_unavailable",
                "error_class": type(error).__name__,
            }
            write_backup(backup_path, backup_payload)
            raise SystemExit(
                "bounded canary gateway failed after %d of %d pending admissions: %s"
                % (len(admitted), len(plan["pending_targets"]), type(error).__name__)
            )
        backup_payload["_admission"] = {
            "status": "admitted",
            "scope": "database_catalog_and_active_authority",
            "receipt": receipt,
        }
        write_backup(backup_path, backup_payload)
        admitted.append(receipt)

    if len(admitted) != len(plan["pending_targets"]):
        raise SystemExit("bounded canary did not ingest every pending artifact")
    verify_bounded_canary_admission(plan)
    _worker_request("heartbeat", {
        "phase": "bounded-canary-complete", "board": parent["board"],
        "spots_done": 1, "rows_written": len(admitted), "bad": 0,
        "note": "sealed parent/child canary admitted or resumed and re-verified; exiting",
    }, plan["manifest_version"], plan["manifest_checksum"])
    print(
        "[%s] bounded canary complete: parent=%s child=%s; exiting"
        % (MID, plan["targets"][0]["artifact_id"], plan["targets"][1]["artifact_id"])
    )
    return admitted

def main():
    if RUN_MODE == "canary":
        if PREPARED_BOUNDED_CANARY is None:
            raise SystemExit(
                "bounded canary must be preflight-resolved by the pinned launcher before Pio starts"
            )
        return run_bounded_canary(PREPARED_BOUNDED_CANARY)
    manifest_text = fetch_text("phases.json")
    manifest, manifest_checksum = validate_manifest(manifest_text)
    self_test_contract = manifest.get("self_test")
    if not self_test_contract:
        raise SystemExit("approved manifest is missing its solver self-test contract")
    manifest_version = manifest.get("version", "unversioned")
    # Mandatory authority/authentication handshake before the first expensive
    # Pio command. Unlike later observability heartbeats, this must fail closed.
    _worker_request("heartbeat", {
        "phase": "startup", "board": "", "spots_done": 0,
        "rows_written": 0, "bad": 0, "note": "authority preflight",
    }, manifest_version, manifest_checksum)
    self_test(
        self_test_contract,
        manifest["source_combo_order_sha256"],
        manifest["training_game_contracts_sha256"],
    )
    os.makedirs("backup", exist_ok=True)
    wrote = bad = spots = 0
    while True:
        manifest_text = fetch_text("phases.json")
        manifest, manifest_checksum = validate_manifest(manifest_text)
        manifest_version = manifest.get("version", "unversioned")
        did_work = False
        for ph in manifest["phases"]:
            gt, stack, street = ph["game_type"], ph["stack"], ph["street"]
            positions = sorted({t["position"] for t in ph["harvest"]})
            boards = boards_for(
                gt, stack, street, positions, manifest_version, manifest_checksum)
            mine = boards[IDX::NUM]
            if not mine:
                continue
            oop_w = load_range(ph["oop_range"], ph["oop_range_checksum"])
            ip_w = load_range(ph["ip_range"], ph["ip_range_checksum"])
            pot = ph.get("pot_chips", 550)
            eff = ph.get("eff_chips", 9750)
            rake = ph.get("rake", "0 0")
            accuracy_fraction = ph["accuracy_fraction"]
            for board in mine:  # board == flop
                targets = expand_targets(ph, board)
                states = row_states(
                    [target[4] for target in targets], manifest_version, manifest_checksum)
                missing = [target[4] for target in targets if states[target[4]]["count"] == 0]
                ambiguous = [target[4] for target in targets if states[target[4]]["count"] > 1]
                if missing or ambiguous:
                    note = "blocked warehouse identity: missing=%d duplicate=%d" % (
                        len(missing), len(ambiguous)
                    )
                    print("[integrity] %s" % note)
                    heartbeat(ph["id"], board, spots, wrote, bad, note,
                              manifest_version, manifest_checksum)
                    raise SystemExit(note)
                todo = [target for target in targets
                        if states[target[4]]["count"] == 1 and not states[target[4]]["certified"]]
                if not todo:
                    continue
                try:
                    solve(board, oop_w, ip_w, pot, eff, rake, accuracy_fraction)
                    ev_oop, ev_ip, exploitability_chips = read_results()
                except Exception as e:
                    print("[solve-error]", board, e)
                    heartbeat(ph["id"], board, spots, wrote, bad,
                              "solve error: %s" % e, manifest_version, manifest_checksum)
                    continue
                for node, hero, pos, full, sh in todo:
                    try:
                        _, sm = h.harvest_node(pio, node, hero, full, pos,
                                               ph["oop_player"], ph["ip_player"], ev_oop, ev_ip,
                                               exploitability_chips,
                                               pot, eff, rake,
                                               {6: "flop", 8: "turn", 10: "river"}[len(full)],
                                               gt, stack, accuracy_fraction,
                                               manifest["source_combo_order_sha256"],
                                               ph["oop_range_checksum"],
                                               ph["ip_range_checksum"],
                                               manifest["training_game_contracts_sha256"])
                        resolved_street = {6: "flop", 8: "turn", 10: "river"}[len(full)]
                        v = h.validate_row(sm, sh, gt, stack)
                        if v["bad_sum_hands"] != 0 or v["live_hands"] == 0 or not v["ev_ok"]:
                            bad += 1
                            print("   ! %s strict V2 validation failed; no backup or ingest" % sh)
                            continue
                        backup_path = os.path.join("backup", "%s.json" % sh)
                        backup_payload = {
                            "scenario_hash": sh,
                            "strategy_matrix_v2": sm,
                            "_local_validation": v,
                            "_admission": {
                                "status": "pending",
                                "scope": "local_validation_only",
                            },
                        }
                        write_backup(backup_path, backup_payload)
                        try:
                            receipt = patch_v2(
                                states[sh]["row_id"], sh, gt, stack, resolved_street,
                                sm, manifest_version, manifest_checksum,
                            )
                        except Exception as error:
                            backup_payload["_admission"] = {
                                "status": "failed",
                                "scope": "gateway_rejected_or_unavailable",
                                "error_class": type(error).__name__,
                            }
                            write_backup(backup_path, backup_payload)
                            raise
                        backup_payload["_admission"] = {
                            "status": "admitted",
                            "scope": "database_catalog_and_active_authority",
                            "receipt": receipt,
                        }
                        write_backup(backup_path, backup_payload)
                        wrote += 1
                    except WorkerGatewayError as e:
                        raise SystemExit("solver worker gateway failed after solve: %s" % e)
                    except Exception as e:
                        bad += 1; print("[harvest-error]", sh, e)
                spots += 1; did_work = True
                print("[%s] %s flop=%s targets=%d ev_oop=%.3f wrote=%d bad=%d" % (MID, ph["id"], board, len(todo), ev_oop, wrote, bad))
                heartbeat(ph["id"], board, spots, wrote, bad, "running",
                          manifest_version, manifest_checksum)
        if not did_work:
            heartbeat("idle", "", spots, wrote, bad,
                      "all committed phases complete; polling for new phases",
                      manifest_version, manifest_checksum)
            print("[%s] all phases complete (%d spots, %d rows). Polling in 10 min..." % (MID, spots, wrote))
            time.sleep(600)

if __name__ == "__main__":
    main()
