"""
SMARTER-POKER — ONE-COMMAND MACHINE LAUNCHER
============================================================================
Turnkey. Run this ONE file on each solver box. It:
  1. Fetches the pinned pipeline (this launcher / tree_gen / pio_harvest /
     orchestrate) from one exact protected commit — never a moving branch —
     and proves this running launcher's bytes are that protected source.
  2. Launches your PioSOLVER **console** solver (UPI mode) as a subprocess and
     provides a real transport (send command -> read until 'END'), so the two
     stubs in orchestrate.py are filled automatically. Nothing to hand-wire.
  3. Computes the game-level EVs itself (range-weighted from calc_ev), so the
     self-test and every harvest get correct chip-EV/bb numbers.
  4. Hands control to orchestrate.main(): self-test -> solve phases.json ->
     harvest approved flop/turn/river nodes -> send one artifact at a time through
     the signed worker gateway -> heartbeat -> auto-advance. Deletes nothing.

REQUIRED ENV (set before running):
  SOLVER_WORKER_API_URL=https://smarter.poker/api/training/solver-worker
  SOLVER_WORKER_HMAC_SECRET=<one distinct 32-byte lowercase hex secret per machine>
  PIO_EXE=<full path to your PioSOLVER CONSOLE exe>   e.g.
      C:\\PioSOLVER\\PioSOLVER3-pro.exe   (must be the console/UPI build)
  PIO_SOLVER_VERSION=<approved exact version label>
  APPROVED_PIO_BINARY_CHECKSUM=<SHA-256 of the approved PIO_EXE bytes>
  PIPELINE_COMMIT=<protected 40-character commit SHA>
  APPROVED_MANIFEST_CHECKSUM=<SHA-256 of the approved phases.json bytes>
  RANGE_DIRECTORY=<directory containing approved checksum-pinned ranges>

RUN:
  MACHINE 1:  python run_machine.py M1 2 0
  MACHINE 2:  python run_machine.py M2 2 1

Safety: if the transport or engine is off in any way, the startup self-test
FAILS LOUDLY and aborts before a single row is written — it never guesses.
"""
import sys, os, json, urllib.parse, urllib.request, hashlib, math, tempfile

BASE_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIRECTORY)
if BASE_DIRECTORY not in sys.path:
    sys.path.insert(0, BASE_DIRECTORY)

REPO = "Smarter-Poker/Smarter-Poker-World-Hub"
machine_id = sys.argv[1] if len(sys.argv) > 1 else "M1"
if machine_id not in ("M1", "M2"):
    raise SystemExit("machine id must be M1 or M2")
FORBIDDEN_DATABASE_ENVIRONMENT = frozenset((
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_KEY",
    "SUPABASE_URL",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_CONNECTION_POOL_URL",
    "SUPABASE_DB_HOST",
    "SUPABASE_DB_PORT",
    "SUPABASE_DB_USER",
    "SUPABASE_DB_NAME",
    "SUPABASE_DB_SSL",
    "SUPABASE_DB_CA",
    "SUPABASE_JWT_SECRET",
    "SUPABASE_PROJECT_REF",
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "FALLBACK_SUPABASE_URL",
    "SUPABASE_URL_FALLBACK",
    "SUPABASE_URL_WITH_PASS",
    "DATABASE_URL",
    "DIRECT_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_PASSWORD",
    "PG_PASSWORD",
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGPASSWORD",
))


def _reject_legacy_database_environment(environment=None):
    source = os.environ if environment is None else environment
    configured = sorted(
        key for key, value in source.items()
        if key.upper() in FORBIDDEN_DATABASE_ENVIRONMENT and str(value).strip()
    )
    if configured:
        raise SystemExit(
            "remove legacy database environment variables; solver workers must use scoped signed ingestion: %s"
            % ", ".join(configured)
        )


_reject_legacy_database_environment()
worker_api_url = os.environ.get("SOLVER_WORKER_API_URL", "").strip()
worker_api_parts = urllib.parse.urlsplit(worker_api_url)
if (worker_api_parts.scheme != "https"
        or worker_api_parts.netloc != "smarter.poker"
        or worker_api_parts.username is not None
        or worker_api_parts.password is not None
        or worker_api_parts.path.rstrip("/") != "/api/training/solver-worker"
        or worker_api_parts.query
        or worker_api_parts.fragment):
    raise SystemExit("SOLVER_WORKER_API_URL must be the exact HTTPS solver-worker endpoint")
