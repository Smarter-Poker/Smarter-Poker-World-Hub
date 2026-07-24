"""
TURN EXTRACTION — VERIFY ONLY (writes nothing).
Proves we can pull turn scenarios out of a flop solve via a fixed continuation
line, and that the resulting scenario_hash matches what the trainer stores.

Canonical continuation to the turn (single-raised pot, standard 75% c-bet called):
    OOP checks  ->  IP bets 75% (b412)  ->  OOP calls  ->  TURN
  OOP (BB) turn decision node:  r:0:c:b412:c:<turn>
  IP  (BTN) turn decision node: r:0:c:b412:c:<turn>:c   (after OOP checks the turn)
Turn scenario_hash: turn_<game>_<pos>_<stack>bb_<flop><turncard>

Run after wiring pio()/read_results() (same as orchestrate.py). It solves the
flop, walks to a few turn cards, harvests, and PRINTS the mapping + a poker-sanity
line so I can confirm the convention before enabling any turn writes.
"""
import sys, os, json, urllib.request
import pio_harvest as h

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
GAME, STACK = "6max_cash", 100
RANKS = "AKQJT98765432"; SUITS = "cdhs"

def pio(cmd):
    raise NotImplementedError("wire to your PioSOLVER UPI wrapper")
def read_results():
    raise NotImplementedError("return (ev_oop_bb, ev_ip_bb, exploit_pct)")

def _get(path):
    with urllib.request.urlopen(urllib.request.Request(URL + "/rest/v1/" + path, headers=HEAD), timeout=60) as r:
        return json.loads(r.read().decode())

def main():
    flop = sys.argv[1] if len(sys.argv) > 1 else "Qh7s2c"   # must be a solved BTN-vs-BB flop
    oop_w = open("ranges/BBflat_vs_BTN_100.txt").read().strip()
    ip_w = open("ranges/RFI_BTN_100.txt").read().strip()
    print("solving flop", flop, "(BTN-vs-BB)...")
    for cmd in h.build_setup_commands(flop, oop_w, ip_w):
        pio(cmd)
    ev_oop, ev_ip, expl = read_results()

    board_cards = {flop[i:i+2] for i in range(0, len(flop), 2)}
    turn_cards = [r + s for r in RANKS for s in SUITS if (r + s) not in board_cards][:6]  # sample 6

    print("\n=== TURN EXTRACTION (verify only) ===")
    for tc in turn_cards:
        board4 = flop + tc
        node_bb = "r:0:c:b412:c:%s" % tc
        try:
            _, sm = h.harvest_node(pio, node_bb, "OOP", board4, "BB", "BB", "BTN", ev_oop, ev_ip, expl)
            v = h.validate_row(sm)
            sh = "turn_%s_BB_%dbb_%s" % (GAME, STACK, board4)
            exists = bool(_get("solved_spots_gold?scenario_hash=eq.%s&select=id&limit=1" % sh))
            print("BB turn %s | node=%s | hash=%s | in_DB=%s | frac_ok=%.3f | actions=%s"
                  % (board4, node_bb, sh, exists, v["frac_ok"], [a["code"] for a in sm["actions"]]))
        except Exception as e:
            print("BB turn %s ERROR: %s" % (board4, e))
    print("\nNOTHING WRITTEN. Paste this back so the line convention can be confirmed.")

if __name__ == "__main__":
    main()
