#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# CHAOS DRILL — Signup Failure Mode Simulation
# ─────────────────────────────────────────────────────────────────────────
# Runs each known signup failure mode and verifies our test guards detect it.
#
# Strategy: ONE sandbox. Each drill saves the files it modifies, applies
# the breakage, runs tests, restores the files. Way more disk-efficient
# than re-snapshotting per drill.
#
# Usage:   bash scripts/chaos-signup-drill.sh
# Exit 0 — all failure modes detected by guards
# Exit 1 — at least one failure mode slipped through
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX="/tmp/signup-chaos-$$"
BACKUPS="$SANDBOX/.backups"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cleanup() { cd /tmp; rm -rf "$SANDBOX"; }
trap cleanup EXIT

DRILL_PASS=0
DRILL_FAIL=0
DRILL_NUM=0

# Snapshot only what the tests need (much smaller than full repo)
echo "Snapshotting minimal repo to $SANDBOX (excludes node_modules, .next, .git)…"
mkdir -p "$SANDBOX" "$BACKUPS"
rsync -a \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.git/objects' \
    --exclude='.git/lfs' \
    --exclude='*.log' \
    --exclude='public/hub/club-arena/assets' \
    --exclude='public/videos' \
    --exclude='public/sounds' \
    --exclude='public/horses' \
    --exclude='/tmp' \
    --exclude='*.mp4' \
    --exclude='*.mp3' \
    --exclude='*.webm' \
    --exclude='*.png' \
    --exclude='*.jpg' \
    --exclude='*.jpeg' \
    --exclude='*.gif' \
    --exclude='*.svg' \
    --exclude='*.ico' \
    --exclude='*.gltf' \
    --exclude='*.glb' \
    --exclude='*.wav' \
    --exclude='*.numbers' \
    --exclude='*.docx' \
    --exclude='*.pptx' \
    "$ROOT/" "$SANDBOX/"

cd "$SANDBOX"
du -sh "$SANDBOX" | head -1

# ─── Helpers ──────────────────────────────────────────────────────────────

# save_file <relpath> — backs up a file so we can restore after the drill
save_file() {
    local rel="$1"
    local backup="$BACKUPS/$(echo "$rel" | tr '/' '_')"
    if [ -f "$rel" ]; then
        cp "$rel" "$backup"
    else
        # File didn't exist — record that fact
        echo "_DID_NOT_EXIST_" > "$backup.marker"
    fi
}

# restore_file <relpath> — restores a previously saved file
restore_file() {
    local rel="$1"
    local backup="$BACKUPS/$(echo "$rel" | tr '/' '_')"
    if [ -f "$backup.marker" ]; then
        rm -f "$rel"
        rm -f "$backup.marker"
    elif [ -f "$backup" ]; then
        cp "$backup" "$rel"
        rm -f "$backup"
    fi
}

# One command for the clean baseline and every injected fault. VM modules
# are required by the runtime guards on the supported Node 20 runner.
run_signup_tests() {
    # Missing files are omitted here so the meta-guard can report intentional
    # test deletion as an assertion failure, rather than a CLI startup error.
    # shellcheck disable=SC2046
    node --experimental-vm-modules --test --test-reporter=tap $(ls \
        __tests__/_test-guards-exist.test.mjs \
        __tests__/auth-routes-exist.test.mjs \
        __tests__/signup-hardening.test.mjs \
        __tests__/build-2-deliverables.test.mjs \
        __tests__/retired-error-provider.test.mjs \
        __tests__/phase-3-deliverables.test.mjs \
        __tests__/phase-4-deliverables.test.mjs 2>/dev/null)
}

# TAP gives the same bounded numeric summary on every supported Node version.
test_summary_count() {
    awk -v label="$1" '$1 == "#" && $2 == label && $3 ~ /^[0-9]+$/ { count=$3 } END { print count }' "$2"
}

# run_drill — applies breakage, runs tests, parses fail count, restores
run_drill() {
    DRILL_NUM=$((DRILL_NUM + 1))
    local name="$1"
    local files_to_save="$2"   # space-separated list
    local apply_fn="$3"

    echo ""
    echo "─── DRILL $DRILL_NUM: $name ──────────────────"

    # Save originals
    for f in $files_to_save; do
        save_file "$f"
    done

    # Apply
    eval "$apply_fn"

    # Use exactly the command that qualified the clean baseline.
    local out="$BACKUPS/drill-$DRILL_NUM-out.txt"
    local test_status=0
    run_signup_tests > "$out" 2>&1 || test_status=$?

    local fail_count
    fail_count=$(test_summary_count fail "$out")
    fail_count=${fail_count:-0}

    if [ "$test_status" -ne 0 ] && [ "$fail_count" -gt 0 ]; then
        echo -e "  ${GREEN}✓${NC} DETECTED — $fail_count test(s) failed"
        DRILL_PASS=$((DRILL_PASS + 1))
    else
        echo -e "  ${RED}✗${NC} MISSED — all tests passed despite chaos applied"
        echo "      Add a guard for this failure mode! Test output: $out"
        DRILL_FAIL=$((DRILL_FAIL + 1))
    fi

    # Restore
    for f in $files_to_save; do
        restore_file "$f"
    done
}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SIGNUP CHAOS DRILL — $(date '+%Y-%m-%d %H:%M')"
echo "═══════════════════════════════════════════════════════════════"