worker_secret = os.environ.get("SOLVER_WORKER_HMAC_SECRET", "").strip()
if (len(worker_secret) != 64
        or any(character not in "0123456789abcdef" for character in worker_secret)):
    raise SystemExit("SOLVER_WORKER_HMAC_SECRET must be one distinct 32-byte lowercase hex key")
commit = os.environ.get("PIPELINE_COMMIT", "").strip()
if not commit:
    raise SystemExit("PIPELINE_COMMIT is required; solver hosts may not follow a moving main branch")
if len(commit) != 40 or any(c not in "0123456789abcdef" for c in commit.lower()):
    raise SystemExit("PIPELINE_COMMIT must be an exact 40-character Git commit SHA")
os.environ["PIPELINE_COMMIT"] = commit.lower()
RAW = "https://raw.githubusercontent.com/%s/%s/scripts/preflop-deep" % (REPO, commit)
print("[pipeline] pinned commit: %s" % commit)

# ---- 1. verify and atomically install the approved pipeline ---------------
approved_manifest = os.environ.get("APPROVED_MANIFEST_CHECKSUM", "").strip().lower()
if len(approved_manifest) != 64 or any(c not in "0123456789abcdef" for c in approved_manifest):
    raise SystemExit("APPROVED_MANIFEST_CHECKSUM is required before any pipeline code is installed")
manifest_bytes = urllib.request.urlopen(RAW + "/phases.json", timeout=60).read()
if hashlib.sha256(manifest_bytes).hexdigest() != approved_manifest:
    raise SystemExit("pinned manifest bytes do not match APPROVED_MANIFEST_CHECKSUM")
manifest = json.loads(manifest_bytes.decode())
approved_bundle = str(manifest.get("pipeline_bundle_checksum") or "").lower()
if len(approved_bundle) != 64 or any(c not in "0123456789abcdef" for c in approved_bundle):
    raise SystemExit("approved manifest is missing pipeline_bundle_checksum")
SOURCE_COMBO_ORDER_SCHEMA = "piosolver.show_hand_order.v1"
ARTIFACT_COMBO_ORDER = (
    "card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325"
)
if manifest.get("source_combo_order_schema") != SOURCE_COMBO_ORDER_SCHEMA:
    raise SystemExit("approved manifest is missing the exact Pio hand-order schema")
approved_source_combo_order_sha256 = str(
    manifest.get("source_combo_order_sha256") or ""
).lower()
if (len(approved_source_combo_order_sha256) != 64
        or any(c not in "0123456789abcdef"
               for c in approved_source_combo_order_sha256)):
    raise SystemExit("approved manifest is missing source_combo_order_sha256")

pipeline_files = ("run_machine.py", "tree_gen.py", "pio_harvest.py", "orchestrate.py")
payloads = {}
bundle_digest = hashlib.sha256()
for filename in pipeline_files:
    payload = urllib.request.urlopen(RAW + "/" + filename, timeout=60).read()
    payloads[filename] = payload
    bundle_digest.update(filename.encode() + b"\0" + payload + b"\0")
if bundle_digest.hexdigest() != approved_bundle:
    raise SystemExit("pinned pipeline bundle does not match the approved manifest")
local_launcher_path = os.path.abspath(__file__)
with open(local_launcher_path, "rb") as local_launcher:
    local_launcher_bytes = local_launcher.read()
if local_launcher_bytes != payloads["run_machine.py"]:
    raise SystemExit(
        "running launcher bytes do not match run_machine.py at the protected PIPELINE_COMMIT"
    )
print("[fetch] run_machine.py (%d bytes, self-attested)" % len(local_launcher_bytes))
for filename in pipeline_files:
    if filename == "run_machine.py":
        continue
    destination = os.path.abspath(filename)
    with tempfile.NamedTemporaryFile("wb", delete=False, dir=os.path.dirname(destination),
                                     prefix=filename + ".", suffix=".tmp") as temporary:
        temporary.write(payloads[filename])
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = temporary.name
    os.replace(temporary_path, destination)
    print("[fetch] %s (%d bytes, verified)" % (filename, len(payloads[filename])))

import atexit, queue, subprocess, threading, time

PIO_EXE = os.environ["PIO_EXE"]
approved_solver_version = os.environ.get("PIO_SOLVER_VERSION", "").strip()
if not approved_solver_version:
    raise SystemExit("PIO_SOLVER_VERSION is required for certifiable exports")
