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

This module is not a standalone launcher. run_machine.py injects the approved
UPI transport and range-weighted EV reader, then calls main(). The range files
must be independently approved 1326-combo artifacts in RANGE_DIRECTORY; the
research-only make_ranges.py output is not accepted.
"""
import sys, os, json, time, datetime, hashlib, urllib.request
import pio_harvest as h

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
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
RAW = "https://raw.githubusercontent.com/Smarter-Poker/Smarter-Poker-World-Hub/%s/scripts/preflop-deep" % PIPELINE_COMMIT
MID = sys.argv[1] if len(sys.argv) > 1 else "M1"
NUM = int(sys.argv[2]) if len(sys.argv) > 2 else 2
IDX = int(sys.argv[3]) if len(sys.argv) > 3 else 0

# Injected only by the pinned run_machine.py launcher. Direct execution fails
# before any solve or write, which prevents an ad-hoc transport from bypassing
# the self-test and manifest checksum gates.
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

def validate_manifest(manifest_text):
    checksum = hashlib.sha256(manifest_text.encode()).hexdigest()
    if checksum != APPROVED_MANIFEST_CHECKSUM:
        raise SystemExit("manifest checksum does not match APPROVED_MANIFEST_CHECKSUM")
    manifest = json.loads(manifest_text)
    gate = manifest.get("release_gate", {})
    if gate.get("solver_ready") is not True:
        raise SystemExit("manifest release gate is closed: %s" % gate.get("reason", "unspecified"))
    if int(manifest.get("version", 0)) < 4 or not manifest.get("phases"):
        raise SystemExit("manifest must be version 4+ with at least one approved phase")
    for ph in manifest["phases"]:
        required = ("id", "game_type", "stack", "street", "streets", "objective",
                    "pot_chips", "eff_chips", "rake",
                    "ip_range", "ip_range_checksum", "oop_range", "oop_range_checksum",
                    "ip_player", "oop_player", "harvest")
        missing = [field for field in required if ph.get(field) in (None, "", [])]
        if missing:
            raise SystemExit("phase %s missing approved inputs: %s" % (ph.get("id", "<unknown>"), ",".join(missing)))
        if any(street not in ("flop", "turn", "river") for street in ph["streets"]):
            raise SystemExit("phase %s contains an unsupported street" % ph["id"])
        if ph["objective"] != "chip_ev":
            raise SystemExit("PioSOLVER worker only accepts the explicit chip_ev objective")
        if "_icm" in ph["game_type"]:
            raise SystemExit("PioSOLVER chip-EV worker cannot certify ICM phases; use an approved ICM objective engine")
    return manifest, checksum

def load_range(name, expected_checksum):
    if len(str(expected_checksum)) != 64:
        raise SystemExit("range checksum is missing for %s" % name)
    file_path = os.path.abspath(os.path.join(RANGE_DIRECTORY, name))
    root = os.path.abspath(RANGE_DIRECTORY) + os.sep
    if not file_path.startswith(root):
        raise SystemExit("range path escapes RANGE_DIRECTORY: %s" % name)
    payload = open(file_path, "rb").read()
    checksum = hashlib.sha256(payload).hexdigest()
    if checksum != expected_checksum:
        raise SystemExit("range checksum mismatch for %s" % name)
    text = payload.decode().strip()
    values = text.split()
    if len(values) != 1326 or any(float(value) < 0 or float(value) > 1 for value in values):
        raise SystemExit("range %s is not a valid 1326-combo weight vector" % name)
    return text

DECK = [r + s for r in "AKQJT98765432" for s in "cdhs"]

def turn_cards(flop):
    on = {flop[i:i+2] for i in range(0, len(flop), 2)}
    return [c for c in DECK if c not in on]

def river_cards(board4):
    on = {board4[i:i+2] for i in range(0, len(board4), 2)}
    return [c for c in DECK if c not in on]

def node_templates(pot):
    """Canonical SRP continuation (75% c-bet called); c-bet code derived from THIS
    phase's pot so the paths are correct at any stack/pot."""
    flop_bet = int(round(pot * 0.75))
    turn_pot = pot + 2 * flop_bet
    turn_bet = int(round(turn_pot * 0.75))
    turn_oop = "r:0:c:b%d:c:%%s" % flop_bet
    river_oop = turn_oop + ":c:b%d:c:%%s" % turn_bet
    return {
        "OOP": {"flop": "r:0", "turn": turn_oop, "river": river_oop},
        "IP": {"flop": "r:0:c", "turn": turn_oop + ":c", "river": river_oop + ":c"},
    }

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
            elif street == "river":
                for tc in turn_cards(flop):
                    b4 = flop + tc
                    for rc in river_cards(b4):
                        b5 = b4 + rc
                        out.append((tmpl[hero]["river"] % (tc, rc), hero, pos, b5,
                                    "river_%s_%s_%dbb_%s" % (gt, pos, stack, b5)))
    return out

ROW_STATE_FIELDS = ("scenario_hash,solved_v2_at,quality_status,solver_version,"
                    "solver_binary_checksum,machine_id,pipeline_commit,manifest_version,"
                    "manifest_checksum,source_artifact_checksum,audited_at")

