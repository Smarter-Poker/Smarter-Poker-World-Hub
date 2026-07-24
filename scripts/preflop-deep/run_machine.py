"""
SMARTER-POKER — ONE-COMMAND MACHINE LAUNCHER
============================================================================
Turnkey. Run this ONE file on each solver box. It:
  1. Fetches the live pipeline (tree_gen / pio_harvest / make_ranges /
     orchestrate) from the repo main branch — so you always run current code.
  2. Launches your PioSOLVER **console** solver (UPI mode) as a subprocess and
     provides a real transport (send command -> read until 'END'), so the two
     stubs in orchestrate.py are filled automatically. Nothing to hand-wire.
  3. Computes the game-level EVs itself (range-weighted from calc_ev), so the
     self-test and every harvest get correct chip-EV/bb numbers.
  4. Hands control to orchestrate.main(): self-test -> solve phases.json ->
     harvest flop + turn -> write strategy_matrix_v2 to Supabase -> heartbeat
     -> auto-advance to new phases as they land. Deletes nothing. Resumable.

REQUIRED ENV (set before running):
  SUPABASE_URL=https://kuklfnapbkmacvwxktbh.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<service role key>
  PIO_EXE=<full path to your PioSOLVER CONSOLE exe>   e.g.
      C:\\PioSOLVER\\PioSOLVER3-pro.exe   (must be the console/UPI build)

RUN:
  MACHINE 1:  python run_machine.py M1 2 0
  MACHINE 2:  python run_machine.py M2 2 1

Safety: if the transport or engine is off in any way, the startup self-test
FAILS LOUDLY and aborts before a single row is written — it never guesses.
"""
import sys, os, urllib.request

RAW = "https://raw.githubusercontent.com/Smarter-Poker/Smarter-Poker-World-Hub/main/scripts/preflop-deep"

# ---- 1. pull the live pipeline next to this launcher ----------------------
for f in ("tree_gen.py", "pio_harvest.py", "make_ranges.py", "orchestrate.py"):
    data = urllib.request.urlopen(RAW + "/" + f, timeout=60).read()
    open(f, "wb").write(data)
    print("[fetch] %s (%d bytes)" % (f, len(data)))

import subprocess, time
import pio_harvest as _ph

PIO_EXE = os.environ["PIO_EXE"]
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