if (approved_solver_version != os.environ.get("PIO_SOLVER_VERSION")
        or "\r" in approved_solver_version or "\n" in approved_solver_version):
    raise SystemExit("PIO_SOLVER_VERSION must be one exact canonical show_version response")
approved_binary = os.environ.get("APPROVED_PIO_BINARY_CHECKSUM", "").strip().lower()
if len(approved_binary) != 64 or any(c not in "0123456789abcdef" for c in approved_binary):
    raise SystemExit("APPROVED_PIO_BINARY_CHECKSUM is required before PioSOLVER launches")
binary_digest = hashlib.sha256()
with open(PIO_EXE, "rb") as solver_binary:
    for chunk in iter(lambda: solver_binary.read(1024 * 1024), b""):
        binary_digest.update(chunk)
actual_binary = binary_digest.hexdigest()
if actual_binary != approved_binary:
    raise SystemExit("PioSOLVER binary checksum does not match APPROVED_PIO_BINARY_CHECKSUM")
os.environ["PIO_BINARY_CHECKSUM"] = actual_binary
if not os.environ.get("RANGE_DIRECTORY", "").strip():
    raise SystemExit("RANGE_DIRECTORY is required before PioSOLVER launches")
print("[pio] approved console solver checksum: %s" % actual_binary)

# Import only the checksum-pinned files installed above. The complete manifest
# validator (including the explicit release gate) must run before Popen: a held
# manifest is not permission to start, much less orphan, a solver process.
import pio_harvest as _ph
import orchestrate


# Pio needs the normal Windows process/runtime directories, not the gateway's
# signing secret or any application/database environment. An explicit allowlist
# prevents a newly added parent secret from being inherited by accident.
PIO_CHILD_ENVIRONMENT_ALLOWLIST = frozenset((
    "ALLUSERSPROFILE",
    "APPDATA",
    "COMMONPROGRAMFILES",
    "COMMONPROGRAMFILES(X86)",
    "COMMONPROGRAMW6432",
    "COMSPEC",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "NUMBER_OF_PROCESSORS",
    "OS",
    "PATH",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "PROCESSOR_IDENTIFIER",
    "PROCESSOR_LEVEL",
    "PROCESSOR_REVISION",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMW6432",
    "PUBLIC",
    "SESSIONNAME",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERDOMAIN",
    "USERDOMAIN_ROAMINGPROFILE",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
))


def _solver_child_environment(parent_environment=None):
    source = os.environ if parent_environment is None else parent_environment
    return {
        key: str(value)
        for key, value in source.items()
        if key.upper() in PIO_CHILD_ENVIRONMENT_ALLOWLIST
    }


def _cleanup_solver_process(process, reader=None, grace_seconds=10):
    """Always stop and reap the owned Pio child within bounded waits."""
    if process.poll() is None:
        try:
            process.terminate()
        except OSError:
            pass
        try:
            process.wait(timeout=grace_seconds)
        except subprocess.TimeoutExpired:
            try:
                process.kill()
            except OSError:
                pass
            try:
                process.wait(timeout=grace_seconds)
            except subprocess.TimeoutExpired as exc:
                raise RuntimeError("PioSOLVER child could not be reaped after termination") from exc
    for stream_name in ("stdin", "stdout"):
        stream = getattr(process, stream_name, None)
        if stream is not None:
            try:
                stream.close()
            except OSError:
                pass
    if reader is not None:
        reader.join(timeout=1)


def _launch_approved_solver():
    validated_manifest, _ = orchestrate.validate_manifest(manifest_bytes.decode("utf-8"))
    # A valid manifest is necessary but not sufficient: prove that this exact
    # signed worker identity is still active and that the gateway/database path
    # works before allocating a Pio process. Unlike orchestrate.heartbeat(),
    # this strict preflight deliberately propagates every failure.
    orchestrate._worker_request(
        "heartbeat",
        {
            "phase": "preflight",
            "board": "",
            "spots_done": 0,
            "rows_written": 0,
            "bad": 0,
            "note": "prelaunch active-authority preflight",
        },
        validated_manifest.get("version", "unversioned"),
        approved_manifest,
    )
    print("[pio] launching console solver: %s" % PIO_EXE)
    return subprocess.Popen(
        [PIO_EXE], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, bufsize=1, universal_newlines=True,
        env=_solver_child_environment(),
    )