def certified_row(r):
    return (r.get("solved_v2_at") and r.get("quality_status") == "validated"
            and r.get("solver_version")
            and r.get("solver_binary_checksum") == PIO_BINARY_CHECKSUM
            and r.get("machine_id") in ("M1", "M2")
            and len(r.get("pipeline_commit") or "") == 40
            and r.get("manifest_version")
            and len(r.get("manifest_checksum") or "") == 64
            and len(r.get("source_artifact_checksum") or "") == 64
            and r.get("audited_at"))

def row_states(hashes):
    """Read existence/certification in bounded batches, not one HTTP call per river."""
    states = {sh: [False, False] for sh in hashes}
    unique = sorted(set(hashes))
    for start in range(0, len(unique), 75):
        chunk = unique[start:start + 75]
        path = ("solved_spots_gold?scenario_hash=in.(%s)&select=%s"
                % (",".join(chunk), ROW_STATE_FIELDS))
        _, txt = _rest("GET", path)
        for row in json.loads(txt):
            sh = row.get("scenario_hash")
            if sh not in states:
                continue
            states[sh][0] = True
            states[sh][1] = states[sh][1] or bool(certified_row(row))
    return {sh: tuple(state) for sh, state in states.items()}

def row_state(sh):
    return row_states([sh])[sh]

def patch_v2(sh, sm, manifest_version, manifest_checksum):
    now = datetime.datetime.utcnow().isoformat() + "Z"
    artifact = json.dumps(sm, sort_keys=True, separators=(",", ":")).encode()
    body = {
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
                "&scenario_hash=like.%s&select=scenario_hash&limit=50000"
                % (gt, stack, street, like))
        _, txt = _rest("GET", path)
        for r in json.loads(txt):
            boards.add(r["scenario_hash"].rsplit("_", 1)[-1])
    return sorted(boards)

def solve(board, oop_w, ip_w, pot=550, eff=9750, rake="0 0 0 0"):
    for cmd in h.build_setup_commands(board, oop_w, ip_w, pot, eff, rake):
        pio(cmd)

def self_test(contract):
    board = contract["board"]
    print("[selftest] solving approved reference %s..." % board)
    solve(board,
          load_range(contract["oop_range"], contract["oop_range_checksum"]),
          load_range(contract["ip_range"], contract["ip_range_checksum"]),
          contract["pot_chips"], contract["eff_chips"], contract["rake"])
    ev_oop, ev_ip, expl = read_results()
    _, sm = h.harvest_node(pio, "r:0", "OOP", board, contract["oop_player"],
                           contract["oop_player"], contract["ip_player"], ev_oop, ev_ip, expl,
                           contract["pot_chips"], contract["eff_chips"], contract["rake"],
                           "flop", contract.get("game_type", "self_test"),
                           int(contract.get("stack", contract["eff_chips"] / 100)))
    v = h.validate_row(sm)
    ok = (v["frac_ok"] >= 0.999 and v["ev_ok"]
          and float(contract["ev_oop_min_bb"]) <= ev_oop <= float(contract["ev_oop_max_bb"]))
    print("[selftest] ev_oop=%.3f approved=[%.3f,%.3f] frac_ok=%.4f -> %s"
          % (ev_oop, float(contract["ev_oop_min_bb"]), float(contract["ev_oop_max_bb"]),
             v["frac_ok"], "PASS" if ok else "FAIL"))
    if not ok:
        raise SystemExit("SELF-TEST FAILED - Pio output != verified value; aborting so no bad data is written.")

def main():
    manifest_text = fetch_text("phases.json")
    manifest, manifest_checksum = validate_manifest(manifest_text)
    self_test_contract = manifest.get("self_test")
    if not self_test_contract:
        raise SystemExit("approved manifest is missing its solver self-test contract")
    heartbeat("startup", "", 0, 0, 0, "approved self-test")
    self_test(self_test_contract)
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
            boards = boards_for(gt, stack, street, positions)
            mine = boards[IDX::NUM]
            if not mine:
                continue
            oop_w = load_range(ph["oop_range"], ph["oop_range_checksum"])
            ip_w = load_range(ph["ip_range"], ph["ip_range_checksum"])
            pot = ph.get("pot_chips", 550); eff = ph.get("eff_chips", 9750); rake = ph.get("rake", "0 0 0 0")
            for board in mine:  # board == flop
                targets = expand_targets(ph, board)
                states = row_states([target[4] for target in targets])
                todo = [target for target in targets
                        if states[target[4]][0] and not states[target[4]][1]]
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
                                               ph["oop_player"], ph["ip_player"], ev_oop, ev_ip, expl,
                                               pot, eff, rake,
                                               {6: "flop", 8: "turn", 10: "river"}[len(full)],
                                               gt, stack)
                        v = h.validate_row(sm)
                        json.dump({"scenario_hash": sh, "strategy_matrix_v2": sm, "_qc": v},
                                  open("backup/%s.json" % sh, "w"))
                        if v["frac_ok"] >= 0.98 and v["ev_ok"] and patch_v2(
                                sh, sm, manifest_version, manifest_checksum):
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
