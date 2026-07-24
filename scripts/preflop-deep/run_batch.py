"""
Batch runner for one matchup across many flops. Machine fills in ONE thing: the
`pio(cmd)->str` transport using its already-working PioSOLVER UPI wrapper (the
one that returns full command output; use your echo-END / readline fix).

Usage on the machine:
  python run_batch.py <oop_range_file> <ip_range_file> <position> <boards_file> [start] [end]
e.g. Machine 1:  python run_batch.py spot001_oop_BB.txt spot001_ip_BTN.txt BB flops_batch1.txt 0 12
     Machine 2:  python run_batch.py spot001_oop_BB.txt spot001_ip_BTN.txt BB flops_batch1.txt 12 24
Writes batch_<position>_<start>_<end>.json  ->  push that file back for ingestion.
"""
import sys, json, pio_harvest as h

# ============================================================================
# FILL THIS IN with your working UPI transport. It must send `cmd` to PioSOLVER
# and return the FULL text output of that command (blocking until complete).
def pio(cmd):
    raise NotImplementedError("Wire this to your PioSOLVER UPI wrapper")
# Also provide the two overall-EV scalars from calc_results after each solve:
def read_results():
    """Return (ev_oop_bb, ev_ip_bb, exploitability_pct) parsed from calc_results.
    You already read 'EV OOP: X chips' -> divide by 100 for bb."""
    raise NotImplementedError("Return (ev_oop_bb, ev_ip_bb, exploit_pct) from calc_results")
# ============================================================================


def main():
    oop_f, ip_f, position, boards_f = sys.argv[1:5]
    start = int(sys.argv[5]) if len(sys.argv) > 5 else 0
    end = int(sys.argv[6]) if len(sys.argv) > 6 else 10**9
    oop_w = open(oop_f).read().strip()
    ip_w = open(ip_f).read().strip()
    ip_player = "BTN" if position == "BB" else "?"  # matchup-specific; BB<-BTN for spot001
    boards = [b.strip() for b in open(boards_f) if b.strip()][start:end]

    rows = []
    for i, board in enumerate(boards):
        for cmd in h.build_setup_commands(board, oop_w, ip_w):
            pio(cmd)
        ev_oop, ev_ip, expl = read_results()
        sh, sm = h.harvest_root(pio, board, position, position, ip_player, ev_oop, ev_ip, expl)
        v = h.validate_row(sm)
        rows.append({"scenario_hash": sh, "strategy_matrix_v2": sm, "_qc": v})
        print("[%d/%d] %s  frac_ok=%.4f live=%d bad=%d  ev_oop=%.3f"
              % (i + 1, len(boards), sh, v["frac_ok"], v["live_hands"], v["bad_sum_hands"], ev_oop))

    out = "batch_%s_%d_%d.json" % (position, start, end)
    json.dump(rows, open(out, "w"))
    print("wrote %s (%d rows)" % (out, len(rows)))


if __name__ == "__main__":
    main()