_proc = _launch_approved_solver()
# Cover failures during transport initialization as well as orchestrator
# execution. The explicit finally below unregisters this fallback and performs
# the same deterministic cleanup with the reader thread attached.
atexit.register(_cleanup_solver_process, _proc)

# Windows pipe reads are blocking, so checking a deadline after readline()
# cannot protect the worker from a silent/hung solver. Keep exactly one reader
# thread for the lifetime of the process and enforce command deadlines while
# waiting on its queue instead.
_STDOUT_EOF = object()
_stdout_queue = queue.Queue()


class SolverTransportFailure(SystemExit):
    """Fatal UPI transport failure; bypasses per-board retry handlers."""


def _pump_solver_stdout():
    try:
        for line in iter(_proc.stdout.readline, ""):
            _stdout_queue.put(line)
    except BaseException as exc:  # surfaced on the command thread below
        _stdout_queue.put(exc)
    finally:
        _stdout_queue.put(_STDOUT_EOF)


_stdout_reader = threading.Thread(
    target=_pump_solver_stdout,
    name="piosolver-stdout-reader",
    daemon=True,
)
_stdout_reader.start()

# last ranges seen on the wire, so we can range-weight EVs without extra state
_last = {"OOP": None, "IP": None}
_pio_to_canonical_combo_index = None
_live_source_combo_order_sha256 = None

# generous ceilings: a deep solve to 0.5% can take minutes
_SLOW = ("go", "wait_for_solver", "build_tree")


def _read_until_end(slow, timeout_seconds=None):
    """Read solver stdout up to the UPI 'END' terminator; return the body."""
    timeout = (7200 if slow else 300) if timeout_seconds is None else timeout_seconds
    if not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("solver response timeout must be a finite positive number")
    deadline = time.monotonic() + timeout
    out = []
    in_solver_update = False
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise SolverTransportFailure("timeout waiting for solver 'END' after command")
        try:
            line = _stdout_queue.get(timeout=remaining)
        except queue.Empty as exc:
            raise SolverTransportFailure("timeout waiting for solver 'END' after command") from exc
        if line is _STDOUT_EOF:
            exit_code = _proc.poll()
            detail = "exit code %s" % exit_code if exit_code is not None else "stdout closed"
            raise SolverTransportFailure(
                "PioSOLVER exited unexpectedly (%s; check PIO_EXE is the CONSOLE build)"
                % detail
            )
        if isinstance(line, BaseException):
            raise SolverTransportFailure("PioSOLVER stdout reader failed: %s" % line) from line
        s = line.rstrip("\r\n")
        # Solving updates are asynchronous protocol messages, not replies to
        # the command currently awaiting its terminator. Multiline updates
        # start with the exact `SOLVER:` marker and own their following END;
        # one-line status updates use `SOLVER: ...` and no terminator.
        if in_solver_update:
            if s == "END":
                in_solver_update = False
            continue
        if s == "SOLVER:":
            in_solver_update = True
            continue
        if s.startswith("SOLVER: "):
            continue
        if s == "END":
            break
        out.append(s)
    return "\n".join(out)


PIO_ACK_COMMANDS = frozenset((
    "add_line",
    "build_tree",
    "clear_lines",
    "go",
    "set_accuracy",
    "set_board",
    "set_eff_stack",
    "set_end_string",
    "set_isomorphism",
    "set_pot",
    "set_rake",
    "set_range",
    "wait_for_solver",
))


def _write_solver_line(command):
    try:
        _proc.stdin.write(command + "\n")
        _proc.stdin.flush()
    except (BrokenPipeError, OSError) as exc:
        raise SolverTransportFailure("PioSOLVER stdin transport failed: %s" % exc) from exc


def _validate_solver_response(command, response, require_ack=True):
    lines = [line.strip() for line in str(response).splitlines() if line.strip()]
    if any(line.upper().startswith("ERROR") for line in lines):
        raise SolverTransportFailure(
            "PioSOLVER rejected %s: %s" % (command.split()[0], " | ".join(lines))
        )
    verb = command.split()[0]
    if require_ack and verb in PIO_ACK_COMMANDS:
        expected = "%s ok!" % verb
        if len(lines) != 1 or lines[0].lower() != expected.lower():
            raise SolverTransportFailure(
                "PioSOLVER returned an invalid acknowledgement for %s" % verb
            )
    return "\n".join(lines)


