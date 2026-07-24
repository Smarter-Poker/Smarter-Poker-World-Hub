"""
ONE-AND-DONE autonomous batch: solve -> harvest -> validate -> write to Supabase.
No files to relay. Run it, walk away; rows land in strategy_matrix_v2 directly.

Fills BOTH perspectives from each BTN-vs-BB solve:
  - BB (OOP) flop decision      -> node r:0     -> 6max_cash_BB_100bb_<board>
  - BTN (IP) c-bet after check  -> node r:0:c   -> 6max_cash_BTN_100bb_<board> (only if that row exists)

Resumable (skips rows whose strategy_matrix_v2 is already set) and QC-gated
(only writes rows with per-hand action sums in [0.98,1.02]). Never touches the
old strategy_matrix column.

SETUP on the machine:
  set env:  SUPABASE_URL=https://kuklfnapbkmacvwxktbh.supabase.co
            SUPABASE_SERVICE_ROLE_KEY=<service role key>   (from the app .env)
  pip install requests    (if missing; this script uses only stdlib urllib)
  wire the two stubs below (pio + read_results) to your working UPI wrapper.

RUN (split across the two boxes):
  MACHINE 1:  python run_and_ingest.py spot001_oop_BB.txt spot001_ip_BTN.txt flops_bb_6max_100bb.txt 0 24
  MACHINE 2:  python run_and_ingest.py spot001_oop_BB.txt spot001_ip_BTN.txt flops_bb_6max_100bb.txt 24 48
"""
import sys, os, json, datetime, urllib.request, urllib.error
import pio_harvest as h

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
GAME, STACK = "6max_cash", 100

# ===== FILL IN with your working UPI transport =====
def pio(cmd):
    raise NotImplementedError("wire to your PioSOLVER UPI wrapper -> full command output")
def read_results():
    """Return (ev_oop_bb, ev_ip_bb, exploit_pct) from calc_results (chip EVs / 100)."""
    raise NotImplementedError("return (ev_oop_bb, ev_ip_bb, exploit_pct)")
# ===================================================


def _req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + "/rest/v1/" + path, data=data, headers=HEAD, method=method)
    with urllib.request.urlopen(r, timeout=60) as resp:
        return resp.status, resp.read().decode()


def row_state(scenario_hash):
    """(exists, v2_done) for a scenario_hash."""
    _, txt = _req("GET", "solved_spots_gold?scenario_hash=eq.%s&select=solved_v2_at" % scenario_hash)
    rows = json.loads(txt)
    if not rows:
        return False, False
    return True, any(r.get("solved_v2_at") for r in rows)


def patch_v2(scenario_hash, sm):
    body = {"strategy_matrix_v2": sm, "solved_v2_at": datetime.datetime.utcnow().isoformat() + "Z"}
    st, _ = _req("PATCH", "solved_spots_gold?scenario_hash=eq.%s" % scenario_hash, body)
    return st


def main():
    oop_f, ip_f, boards_f = sys.argv[1:4]
    start = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    end = int(sys.argv[5]) if len(sys.argv) > 5 else 10**9
    oop_w, ip_w = open(oop_f).read().strip(), open(ip_f).read().strip()
    boards = [b.strip() for b in open(boards_f) if b.strip()][start:end]
    os.makedirs("backup", exist_ok=True)
    done = skipped = wrote = bad = 0

    for i, board in enumerate(boards):
        bb_hash = "%s_BB_%dbb_%s" % (GAME, STACK, board)
        exists, v2done = row_state(bb_hash)
        if v2done:
            skipped += 1; print("[%d/%d] %s SKIP (v2 already set)" % (i + 1, len(boards), board)); continue

        for cmd in h.build_setup_commands(board, oop_w, ip_w):
            pio(cmd)
        ev_oop, ev_ip, expl = read_results()

        # BB (OOP) root + BTN (IP) c-bet-after-check, from the same solve
        targets = [("r:0", "OOP", "BB"), ("r:0:c", "IP", "BTN")]
        rows_out = []
        for node, player, pos in targets:
            sh, sm = h.harvest_node(pio, node, player, board, pos, "BB", "BTN", ev_oop, ev_ip, expl)
            v = h.validate_row(sm)
            rows_out.append((sh, sm, v, pos))

        json.dump([{"scenario_hash": s, "strategy_matrix_v2": m, "_qc": v}
                   for s, m, v, _ in rows_out], open("backup/%s.json" % board, "w"))

        for sh, sm, v, pos in rows_out:
            if v["frac_ok"] < 0.98:
                bad += 1; print("   ! %s frac_ok=%.4f -> NOT written" % (sh, v["frac_ok"])); continue
            ex, vd = row_state(sh)
            if not ex:
                print("   - %s no row (skip write)" % sh); continue
            if vd:
                continue
            st = patch_v2(sh, sm)
            if 200 <= st < 300:
                wrote += 1
            else:
                print("   ! PATCH %s -> HTTP %s" % (sh, st))
        done += 1
        print("[%d/%d] %s ok  ev_oop=%.3f  (BB frac=%.4f, BTN frac=%.4f)"
              % (i + 1, len(boards), board, ev_oop, rows_out[0][2]["frac_ok"], rows_out[1][2]["frac_ok"]))

    print("DONE: solved=%d skipped=%d rows_written=%d bad=%d" % (done, skipped, wrote, bad))


if __name__ == "__main__":
    main()
