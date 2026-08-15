/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * SESSION TRACKER — Training Session Persistence
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Saves training sessions and individual moves to Supabase:
 *   - Session metadata: game, level, score, EV loss, duration
 *   - Individual moves: street, cards, action, classification
 *   - Performance trends over time (daily/weekly/monthly)
 *   - Leak identification (worst positions, board textures)
 *
 * Schema (Supabase tables):
 *   training_sessions: id, user_id, game_id, level, hands_played,
 *       gto_score, ev_loss_total, ev_loss_avg, duration_seconds,
 *       diamonds_earned, completed_at
 *   training_moves: id, session_id, hand_number, street, hero_cards,
 *       board, action_taken, gto_action, ev_loss_bb, classification
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// ●● Session Data Structures ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Create a serializable session record for persistence.
 *
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.gameId - Game ID from TRAINING_LIBRARY
 * @param {number} params.level - Training level (1-12)
 * @param {Object} params.summary - Output from SessionScorer.getSummary()
 * @param {number} [params.diamondsEarned] - Diamonds earned this session
 * @returns {Object} Session record ready for Supabase insert
 */
export function createSessionRecord(params) {
    const { userId, gameId, level, summary, diamondsEarned = 0 } = params;

    return {
        user_id: userId,
        game_id: gameId,
        level,
        hands_played: summary.handsPlayed,
        gto_score: summary.gtoScore,
        ev_loss_total: summary.evLoss.total,
        ev_loss_avg: summary.evLoss.average,
        duration_seconds: summary.duration,
        diamonds_earned: diamondsEarned,
        best_streak: summary.bestStreak,
        grade: summary.grade,
        breakdown_correct: summary.breakdown.correct,
        breakdown_inaccuracy: summary.breakdown.inaccuracy,
        breakdown_mistake: summary.breakdown.mistake,
        breakdown_blunder: summary.breakdown.blunder,
        completed_at: new Date().toISOString(),
    };
}

/**
 * Create serializable move records for persistence.
 *
 * @param {string} sessionId - Session ID (from Supabase insert)
 * @param {Array} moves - Array of move entries from SessionScorer
 * @returns {Array} Move records ready for Supabase batch insert
 */
export function createMoveRecords(sessionId, moves) {
    return moves.map((move, idx) => ({
        session_id: sessionId,
        hand_number: idx + 1,
        street: move.street,
        hero_cards: move.heroCards,
        // 2026-07-19 AUDIT FIX (wave-1 E2E): move.board sometimes arrives as a
        // string (already-joined) — calling .join on it threw
        // "t.board.join is not a function" on session save.
        board: Array.isArray(move.board) ? move.board.join(',')
            : typeof move.board === 'string' ? move.board
            : null,
        action_taken: move.playerAction,
        gto_action: move.gtoAction,
        ev_loss_bb: move.evLoss,
        classification: move.classification,
        score: move.score,
    }));
}

// ●● Supabase Integration ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Save a completed session to Supabase.
 * Falls back to localStorage if Supabase is unavailable.
 *
 * @param {Object} supabase - Supabase client instance
 * @param {Object} sessionRecord - Output from createSessionRecord
 * @param {Array} moveRecords - Output from createMoveRecords (pass empty sessionId)
 * @returns {{ success: boolean, sessionId?: string, error?: string }}
 */
export async function saveSession(supabase, sessionRecord, moveRecords = []) {
    if (!supabase) {
        return _saveToLocalStorage(sessionRecord, moveRecords);
    }

    try {
        // Insert session
        const { data: session, error: sessionError } = await supabase
            .from('training_sessions')
            .insert(sessionRecord)
            .select('id')
            .maybeSingle();

        if (sessionError) throw sessionError;

        const sessionId = session.id;

        // Insert moves (batch)
        if (moveRecords.length > 0) {
            const movesWithId = moveRecords.map(m => ({ ...m, session_id: sessionId }));
            const { error: movesError } = await supabase
                .from('training_moves')
                .insert(movesWithId);

            if (movesError) {
                console.warn('Failed to save individual moves:', movesError);
                // Session was saved successfully, just moves failed
            }
        }

        return { success: true, sessionId };
    } catch (error) {
        console.warn('Failed to save session to Supabase:', error);
        // Fallback to local storage
        return _saveToLocalStorage(sessionRecord, moveRecords);
    }
}