def _parse_pio_hand_order(response):
    """Validate show_hand_order and map each Pio slot to our canonical slot.

    Pio owns its transport vector order. Training owns a different explicitly
    versioned artifact order. Never assume they are identical: attest all 1326
    unordered two-card combinations and retain the exact Pio serialization for
    provenance before any range is sent.
    """
    tokens = str(response).split()
    ranks = "23456789TJQKA"
    suits = "cdhs"
    if len(tokens) != 1326:
        raise SolverTransportFailure(
            "show_hand_order must return exactly 1326 card-pair tokens"
        )
    mapping = []
    seen = set()
    for token in tokens:
        if (len(token) != 4 or token[0] not in ranks or token[1] not in suits
                or token[2] not in ranks or token[3] not in suits):
            raise SolverTransportFailure("show_hand_order returned a malformed card pair")
        first = ranks.index(token[0]) * 4 + suits.index(token[1])
        second = ranks.index(token[2]) * 4 + suits.index(token[3])
        if first == second:
            raise SolverTransportFailure("show_hand_order returned a duplicate-card pair")
        low, high = sorted((first, second))
        canonical_index = high * (high - 1) // 2 + low
        if canonical_index in seen:
            raise SolverTransportFailure("show_hand_order returned a duplicate combination")
        seen.add(canonical_index)
        mapping.append(canonical_index)
    if seen != set(range(1326)):
        raise SolverTransportFailure("show_hand_order omitted a canonical combination")
    canonical_serialization = " ".join(tokens)
    order_sha256 = hashlib.sha256(canonical_serialization.encode("ascii")).hexdigest()
    return mapping, order_sha256


def _outbound_solver_command(command):
    """Translate canonical artifact ranges into the attested live Pio order."""
    if not command.startswith("set_range "):
        return command
    if _pio_to_canonical_combo_index is None:
        raise SolverTransportFailure("Pio hand order is not attested")
    parts = command.split(" ")
    if (len(parts) != 1328 or parts[0] != "set_range"
            or parts[1] not in ("OOP", "IP") or any(not part for part in parts)):
        raise SolverTransportFailure(
            "set_range must contain one player and exactly 1326 canonical weights"
        )
    canonical_weights = parts[2:]
    pio_weights = [
        canonical_weights[canonical_index]
        for canonical_index in _pio_to_canonical_combo_index
    ]
    return " ".join(parts[:2] + pio_weights)


def _canonicalize_solver_vector_response(command, response):
    """Translate strategy/EV vectors from attested Pio order to artifact order."""
    verb = command.split()[0]
    if verb not in ("show_strategy", "calc_ev"):
        return response
    if _pio_to_canonical_combo_index is None:
        raise SolverTransportFailure("Pio hand order is not attested")
    output = []
    vector_count = 0
    for line in str(response).splitlines():
        parts = line.split()
        if len(parts) >= 1000:
            if len(parts) != 1326:
                raise SolverTransportFailure(
                    "%s returned a non-1326 solver vector" % verb
                )
            try:
                [float(value) for value in parts]
            except ValueError as exc:
                raise SolverTransportFailure(
                    "%s returned a non-numeric solver vector" % verb
                ) from exc
            canonical = [None] * 1326
            for pio_index, canonical_index in enumerate(
                    _pio_to_canonical_combo_index):
                canonical[canonical_index] = parts[pio_index]
            if any(value is None for value in canonical):
                raise SolverTransportFailure("Pio hand-order remap is incomplete")
            output.append(" ".join(canonical))
            vector_count += 1
        else:
            output.append(line)
    if vector_count == 0:
        raise SolverTransportFailure("%s returned no solver vector" % verb)
    return "\n".join(output)


def pio(cmd):
    """Send one UPI command; return its full text output (minus the END line).
    Also snapshots set_range weights so read_results() can range-weight EVs."""
    if (not isinstance(cmd, str) or not cmd or cmd != cmd.strip()
            or "\r" in cmd or "\n" in cmd):
        raise SolverTransportFailure("PioSOLVER command must be one canonical line")
    wire_command = _outbound_solver_command(cmd)
    _write_solver_line(wire_command)
    slow = cmd.split()[0] in _SLOW
    response = _validate_solver_response(cmd, _read_until_end(slow))
    # Snapshot range weights only after Pio confirms the set_range command.
    # A rejected setup command must never make read_results describe a stale
    # tree using the labels/ranges for the failed new request.
    if cmd.startswith("set_range OOP "):
        _last["OOP"] = [float(x) for x in cmd.split()[2:]]
    elif cmd.startswith("set_range IP "):
        _last["IP"] = [float(x) for x in cmd.split()[2:]]
    return _canonicalize_solver_vector_response(cmd, response)