# A runtime/dependency failure on healthy source must never be credited as
# detection of an injected fault. Refuse an empty or unparseable run as well.
baseline_out="$BACKUPS/clean-baseline-out.txt"
baseline_status=0
run_signup_tests > "$baseline_out" 2>&1 || baseline_status=$?
baseline_tests=$(test_summary_count tests "$baseline_out")
baseline_failures=$(test_summary_count fail "$baseline_out")
baseline_passes=$(test_summary_count pass "$baseline_out")
if [ "$baseline_status" -ne 0 ] || [ "${baseline_tests:-0}" -eq 0 ] || [ "$baseline_failures" != "0" ] || [ "$baseline_passes" != "$baseline_tests" ]; then
    echo "BASELINE FAILED — healthy signup guards must pass before fault injection."
    cat "$baseline_out"
    exit 1
fi
echo "Clean baseline: $baseline_tests tests passed."

run_drill "callback.js deleted" \
    "pages/auth/callback.js" \
    'rm -f pages/auth/callback.js'

run_drill "signup.js truncated" \
    "pages/auth/signup.js" \
    'echo "// truncated by chaos drill" > pages/auth/signup.js'

run_drill "/auth/ removed from BOTH allowlists" \
    "config/geo-blocks.json middleware.ts" \
    'python3 - <<PY
import json, pathlib, re
p = pathlib.Path("config/geo-blocks.json")
d = json.loads(p.read_text())
d["allow_paths"] = [x for x in d.get("allow_paths", []) if not x.startswith("/auth")]
p.write_text(json.dumps(d, indent=2))
mw = pathlib.Path("middleware.ts")
src = mw.read_text()
src = re.sub(r"const AUTH_ALWAYS_ALLOW[\s\S]*?\];", "const AUTH_ALWAYS_ALLOW = [];", src)
src = re.sub(r"if \(isAuthAlwaysAllow\(pathname\)\) return true;", "// removed", src)
mw.write_text(src)
PY'

run_drill "login.js handleSignup reverted to bare signUp" \
    "pages/auth/login.js" \
    'python3 - <<PY
import re, pathlib
p = pathlib.Path("pages/auth/login.js")
src = p.read_text()
new = """    const handleSignup = async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setError(error.message);
    };"""
src = re.sub(r"const handleSignup = async \(e\) => \{[\s\S]*?^    \};", new, src, count=1, flags=re.MULTILINE)
p.write_text(src)
PY'

run_drill "signup-probe.js deleted" \
    "pages/api/cron/signup-probe.js" \
    'rm -f pages/api/cron/signup-probe.js'

run_drill "health/signup.js deleted" \
    "pages/api/health/signup.js" \
    'rm -f pages/api/health/signup.js'

run_drill "apex-OAuth pre-flight removed from signup.js" \
    "pages/auth/signup.js" \
    'python3 - <<PY
import re, pathlib
p = pathlib.Path("pages/auth/signup.js")
src = p.read_text()
src = re.sub(r"if \(host\.startsWith\([\x27\"]www\.[\x27\"]\)\)[\s\S]*?return;\s*\}", "/* removed */", src)
src = re.sub(r"router\.replace\(\{ pathname: router\.pathname[\s\S]*?\);", "/* removed */", src)
p.write_text(src)
PY'

run_drill "signup-hardening test deleted (guard self-protection)" \
    "__tests__/signup-hardening.test.mjs" \
    'rm -f __tests__/signup-hardening.test.mjs'

# ─── Final report ───
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  CHAOS DRILL COMPLETE — $DRILL_NUM scenarios"
echo "═══════════════════════════════════════════════════════════════"
echo "  Detected: $DRILL_PASS"
echo "  Missed:   $DRILL_FAIL"

if [ "$DRILL_FAIL" -gt 0 ]; then
    echo ""
    echo -e "${RED}FAIL${NC} — at least one failure mode slipped through guards."
    echo "Add tests/guards for the missed modes BEFORE the next outage."
    exit 1
fi

echo ""
echo -e "${GREEN}PASS${NC} — all $DRILL_NUM failure modes detected by guards."
exit 0
