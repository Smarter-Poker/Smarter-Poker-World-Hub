"""
SMARTER-POKER SOLVER ORCHESTRATOR  (launch once; runs until every phase is done)
================================================================================
One command per machine. Self-tests, then works through phases.json (fetched live
from the repo), auto-advancing with no re-prompt. Each phase carries its OWN
game config -> pot_chips (antes), eff_chips (blind depth), rake (cash vs
tournament), ranges (format/depth) -> so cash and tournament and each stack solve
completely different games. Per flop solve it also harvests the turn rows off the
same tree. Writes strategy_matrix_v2 straight to the DB (deletes nothing;
resumable; 2-machine auto-split; heartbeat to solver_status).

SETUP (once):
  set SUPABASE_URL=https://kuklfnapbkmacvwxktbh.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=<service role key>
  python make_ranges.py            (writes ranges/*.txt)
  wire the two stubs below (pio + read_results) to your UPI wrapper.
RUN:
  MACHINE 1:  python orchestrate.py M1 2 0
  MACHINE 2:  python orchestrate.py M2 2 1
"""
import sys, os, json, time, datetime, urllib.request
import pio_harvest as h

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
RAW = "https://raw.githubusercontent.com/Smarter-Poker/Smarter-Poker-World-Hub/main/scripts/preflop-deep"
MID = sys.argv[1] if len(sys.argv) > 1 else "M1"
NUM = int(sys.argv[2]) if len(sys.argv) > 2 else 2
IDX = int(sys.argv[3]) if len(sys.argv) > 3 else 0

# ===== FILL IN with your working UPI transport =====
def pio(cmd):
    raise NotImplementedError("wire to your PioSOLVER UPI wrapper -> full command output")
def read_results():
    """Return (ev_oop_bb, ev_ip_bb, exploit_pct) from calc_results (chip EVs / 100)."""
    raise NotImplementedError("return (ev_oop_bb, ev_ip_bb, exploit_pct)")
# ===================================================


def _rest(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + "/rest/v1/" + path, data=data, headers=HEAD, method=method)
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.status, r.read().decode()

def fetch_text(name):
    with urllib.request.urlopen(RAW + "/" + name, timeout=60) as r:
        return r.read().decode()

def ensure_ranges():
    try:
        open("make_ranges.py", "w").write(fetch_text("make_ranges.py"))
        import subprocess
        subprocess.run([sys.executable, "make_ranges.py"], check=True)
    except Exception as e:
        print("[ensure_ranges]", e)

def load_range(name):
    return open(os.path.join("ranges", name)).read().strip()

DECK = [r + s for r in "AKQJT98765432" for s in "cdhs"]

def turn_cards(flop):
    on = {flop[i:i+2] for i in range(0, len(flop), 2)}
    return [c for c in DECK if c not in on]

def node_templates(pot):
    """Canonical SRP continuation (75% c-bet called); c-bet code derived from THIS
    phase's pot so the paths are correct at any stack/pot."""
    cb = int(round(pot * 0.75))
    return {"OOP": {"flop": "r:0",   "turn": "r:0:c:b%d:c:%%s" % cb},
            "IP":  {"flop": "r:0:c", "turn": "r:0:c:b%d:c:%%s:c" % cb}}

def expand_targets(ph, flop):
    gt, stack = ph["game_type"], ph["stack"]
    tmpl = node_templates(ph.get("pot_chips", 550))
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
    return out

def row_state(sh):
    _, txt = _rest("GET", "solved_spots_gold?scenario_hash=eq.%s&select=solved_v2_at" % sh)
    rows = json.loads(txt)
    if not rows:
        return False, False
    return True, any(r.get("solved_v2_at") for r in rows)

def patch_v2(sh, sm):
    body = {"strategy_matrix_v2": sm, "solved_v2_at": datetime.datetime.utcnow().isoformat() + "Z"}
    st, _ = _rest("PATCH", "solved_spots_gold?scenario_hash=eq.%s" % sh, body)
    return 200 <= st < 300

def heartbeat(phase, board, done, wrote, bad, note):
    try:
        _rest("POST", "solver_status?on_conflict=machine_id",
              {"machine_id": MID, "phase": phase, "board": board, "spots_done": done,
               "rows_written": wrote, "bad": bad, "note": note,
               "updated_at": datetime.datetime.utcnow().isoformat() + "Z"})
    except Exception as e:
        print("[hb] ", e)