def _validate_startup_handshake(response):
    """Accept only the one documented activation-success pseudo-error banner."""
    lines = [line.strip() for line in str(response).splitlines() if line.strip()]
    activation_marker = "ERROR code 0:"
    marker_positions = [index for index, line in enumerate(lines)
                        if line == activation_marker]
    if marker_positions:
        marker = marker_positions[0]
        if (len(marker_positions) != 1 or lines[marker:marker + 3]
                != [activation_marker, "OK!", "Activation ok!"]):
            raise SolverTransportFailure("PioSOLVER returned an invalid activation banner")
        del lines[marker:marker + 3]
    cleaned = "\n".join(lines)
    _validate_solver_response("set_end_string END", cleaned, require_ack=False)
    if not lines or lines[-1].lower() != "set_end_string ok!":
        raise SolverTransportFailure("PioSOLVER END handshake was not acknowledged")


def _initialize_solver_transport(timeout_seconds=30):
    """Install END framing and attest the live executable before any solve."""
    global _pio_to_canonical_combo_index, _live_source_combo_order_sha256
    try:
        _write_solver_line("set_end_string END")
        handshake = _read_until_end(False, timeout_seconds)
        _validate_startup_handshake(handshake)

        _write_solver_line("show_version")
        live_version = _validate_solver_response(
            "show_version",
            _read_until_end(False, timeout_seconds),
            require_ack=False,
        )
        if live_version != approved_solver_version:
            raise SolverTransportFailure(
                "PioSOLVER show_version does not match approved PIO_SOLVER_VERSION"
            )

        _write_solver_line("show_hand_order")
        hand_order_response = _validate_solver_response(
            "show_hand_order",
            _read_until_end(False, timeout_seconds),
            require_ack=False,
        )
        mapping, live_order_sha256 = _parse_pio_hand_order(hand_order_response)
        if live_order_sha256 != approved_source_combo_order_sha256:
            raise SolverTransportFailure(
                "PioSOLVER show_hand_order does not match approved source combo order"
            )
        if getattr(_ph, "COMBO_ORDER", None) != ARTIFACT_COMBO_ORDER:
            raise SolverTransportFailure(
                "installed harvester does not emit the approved artifact combo order"
            )
        _pio_to_canonical_combo_index = mapping
        _live_source_combo_order_sha256 = live_order_sha256
        os.environ["PIO_SOURCE_COMBO_ORDER_SCHEMA"] = SOURCE_COMBO_ORDER_SCHEMA
        os.environ["PIO_SOURCE_COMBO_ORDER_SHA256"] = live_order_sha256
    except BaseException:
        atexit.unregister(_cleanup_solver_process)
        _cleanup_solver_process(_proc, _stdout_reader)
        raise


_initialize_solver_transport()


def _wavg_bb(ev_chips, matchup_weights):
    """Matchup-weighted average of Pio per-combo chip EVs, in big blinds.

    Official calc_ev returns EVs followed by matchup mass. The original input
    range is not the correct aggregation weight after board and opponent-card
    removal, so accepting that tempting shortcut can certify a wrong game EV.
    """
    if (len(ev_chips) != 1326 or not matchup_weights
            or len(matchup_weights) != 1326):
        raise RuntimeError("solver EV and matchup vectors must contain exactly 1326 combos")
    num = den = 0.0
    for ev, w in zip(ev_chips, matchup_weights):
        if (not isinstance(w, (int, float)) or w < 0 or not math.isfinite(w)):
            raise RuntimeError("solver matchup vector contains an invalid weight")
        if w and not isinstance(ev, (int, float)):
            raise RuntimeError("solver EV vector contains a non-numeric value")
        if w and not math.isfinite(ev):
            raise RuntimeError("solver EV vector contains a non-finite live value")
        if w:
            num += w * ev
            den += w
    if not den:
        raise RuntimeError("solver matchup vector has no live combos for this board")
    result = num / den / 100.0
    if not math.isfinite(result):
        raise RuntimeError("range-weighted solver EV is not finite")
    return result


