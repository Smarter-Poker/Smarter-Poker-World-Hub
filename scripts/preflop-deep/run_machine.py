"""
SMARTER-POKER — ONE-COMMAND MACHINE LAUNCHER
============================================================================
Turnkey. Run this ONE file on each solver box. It:
  1. Fetches the pinned pipeline (tree_gen / pio_harvest /
     orchestrate) from one exact protected commit — never a moving branch.
  2. Launches your PioSOLVER **console** solver (UPI mode) as a subprocess and
     provides a real transport (send command -> read until 'END'), so the two
     stubs in orchestrate.py are filled automatically. Nothing to hand-wire.
  3. Computes the game-level EVs itself (range-weighted from calc_ev), so the
     self-test and every harvest get correct chip-EV/bb numbers.
  4. Hands control to orchestrate.main(): self-test -> solve phases.json ->
     harvest approved flop/turn/river nodes -> write strategy_matrix_v2 to Supabase -> heartbeat
     -> auto-advance to new phases as they land. Deletes nothing. Resumable.

REQUIRED ENV (set before running):
  SUPABASE_URL=https://kuklfnapbkmacvwxktbh.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<service role key>
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
import sys, os, json, urllib.request, hashlib, math, tempfile

BASE_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIRECTORY)
if BASE_DIRECTORY not in sys.path:
    sys.path.insert(0, BASE_DIRECTORY)

REPO = "Smarter-Poker/Smarter-Poker-World-Hub"
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

pipeline_files = ("tree_gen.py", "pio_harvest.py", "orchestrate.py")
payloads = {}
bundle_digest = hashlib.sha256()
for filename in pipeline_files:
    payload = urllib.request.urlopen(RAW + "/" + filename, timeout=60).read()
    payloads[filename] = payload
    bundle_digest.update(filename.encode() + b"\0" + payload + b"\0")
if bundle_digest.hexdigest() != approved_bundle:
    raise SystemExit("pinned pipeline bundle does not match the approved manifest")
for filename in pipeline_files:
    destination = os.path.abspath(filename)
    with tempfile.NamedTemporaryFile("wb", delete=False, dir=os.path.dirname(destination),
                                     prefix=filename + ".", suffix=".tmp") as temporary:
        temporary.write(payloads[filename])
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = temporary.name
    os.replace(temporary_path, destination)
    print("[fetch] %s (%d bytes, verified)" % (filename, len(payloads[filename])))

import subprocess, time
import pio_harvest as _ph

PIO_EXE = os.environ["PIO_EXE"]
if not os.environ.get("PIO_SOLVER_VERSION", "").strip():
    raise SystemExit("PIO_SOLVER_VERSION is required for certifiable exports")
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
print("[pio] launching console solver: %s" % PIO_EXE)
_proc = subprocess.Popen(
    [PIO_EXE], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT, bufsize=1, universal_newlines=True,
)

# last ranges seen on the wire, so we can range-weight EVs without extra state
_last = {"OOP": None, "IP": None}

# generous ceilings: a deep solve to 0.5% can take minutes
_SLOW = ("go", "wait_for_solver", "build_tree")


def _read_until_end(slow):
    """Read solver stdout up to the UPI 'END' terminator; return the body."""
    deadline = time.time() + (7200 if slow else 300)
    out = []
    while True:
        line = _proc.stdout.readline()
        if line == "":
            raise RuntimeError("PioSOLVER exited unexpectedly (check PIO_EXE is the CONSOLE build)")
        s = line.rstrip("\r\n")
        if s == "END":
            break
        out.append(s)
        if time.time() > deadline:
            raise RuntimeError("timeout waiting for solver 'END' after command")
    return "\n".join(out)


def pio(cmd):
    """Send one UPI command; return its full text output (minus the END line).
    Also snapshots set_range weights so read_results() can range-weight EVs."""
    c = cmd.strip()
    if c.startswith("set_range OOP "):
        _last["OOP"] = [float(x) for x in c.split()[2:]]
    elif c.startswith("set_range IP "):
        _last["IP"] = [float(x) for x in c.split()[2:]]
    _proc.stdin.write(c + "\n")
    _proc.stdin.flush()
    slow = c.split()[0] in _SLOW if c else False
    return _read_until_end(slow)


def _wavg_bb(ev_chips, weights):
    """Range-weighted average of a per-combo chip-EV array, in big blinds.
    Skips board-blocked combos (Pio returns nan) and zero-weight hands."""
    if len(ev_chips) != 1326 or not weights or len(weights) != 1326:
        raise RuntimeError("solver EV and range vectors must contain exactly 1326 combos")
    num = den = 0.0
    for ev, w in zip(ev_chips, weights):
        if not isinstance(w, (int, float)) or not 0 <= w <= 1 or not math.isfinite(w):
            raise RuntimeError("solver range contains an invalid weight")
        if w and math.isfinite(ev):
            num += w * ev
            den += w
    if not den:
        raise RuntimeError("solver range has no live combos for this board")
    result = num / den / 100.0
    if not math.isfinite(result):
        raise RuntimeError("range-weighted solver EV is not finite")
    return result


def _parse_expl(raw):
    """Parse one finite exploitability value; missing output is not exact evidence."""
    nums = []
    for tok in raw.replace("%", " ").split():
        try:
            nums.append(float(tok))
        except ValueError:
            pass
    if not nums or not math.isfinite(nums[-1]):
        raise RuntimeError("solver did not return finite exploitability")
    return nums[-1]


def read_results():
    """(ev_oop_bb, ev_ip_bb, exploit_pct) for the just-solved tree root."""
    ev_oop = _wavg_bb(_ph.parse_ev_array0(pio("calc_ev OOP r:0")), _last["OOP"])
    ev_ip = _wavg_bb(_ph.parse_ev_array0(pio("calc_ev IP r:0")), _last["IP"])
    expl = _parse_expl(pio("calc_exploitability"))
    return ev_oop, ev_ip, expl


# ---- 2. wire the transport into the orchestrator and run ------------------
import orchestrate
orchestrate.pio = pio
orchestrate.read_results = read_results
print("[run] transport wired; handing off to orchestrator (self-test first)...")
orchestrate.main()