def boards_for(gt, stack, street, positions):
    boards = set()
    for pos in positions:
        like = "%s_%s_%dbb_%%" % (gt, pos, stack)
        path = ("solved_spots_gold?game_type=eq.%s&stack_depth=eq.%d&street=eq.%s"
                "&strategy_matrix_v2=is.null&scenario_hash=like.%s&select=scenario_hash&limit=50000"
                % (gt, stack, street, like))
        _, txt = _rest("GET", path)
        for r in json.loads(txt):
            boards.add(r["scenario_hash"].rsplit("_", 1)[-1])
    return sorted(boards)

def solve(board, oop_w, ip_w, pot=550, eff=9750, rake="0 0 0 0"):
    for cmd in h.build_setup_commands(board, oop_w, ip_w, pot, eff, rake):
        pio(cmd)

def self_test():
    print("[selftest] solving spot001 Qh7s2c (BTN-vs-BB)...")
    solve("Qh7s2c", load_range("BBflat_vs_BTN_100.txt"), load_range("RFI_BTN_100.txt"))
    ev_oop, ev_ip, expl = read_results()
    _, sm = h.harvest_node(pio, "r:0", "OOP", "Qh7s2c", "BB", "BB", "BTN", ev_oop, ev_ip, expl)
    v = h.validate_row(sm)
    ok = (v["frac_ok"] >= 0.999 and 1.90 <= ev_oop <= 2.00)
    print("[selftest] ev_oop=%.3f (expect ~1.961)  frac_ok=%.4f  -> %s"
          % (ev_oop, v["frac_ok"], "PASS" if ok else "FAIL"))
    if not ok:
        raise SystemExit("SELF-TEST FAILED - Pio output != verified value; aborting so no bad data is written.")

def main():
    heartbeat("startup", "", 0, 0, 0, "self-test")
    ensure_ranges()
    self_test()
    os.makedirs("backup", exist_ok=True)
    wrote = bad = spots = 0
    while True:
        ensure_ranges()
        manifest = json.loads(fetch_text("phases.json"))
        did_work = False
        for ph in manifest["phases"]:
            gt, stack, street = ph["game_type"], ph["stack"], ph["street"]
            positions = sorted({t["position"] for t in ph["harvest"]})
            boards = boards_for(gt, stack, street, positions)
            mine = boards[IDX::NUM]
            if not mine:
                continue
            oop_w = load_range(ph["oop_range"])
            ip_w = load_range(ph["ip_range"])
            pot = ph.get("pot_chips", 550); eff = ph.get("eff_chips", 9750); rake = ph.get("rake", "0 0 0 0")
            for board in mine:  # board == flop
                todo = []
                for node, hero, pos, full, sh in expand_targets(ph, board):
                    ex, done = row_state(sh)
                    if ex and not done:
                        todo.append((node, hero, pos, full, sh))
                if not todo:
                    continue
                try:
                    solve(board, oop_w, ip_w, pot, eff, rake)
                    ev_oop, ev_ip, expl = read_results()
                except Exception as e:
                    print("[solve-error]", board, e); heartbeat(ph["id"], board, spots, wrote, bad, "solve error: %s" % e); continue
                for node, hero, pos, full, sh in todo:
                    try:
                        _, sm = h.harvest_node(pio, node, hero, full, pos,
                                               ph["oop_player"], ph["ip_player"], ev_oop, ev_ip, expl)
                        v = h.validate_row(sm)
                        json.dump({"scenario_hash": sh, "strategy_matrix_v2": sm, "_qc": v},
                                  open("backup/%s.json" % sh, "w"))
                        if v["frac_ok"] >= 0.98 and patch_v2(sh, sm):
                            wrote += 1
                        else:
                            bad += 1; print("   ! %s frac_ok=%.4f not written" % (sh, v["frac_ok"]))
                    except Exception as e:
                        bad += 1; print("[harvest-error]", sh, e)
                spots += 1; did_work = True
                print("[%s] %s flop=%s targets=%d ev_oop=%.3f wrote=%d bad=%d" % (MID, ph["id"], board, len(todo), ev_oop, wrote, bad))
                heartbeat(ph["id"], board, spots, wrote, bad, "running")
        if not did_work:
            heartbeat("idle", "", spots, wrote, bad, "all committed phases complete; polling for new phases")
            print("[%s] all phases complete (%d spots, %d rows). Polling in 10 min..." % (MID, spots, wrote))
            time.sleep(600)

if __name__ == "__main__":
    main()
