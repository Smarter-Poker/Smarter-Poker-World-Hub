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
import sys, os, urllib.request, hashlib

REPO = "Smarter-Poker/Smarter-Poker-World-Hub"
commit = os.environ.get("PIPELINE_COMMIT", "").strip()
if not commit:
    raise SystemExit("PIPELINE_COMMIT is required; solver hosts may not follow a moving main branch")
if len(commit) != 40 or any(c not in "0123456789abcdef" for c in commit.lower()):
    raise SystemExit("PIPELINE_COMMIT must be an exact 40-character Git commit SHA")
os.environ["PIPELINE_COMMIT"] = commit.lower()
RAW = "https://raw.githubusercontent.com/%s/%s/scripts/preflop-deep" % (REPO, commit)
print("[pipeline] pinned commit: %s" % commit)

# ---- 1. pull the live pipeline next to this launcher ----------------------
for f in ("tree_gen.py", "pio_harvest.py", "orchestrate.py"):
    data = urllib.request.urlopen(RAW + "/" + f, timeout=60).read()
    open(f, "wb").write(data)
    print("[fetch] %s (%d bytes)" % (f, len(data)))

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
approved_manifest = os.environ.get("APPROVED_MANIFEST_CHECKSUM", "").strip().lower()
if len(approved_manifest) != 64 or any(c not in "0123456789abcdef" for c in approved_manifest):
    raise SystemExit("APPROVED_MANIFEST_CHECKSUM is required before PioSOLVER launches")
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
    num = den = 0.0
    for ev, w in zip(ev_chips, weights):
        if w and ev == ev:            # ev==ev filters nan
            num += w * ev
            den += w
    return (num / den / 100.0) if den else float("nan")


def _parse_expl(raw):
    """Best-effort exploitability (informational; not a gate). Returns a float."""
    nums = []
    for tok in raw.replace("%", " ").split():
        try:
            nums.append(float(tok))
        except ValueError:
            pass
    return nums[-1] if nums else 0.0


def read_results():
    """(ev_oop_bb, ev_ip_bb, exploit_pct) for the just-solved tree root."""
    ev_oop = _wavg_bb(_ph.parse_ev_array0(pio("calc_ev OOP r:0")), _last["OOP"])
    ev_ip = _wavg_bb(_ph.parse_ev_array0(pio("calc_ev IP r:0")), _last["IP"])
    try:
        expl = _parse_expl(pio("calc_exploitability"))
    except Exception:
        expl = 0.0
    return ev_oop, ev_ip, expl


# ---- 2. wire the transport into the orchestrator and run ------------------
import orchestrate
orchestrate.pio = pio
orchestrate.read_results = read_results
print("[run] transport wired; handing off to orchestrator (self-test first)...")
orchestrate.main()