/**
 * Load session history for a user.
 *
 * @param {Object} supabase
 * @param {string} userId
 * @param {Object} [options]
 * @param {number} [options.limit=50]
 * @param {string} [options.gameId] - Filter by game
 * @param {number} [options.level] - Filter by level
 * @param {string} [options.since] - ISO date string
 * @returns {Array} Session records
 */
export async function loadSessionHistory(supabase, userId, options = {}) {
    if (!supabase) {
        return _loadFromLocalStorage(userId);
    }

    try {
        let query = supabase
            .from('training_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(options.limit || 50);

        if (options.gameId) query = query.eq('game_id', options.gameId);
        if (options.level) query = query.eq('level', options.level);
        if (options.since) query = query.gte('created_at', options.since);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.warn('Failed to load sessions:', error);
        return _loadFromLocalStorage(userId);
    }
}

/**
 * Load moves for a specific session.
 */
export async function loadSessionMoves(supabase, sessionId) {
    if (!supabase) return [];

    try {
        const { data, error } = await supabase
            .from('training_moves')
            .select('*')
            .eq('session_id', sessionId)
            .order('hand_number', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch {
        return [];
    }
}

// ●● Performance Trends ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Calculate performance trends from session history.
 *
 * @param {Array} sessions - Array of session records
 * @returns {Object} Trend analysis
 */
export function calculateTrends(sessions) {
    if (!sessions || sessions.length === 0) {
        return { dailyScores: [], weeklyAvg: 0, monthlyAvg: 0, improvement: 0 };
    }

    // Sort by date
    const sorted = [...sessions].sort((a, b) =>
        new Date(a.completed_at) - new Date(b.completed_at)
    );

    // Daily scores
    const dailyMap = {};
    for (const s of sorted) {
        const day = s.completed_at.split('T')[0];
        if (!dailyMap[day]) dailyMap[day] = { scores: [], evLoss: [], hands: 0 };
        dailyMap[day].scores.push(s.gto_score);
        dailyMap[day].evLoss.push(s.ev_loss_avg);
        dailyMap[day].hands += s.hands_played;
    }

    const dailyScores = Object.entries(dailyMap || {}).map(([date, data]) => ({
        date,
        avgScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
        avgEVLoss: Math.round((data.evLoss.reduce((a, b) => a + b, 0) / data.evLoss.length) * 100) / 100,
        handsPlayed: data.hands,
    }));

    // Calculate improvement (first 5 sessions vs last 5 sessions)
    const firstN = sorted.slice(0, Math.min(5, Math.floor(sorted.length / 2)));
    const lastN = sorted.slice(-Math.min(5, Math.floor(sorted.length / 2)));

    const firstAvg = firstN.reduce((a, s) => a + s.gto_score, 0) / firstN.length;
    const lastAvg = lastN.reduce((a, s) => a + s.gto_score, 0) / lastN.length;

    // Weekly average (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const weekSessions = sorted.filter(s => s.completed_at >= weekAgo);
    const weeklyAvg = weekSessions.length > 0
        ? Math.round(weekSessions.reduce((a, s) => a + s.gto_score, 0) / weekSessions.length)
        : 0;

    // Monthly average (last 30 days)
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const monthSessions = sorted.filter(s => s.completed_at >= monthAgo);
    const monthlyAvg = monthSessions.length > 0
        ? Math.round(monthSessions.reduce((a, s) => a + s.gto_score, 0) / monthSessions.length)
        : 0;

    return {
        dailyScores,
        weeklyAvg,
        monthlyAvg,
        improvement: Math.round(lastAvg - firstAvg),
        totalHands: sorted.reduce((a, s) => a + s.hands_played, 0),
        totalSessions: sorted.length,
        totalDiamonds: sorted.reduce((a, s) => a + (s.diamonds_earned || 0), 0),
    };
}

/**
 * Identify leaks from session history.
 *
 * @param {Array} sessions - Session records with breakdown data
 * @returns {Array<{ area: string, score: number, severity: string, suggestion: string }>}
 */
export function identifyLeaks(sessions) {
    if (!sessions || sessions.length < 3) return [];

    const leaks = [];
    const avgScore = sessions.reduce((a, s) => a + s.gto_score, 0) / sessions.length;

    // Check by level
    const levelGroups = {};
    for (const s of sessions) {
        if (!levelGroups[s.level]) levelGroups[s.level] = [];
        levelGroups[s.level].push(s.gto_score);
    }

    for (const [level, scores] of Object.entries(levelGroups || {})) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg < avgScore - 10 && scores.length >= 2) {
            const levelNum = parseInt(level);
            const area = levelNum <= 7 ? `Preflop Level ${level}` :
                levelNum === 8 ? 'Flop Play' :
                levelNum === 9 ? 'Turn Play' : 'River Play';

            leaks.push({
                area,
                score: Math.round(avg),
                severity: avg < 60 ? 'major' : 'minor',
                suggestion: `Practice more ${area} scenarios — your score (${Math.round(avg)}%) is below your average (${Math.round(avgScore)}%)`,
            });
        }
    }

    // Check error rate
    const totalMoves = sessions.reduce((a, s) => a + s.hands_played, 0);
    const totalBlunders = sessions.reduce((a, s) => a + (s.breakdown_blunder || 0), 0);
    const blunderRate = totalBlunders / totalMoves;

    if (blunderRate > 0.10) {
        leaks.push({
            area: 'Blunder Rate',
            score: Math.round((1 - blunderRate) * 100),
            severity: 'major',
            suggestion: `${Math.round(blunderRate * 100)}% of your moves are blunders. Slow down and think through each decision.`,
        });
    }

    // Sort by severity
    leaks.sort((a, b) => (a.severity === 'major' ? 0 : 1) - (b.severity === 'major' ? 0 : 1));

    return leaks;
}

// ●● Local Storage Fallback ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const LOCAL_KEY = 'smarter_poker_sessions';

function _saveToLocalStorage(sessionRecord, moveRecords) {
    try {
        const stored = JSON.parse(localStorage?.getItem(LOCAL_KEY) || '[]');
        const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        stored.push({ ...sessionRecord, id, moves: moveRecords });
        // Keep last 100 sessions
        while (stored.length > 100) stored.shift();
        localStorage?.setItem(LOCAL_KEY, JSON.stringify(stored));
        return { success: true, sessionId: id };
    } catch {
        return { success: false, error: 'localStorage unavailable' };
    }
}

function _loadFromLocalStorage(userId) {
    try {
        const stored = JSON.parse(localStorage?.getItem(LOCAL_KEY) || '[]');
        return stored.filter(s => !userId || s.user_id === userId);
    } catch {
        return [];
    }
}

// ●● Supabase Schema SQL ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * SQL to create the required Supabase tables.
 * Run this in the Supabase SQL editor.
 */
export const SCHEMA_SQL = `
-- Training Sessions table
CREATE TABLE IF NOT EXISTS training_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    hands_played INTEGER NOT NULL DEFAULT 0,
    gto_score INTEGER NOT NULL DEFAULT 0,
    ev_loss_total DECIMAL(10,2) DEFAULT 0,
    ev_loss_avg DECIMAL(10,2) DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    diamonds_earned INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    grade TEXT DEFAULT 'C',
    breakdown_correct INTEGER DEFAULT 0,
    breakdown_inaccuracy INTEGER DEFAULT 0,
    breakdown_mistake INTEGER DEFAULT 0,
    breakdown_blunder INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training Moves table
CREATE TABLE IF NOT EXISTS training_moves (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES training_sessions(id) ON DELETE CASCADE,
    hand_number INTEGER NOT NULL,
    street TEXT NOT NULL,
    hero_cards TEXT,
    board TEXT,
    action_taken TEXT NOT NULL,
    gto_action TEXT,
    ev_loss_bb DECIMAL(10,2) DEFAULT 0,
    classification TEXT DEFAULT 'correct',
    score INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON training_sessions(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_game ON training_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_moves_session ON training_moves(session_id, hand_number);

-- RLS policies
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sessions" ON training_sessions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON training_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own moves" ON training_moves
    FOR SELECT USING (
        session_id IN (SELECT id FROM training_sessions WHERE user_id = auth.uid())
    );
CREATE POLICY "Users can insert own moves" ON training_moves
    FOR INSERT WITH CHECK (
        session_id IN (SELECT id FROM training_sessions WHERE user_id = auth.uid())
    );
`;

export default {
    createSessionRecord,
    createMoveRecords,
    saveSession,
    loadSessionHistory,
    loadSessionMoves,
    calculateTrends,
    identifyLeaks,
    SCHEMA_SQL,
};