def _parse_calc_ev_vectors(raw):
    """Return Pio calc_ev's exact (per-combo EV, matchup-mass) vectors."""
    numeric = []
    for line in str(raw).splitlines():
        parts = line.split()
        if len(parts) >= 1000:
            if len(parts) != 1326:
                raise RuntimeError("calc_ev vector must contain exactly 1326 values")
            try:
                values = [float(value) for value in parts]
            except ValueError as exc:
                raise RuntimeError("calc_ev returned a non-numeric vector") from exc
            numeric.append(values)
    if len(numeric) != 2:
        raise RuntimeError("calc_ev must return exact EV and matchup vectors")
    ev_chips, matchup_weights = numeric
    if any(not math.isfinite(value) and not math.isnan(value) for value in ev_chips):
        raise RuntimeError("calc_ev EV vector contains an infinite value")
    if any(not math.isfinite(value) or value < 0 for value in matchup_weights):
        raise RuntimeError("calc_ev matchup vector contains an invalid value")
    return ev_chips, matchup_weights


def _parse_calc_results(raw):
    """Parse the exact named Pio calc_results summary into finite chip units."""
    expected = {
        "running time": "running_time_seconds",
        "ev oop": "ev_oop_chips",
        "ev ip": "ev_ip_chips",
        "oop's mes": "oop_mes_chips",
        "ip's mes": "ip_mes_chips",
        "exploitable for": "exploitability_chips",
    }
    parsed = {}
    for line in str(raw).splitlines():
        if not line.strip() or ":" not in line:
            raise RuntimeError("calc_results returned a malformed named field")
        name, value_text = (part.strip() for part in line.split(":", 1))
        output_name = expected.get(name.lower())
        if not output_name or output_name in parsed or len(value_text.split()) != 1:
            raise RuntimeError("calc_results returned an unknown or duplicate named field")
        try:
            value = float(value_text)
        except ValueError as exc:
            raise RuntimeError("calc_results returned a non-numeric field") from exc
        if not math.isfinite(value):
            raise RuntimeError("calc_results returned a non-finite field")
        parsed[output_name] = value
    if set(parsed) != set(expected.values()):
        raise RuntimeError("calc_results omitted a required named field")
    if parsed["running_time_seconds"] < 0 or parsed["exploitability_chips"] < 0:
        raise RuntimeError("calc_results returned an impossible negative metric")
    return parsed


CALC_RESULTS_EV_TOLERANCE_CHIPS = 0.01


def _assert_calc_results_ev_consistent(ev_oop_bb, ev_ip_bb, summary):
    """Prove vector-weighted EVs match Pio's independent named summary."""
    checks = (
        (ev_oop_bb * 100.0, summary.get("ev_oop_chips"), "OOP"),
        (ev_ip_bb * 100.0, summary.get("ev_ip_chips"), "IP"),
    )
    for weighted_chips, named_chips, player in checks:
        if (not isinstance(named_chips, (int, float))
                or not math.isfinite(named_chips)
                or abs(weighted_chips - named_chips) > CALC_RESULTS_EV_TOLERANCE_CHIPS):
            raise SolverTransportFailure(
                "range-weighted calc_ev does not match calc_results EV %s" % player
            )


def read_results():
    """(ev_oop_bb, ev_ip_bb, exploitability_chips) for the solved root."""
    if not _last["OOP"] or not _last["IP"]:
        raise SolverTransportFailure("both canonical root ranges must be set before EV readout")
    oop_ev, oop_matchups = _parse_calc_ev_vectors(pio("calc_ev OOP r:0"))
    ip_ev, ip_matchups = _parse_calc_ev_vectors(pio("calc_ev IP r:0"))
    ev_oop = _wavg_bb(oop_ev, oop_matchups)
    ev_ip = _wavg_bb(ip_ev, ip_matchups)
    summary = _parse_calc_results(pio("calc_results"))
    _assert_calc_results_ev_consistent(ev_oop, ev_ip, summary)
    return ev_oop, ev_ip, summary["exploitability_chips"]


# ---- 2. wire the transport into the orchestrator and run ------------------
orchestrate.pio = pio
orchestrate.read_results = read_results
print("[run] transport wired; handing off to orchestrator (self-test first)...")


try:
    orchestrate.main()
finally:
    atexit.unregister(_cleanup_solver_process)
    _cleanup_solver_process(_proc, _stdout_reader)
