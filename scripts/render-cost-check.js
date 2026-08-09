#!/usr/bin/env node
/**
 * RENDER-COST CHECK — structural invariants for the arena render path.
 *
 * `npx next build` cannot run on this machine (arch-mismatched node_modules)
 * and the app cannot be profiled headlessly, so this harness asserts the
 * STRUCTURAL facts that guarantee the 2026-08-09 perf pass holds:
 *
 *   1. Every per-tick timer state lives in a LEAF component, never in the
 *      top-level GodModeArena / UniversalDynamicTable components. A tick in
 *      a leaf re-renders ~30 lines; a tick at the top re-renders the whole
 *      13k/7k-line tree at 1-20Hz.
 *   2. Board cards are keyed by hand identity (handKey), so a re-render can
 *      never re-deal the flop (the old re-deal-every-street bug).
 *   3. Seats are keyed by stable seat.id.
 *   4. The timer-expiry semantics that were just fixed are intact and
 *      reachable: the synchronous double-grade latch (answerSubmittedRef)
 *      guards both the click path and the expiry path, and expiry grades the
 *      real passive action with a TIME banner.
 *   5. UniversalDynamicTable's React.memo is not defeated by per-render
 *      object/lambda props at the GodModeArena call sites.
 *
 * Uses @babel/parser for exact function boundaries — a grep alone cannot
 * tell WHICH component owns a setInterval.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const GMA_PATH = path.join(ROOT, 'src/components/training/GodModeArena.jsx');
const UDT_PATH = path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx');

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
    if (ok) {
        pass += 1;
        console.log(`PASS  ${name}`);
    } else {
        fail += 1;
        console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    }
}

// ── Parse both files and index top-level function boundaries ──────────────
function topLevelFunctions(src) {
    const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const fns = {};
    for (const node of ast.program.body) {
        let target = node;
        if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
            target = node.declaration || node;
        }
        if (target && target.type === 'FunctionDeclaration' && target.id) {
            fns[target.id.name] = src.slice(target.start, target.end);
        }
        if (target && target.type === 'VariableDeclaration') {
            for (const d of target.declarations) {
                if (d.id && d.id.name && d.init
                    && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')) {
                    fns[d.id.name] = src.slice(d.start, d.end);
                }
            }
        }
    }
    return fns;
}

const gmaSrc = fs.readFileSync(GMA_PATH, 'utf8');
const udtSrc = fs.readFileSync(UDT_PATH, 'utf8');
let gmaFns;
let udtFns;
try {
    gmaFns = topLevelFunctions(gmaSrc);
    check('GodModeArena.jsx parses', true);
} catch (e) {
    check('GodModeArena.jsx parses', false, e.message);
}
try {
    udtFns = topLevelFunctions(udtSrc);
    check('UniversalDynamicTable.jsx parses', true);
} catch (e) {
    check('UniversalDynamicTable.jsx parses', false, e.message);
}
if (fail > 0) {
    console.log(`\n---------------------------------------------\nPASS ${pass}   FAIL ${fail}   TOTAL ${pass + fail}`);
    process.exit(1);
}

// ── 1. TIMER TICKS LIVE IN LEAVES ─────────────────────────────────────────
// The ONLY functions in each file allowed to own a setInterval are the
// dedicated leaf timer components. Everything else — most importantly the
// top-level UniversalDynamicTable and GodModeArenaInner components — must
// own zero intervals.
const UDT_TIMER_OWNERS = ['CountdownTimer', 'AutoAdvanceIndicator'];
const GMA_TIMER_OWNERS = ['DrillCountdown'];

function intervalOwners(fns) {
    return Object.keys(fns).filter((name) => fns[name].includes('setInterval('));
}

{
    const owners = intervalOwners(udtFns);
    check('UDT: only leaf components own setInterval',
        owners.length > 0 && owners.every((o) => UDT_TIMER_OWNERS.includes(o)),
        `owners: [${owners.join(', ')}]`);
    check('UDT: CountdownTimer leaf exists and owns its own timeLeft state',
        !!udtFns.CountdownTimer
        && udtFns.CountdownTimer.includes('const [timeLeft, setTimeLeft] = React.useState(seconds)'));
    check('UDT: AutoAdvanceIndicator leaf exists and owns the 50ms tick',
        !!udtFns.AutoAdvanceIndicator
        && udtFns.AutoAdvanceIndicator.includes('setInterval(')
        && udtFns.AutoAdvanceIndicator.includes('prev - 50'));
    const table = udtFns.UniversalDynamicTable || '';
    check('UDT: table component holds no per-tick countdown state',
        table.length > 0
        && !table.includes('setInterval(')
        && !table.includes('autoAdvanceCountdown')
        && !/const \[timeLeft/.test(table));
    check('UDT: table stores only autoAdvanceTotal (one write per feedback window)',
        table.includes('const [autoAdvanceTotal, setAutoAdvanceTotal] = React.useState(null)'));
    check('UDT: table renders AutoAdvanceIndicator fed by autoAdvanceTotal',
        table.includes('<AutoAdvanceIndicator') && table.includes('total={autoAdvanceTotal}'));
    check('UDT: table renders CountdownTimer (in-hand clock stays a leaf)',
        table.includes('<CountdownTimer'));
}

{
    const owners = intervalOwners(gmaFns);
    check('GMA: only the DrillCountdown leaf owns setInterval',
        owners.length > 0 && owners.every((o) => GMA_TIMER_OWNERS.includes(o)),
        `owners: [${owners.join(', ')}]`);
    check('GMA: DrillCountdown leaf owns its own timeLeft state',
        !!gmaFns.DrillCountdown
        && gmaFns.DrillCountdown.includes('const [timeLeft, setTimeLeft] = useState(seconds)'));
    const arena = gmaFns.GodModeArenaInner || '';
    check('GMA: arena component holds no interval and no ticking countdown state',
        arena.length > 0 && !arena.includes('setInterval('));
    const drill = gmaFns.DrillMode || '';
    check('GMA: DrillMode no longer ticks parent drillState per second',
        drill.length > 0
        && !drill.includes('setInterval(')
        && !drill.includes('prev.timeLeft - 1'));
    check('GMA: DrillMode renders DrillCountdown keyed to the current question',
        drill.includes('<DrillCountdown questionKey={currentQ}'));
    check('GMA: drill expiry still grades a timeout as wrong exactly once',
        drill.includes('handleDrillExpire')
        && drill.includes('timedOut: true')
        && drill.includes('if (!prev.currentQ) return prev;'));
}

// ── 2. BOARD CARDS KEYED BY HAND IDENTITY ─────────────────────────────────
{
    const table = udtFns.UniversalDynamicTable || '';
    check('UDT: handKey derives from question identity',
        /const handKey = isMultiStreetActive\s*\?\s*`ms-\$\{questionNumber\}`\s*:\s*\(question\?\.id \|\| question\?\.scenario\?\.id \|\| `q-\$\{questionNumber\}`\)/.test(table));
    check('UDT: board cards keyed by handKey + card (no per-render re-deal)',
        table.includes('key={`${handKey}-${card}-${i}`}'));
    check('UDT: avatar deal memoized on question identity (deterministic per hand)',
        table.includes("const handAvatarKey = question?.id || question?.scenario?.id || `q-${questionNumber || 1}`")
        && /const seatAvatars = useMemo\(\s*\(\) => dealSeatAvatars\(handAvatarKey, playerCount, heroAvatar\),\s*\[handAvatarKey, playerCount, heroAvatar\]\s*\)/.test(table));
}

// ── 3. STABLE SEAT KEYS ───────────────────────────────────────────────────
{
    const table = udtFns.UniversalDynamicTable || '';
    check('UDT: seats keyed by stable seat.id', table.includes('key={seat.id}'));
}

// ── 4. EXPIRY LATCH + TIME SEMANTICS INTACT ───────────────────────────────
{
    const table = udtFns.UniversalDynamicTable || '';
    check('UDT: double-grade latch declared (answerSubmittedRef)',
        table.includes('const answerSubmittedRef = React.useRef(false)'));
    check('UDT: click path reads the latch at call time',
        table.includes('if (answerSubmittedRef.current) return;'));
    check('UDT: expiry path reads the latch before auto-acting',
        table.includes('if (answerSubmittedRef.current || showFeedback || selectedAnswer) return;'));
    check('UDT: expiry auto-folds/checks via the graded answer path',
        table.includes("handleAnswerWithGrouping(autoOpt.id || autoOpt, { timedOut: true })"));
    check('UDT: timeout is badged TIME, never passed off as the player\'s pick',
        table.includes('TIME EXPIRED')
        && table.includes("TIME — auto-{timeExpired === 'fold' ? 'folded' : 'checked'}"));
    check('UDT: expiry marks which passive action fired (fold/check/none)',
        table.includes("setTimeExpired(/fold/i.test(autoOpt.text || autoOpt.label || '') ? 'fold' : 'check')")
        && table.includes("setTimeExpired('none')"));
    check('UDT: CountdownTimer fires expiry callback at most once (expiredRef)',
        !!udtFns.CountdownTimer
        && udtFns.CountdownTimer.includes('const expiredRef = React.useRef(false)')
        && udtFns.CountdownTimer.includes('if (onTimeExpired && !expiredRef.current)'));
}

// ── 5. UDT MEMO NOT DEFEATED BY PER-RENDER PROPS ──────────────────────────
{
    check('UDT: component is exported through React.memo',
        udtSrc.includes('export default memo(UniversalDynamicTable)'));
    const arena = gmaFns.GodModeArenaInner || '';
    // The inline-object pattern must not exist as an actual JSX attribute
    // (a code comment describing the OLD pattern is allowed to mention it).
    check('GMA: trainerConfig prop is a useMemo\'d object (resolvedTrainerConfig)',
        /const resolvedTrainerConfig = useMemo\(/.test(arena)
        && !/^\s*trainerConfig=\{\{/m.test(arena));
    const configSites = (arena.match(/trainerConfig=\{resolvedTrainerConfig\}/g) || []).length;
    check('GMA: both GameUIRouter call sites use the stable trainerConfig',
        configSites === 2, `found ${configSites}`);
    check('GMA: onConfigClick is a stable useCallback',
        arena.includes('const handleConfigClick = useCallback(() => setShowConfigModal(true), [])')
        && arena.includes('onConfigClick={handleConfigClick}')
        && !arena.includes('onConfigClick={() =>'));
    check('GMA: default-layout onNextHand is a stable useCallback',
        arena.includes('const handleDefaultNextHand = useCallback(')
        && arena.includes('onNextHand={handleDefaultNextHand}')
        && !arena.includes('onNextHand={() =>'));
}

// ── 6. PER-TABLE SCOPING EDITS (deferred pair) STILL IN PLACE ─────────────
{
    const arena = gmaFns.GodModeArenaInner || '';
    check('GMA: adaptiveDifficultyChange listener filters foreign tables',
        arena.includes('gameId: fromGameId')
        && arena.includes('if (fromGameId && String(fromGameId) !== String(gameId)) return;'));
    check('GMA: difficulty change reaches the table\'s own trainerConfig',
        arena.includes('setTrainerConfig((c) => (c ? { ...c, difficulty } : c));'));
}

console.log(`\n---------------------------------------------\nPASS ${pass}   FAIL ${fail}   TOTAL ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
