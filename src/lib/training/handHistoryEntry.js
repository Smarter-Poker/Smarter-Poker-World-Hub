/**
 * HAND-HISTORY ENTRY ACCESS (the flat-spread law)
 * ---------------------------------------------------------------------------
 * `useGTOWScore.recordMove` pushes each answered decision onto `handHistory`
 * as:
 *
 *     { handNumber, classification, evLoss, frequencyDiff, timestamp,
 *       ...handData }
 *
 * `handData` is SPREAD FLAT. There is no `entry.handData` key at all. Any
 * consumer written as `h.handData.heroPosition` therefore reads `undefined`
 * and silently renders whatever default sits behind the `||` -- which is why
 * this defect has never announced itself. It does not throw, it does not log,
 * it produces a panel full of plausible-looking placeholder values.
 *
 * This has now been found SEVEN separate times:
 *   - LifetimeStatsCard pot-type breakdown (fixed 2026-08-06, roadmap #40)
 *   - GodModeArena coaching aggregation  (fixed 2026-08-06, roadmap #40)
 *   - saveSession position_stats         -- every session ever saved wrote a
 *     single `UNK` bucket, and /api/training/gto-reports and
 *     /api/training/coaching-summary both derive "strongest position",
 *     "weakest position" and the recommended drill from that column
 *   - GodModeArena mixedStrategyScore    -- every player saw "Action
 *     Diversity 0% -- too predictable" on every session, because every hand
 *     bucketed to the same 'unknown' key
 *   - AccuracyByPositionChart, WeaknessHeatmap, per-street EV loss and the
 *     weakest-spot callout -- all four collapsed to UNK / flop
 *   - FrequencyTrainer                   -- read `selectedAnswer`/`userAction`,
 *     neither of which exists (the field is `action`), so the adherence panel
 *     filtered every hand out and rendered its empty state forever
 *   - GhostReplayEngine                  -- `currentHand?.handData || {}` with
 *     no flat fallback, so the replay modal opened with no cards and no board
 *
 * The correct read is not "reach into handData" and it is not "read the top
 * level" either, because entries loaded back from `training_sessions.hand_history`
 * may legitimately carry a nested `handData` object written by an older build.
 * Both shapes must work. That is what this module is for: it is the ONE place
 * that knows a history entry has two possible shapes, so the next consumer
 * cannot get it wrong.
 *
 * Rule for reviewers: a `.handData` property access anywhere outside this file
 * is a bug. Use `handFieldOf` for one field, `handDataOf` when you genuinely
 * need the whole object (spreading it into a replay view, for instance).
 */

const EMPTY = Object.freeze({});

/**
 * Read one field off a hand-history entry, tolerating both shapes.
 *
 * Nested wins when it holds a real value, because a build that wrote a nested
 * `handData` wrote the WHOLE of it there; falling back to the top level then
 * picks up the scalar columns (`classification`, `evLoss`) that are only ever
 * written flat. `null` and `undefined` both fall through -- a nested key
 * explicitly set to null is absence, not an answer.
 */
export function handFieldOf(entry, key) {
    if (!entry || typeof entry !== 'object') return undefined;
    const hd = entry.handData;
    if (hd && typeof hd === 'object') {
        const v = hd[key];
        if (v !== undefined && v !== null) return v;
    }
    return entry[key];
}

/**
 * The hand-data object for an entry. Returns the entry ITSELF when the data was
 * spread flat, which is the common case -- callers that spread the result get
 * the scalar fields too, and that is wanted (a replay view reads `evLoss` and
 * `heroCards` from the same object).
 */
export function handDataOf(entry) {
    if (!entry || typeof entry !== 'object') return EMPTY;
    const hd = entry.handData;
    if (hd && typeof hd === 'object') return { ...entry, ...hd };
    return entry;
}

/** Hero's seat for an entry, or 'UNK' when the entry genuinely has none. */
export function heroPositionOf(entry) {
    const p = handFieldOf(entry, 'heroPosition');
    return typeof p === 'string' && p.trim() ? p.trim().toUpperCase() : 'UNK';
}

/**
 * The street an entry was decided on.
 *
 * Defaulting to 'flop' -- which four separate call sites did -- is worse than
 * defaulting to unknown: it silently attributes every preflop decision's EV
 * loss to the flop bucket, and the resulting chart looks entirely reasonable.
 * A caller that wants a bucket for display can decide what to call the
 * unknowns; it must not be told they were flops.
 */
export function streetOf(entry) {
    const s = handFieldOf(entry, 'street');
    if (typeof s !== 'string') return null;
    const t = s.trim().toLowerCase();
    return t === 'preflop' || t === 'flop' || t === 'turn' || t === 'river' ? t : null;
}

/** The action the player actually took. */
export function playerActionOf(entry) {
    const a = handFieldOf(entry, 'action');
    return typeof a === 'string' && a.trim() ? a.trim() : null;
}

/**
 * Strip the two solver matrices off an entry before it goes over the wire.
 *
 * `rawFrequencies` is a per-action x 169-hand map and `evData.handEVs` is
 * another 169-hand map; at ~15-20KB per entry, 100 entries clear the 2MB body
 * guard in /api/training/save-session and the session is never saved. The
 * previous implementation of this stripped them off `entry.handData` -- a key
 * that does not exist -- so it was a no-op on both the client and the server
 * and the payload has been full-size the whole time.
 */
export function compactHandHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') return entry;

    const strip = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const out = { ...obj };
        delete out.rawFrequencies;
        if (out.evData && typeof out.evData === 'object') {
            const ev = { ...out.evData };
            delete ev.handEVs;
            out.evData = ev;
        }
        return out;
    };

    const out = strip(entry);
    if (out.handData && typeof out.handData === 'object') out.handData = strip(out.handData);
    return out;
}
