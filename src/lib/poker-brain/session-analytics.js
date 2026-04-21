/**
 * SessionAnalytics -- Track poker session performance over time
 * =============================================================
 * Records each hand within a session, computes running stats,
 * and persists session history to localStorage.
 *
 * Answers questions like:
 *   - How many hands did I play?
 *   - Did I follow the engine's recommendations?
 *   - What's my profit/loss this session?
 *   - What % of decisions came from Horse Brain vs local fallback?
 */

const STORAGE_KEY = 'poker-brain-sessions';
const MAX_SESSIONS = 100; // keep last 100 sessions

function now() { return new Date().toISOString(); }

export default class SessionAnalytics {
  constructor() {
    this._current = null;
    this._history = [];
    this._load();
  }

  _load() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this._history = parsed;
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }

  _save() {
    try {
      if (typeof localStorage === 'undefined') return;
      // Trim old sessions
      while (this._history.length > MAX_SESSIONS) this._history.shift();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._history));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }

  /**
   * Start a new session.
   */
  startSession(gameType = 'nlhe', stakes = '1/2') {
    if (this._current) this.endSession(); // auto-close previous

    this._current = {
      id: `session_${Date.now()}`,
      gameType,
      stakes,
      startedAt: now(),
      endedAt: null,
      hands: [],
      initialStack: null,
      finalStack: null,
    };
    return this._current.id;
  }

  /**
   * Record a hand in the current session.
   * @param {object} hand
   *   holeCards      string[]   e.g. ['Ah','Kd']
   *   boardCards     string[]
   *   heroAction     string     what the user actually did
   *   engineAction   string     what the engine recommended
   *   decisionSource string     'horse_brain' | 'local_engine' | null
   *   potSize        number
   *   stackBefore    number
   *   stackAfter     number
   *   result         string     'won' | 'lost' | 'folded' | null
   *   street         string
   *   position       string
   */
  recordHand(hand = {}) {
    if (!this._current) this.startSession();

    const record = {
      ts: now(),
      holeCards: hand.holeCards || [],
      boardCards: hand.boardCards || [],
      heroAction: hand.heroAction || null,
      engineAction: hand.engineAction || null,
      decisionSource: hand.decisionSource || null,
      potSize: hand.potSize || 0,
      stackBefore: hand.stackBefore || 0,
      stackAfter: hand.stackAfter || 0,
      result: hand.result || null,
      street: hand.street || 'preflop',
      position: hand.position || null,
      followedEngine: hand.heroAction && hand.engineAction
        ? hand.heroAction.toUpperCase() === hand.engineAction.toUpperCase()
        : null,
    };

    this._current.hands.push(record);

    // Track stack progression
    if (this._current.initialStack === null && record.stackBefore > 0) {
      this._current.initialStack = record.stackBefore;
    }
    this._current.finalStack = record.stackAfter || record.stackBefore;

    return record;
  }

  /**
   * End the current session and persist.
   */
  endSession() {
    if (!this._current) return null;
    this._current.endedAt = now();
    const summary = this.getSessionSummary();
    this._current.summary = summary;
    this._history.push(this._current);
    const ended = this._current;
    this._current = null;
    this._save();
    return ended;
  }

  /**
   * Get summary stats for the current (or most recent) session.
   */
  getSessionSummary() {
    const session = this._current || this._history[this._history.length - 1];
    if (!session || !session.hands.length) {
      return {
        duration: 0, handsPlayed: 0, decisionsFollowed: 0, decisionsIgnored: 0,
        profitLoss: 0, vpip: 0, pfr: 0, avgPotSize: 0,
        biggestWin: 0, biggestLoss: 0, horseBrainPct: 0, localEnginePct: 0,
      };
    }

    const hands = session.hands;
    const h = hands.length;
    const start = new Date(session.startedAt);
    const end = session.endedAt ? new Date(session.endedAt) : new Date();
    const durationMin = Math.round((end - start) / 60000);

    let followed = 0, ignored = 0;
    let vpipCount = 0, pfrCount = 0;
    let horseBrain = 0, localEngine = 0;
    let biggestWin = 0, biggestLoss = 0;
    let totalPot = 0;

    for (const hand of hands) {
      if (hand.followedEngine === true) followed++;
      else if (hand.followedEngine === false) ignored++;

      const act = (hand.heroAction || '').toUpperCase();
      if (act && act !== 'FOLD' && act !== 'WAIT') vpipCount++;
      if (act === 'RAISE' || act === 'BET') pfrCount++;

      if (hand.decisionSource === 'horse_brain') horseBrain++;
      else if (hand.decisionSource === 'local_engine' || hand.decisionSource === 'local_fallback') localEngine++;

      totalPot += hand.potSize || 0;

      const delta = (hand.stackAfter || 0) - (hand.stackBefore || 0);
      if (delta > biggestWin) biggestWin = delta;
      if (delta < biggestLoss) biggestLoss = delta;
    }

    const profitLoss = (session.finalStack || 0) - (session.initialStack || 0);
    const decisionsTotal = followed + ignored;

    return {
      sessionId: session.id,
      duration: durationMin,
      handsPlayed: h,
      decisionsFollowed: followed,
      decisionsIgnored: ignored,
      followRate: decisionsTotal > 0 ? ((followed / decisionsTotal) * 100).toFixed(1) : '0.0',
      profitLoss: Math.round(profitLoss * 100) / 100,
      vpip: ((vpipCount / h) * 100).toFixed(1),
      pfr: ((pfrCount / h) * 100).toFixed(1),
      avgPotSize: Math.round(totalPot / h),
      biggestWin: Math.round(biggestWin * 100) / 100,
      biggestLoss: Math.round(biggestLoss * 100) / 100,
      horseBrainPct: h > 0 ? ((horseBrain / h) * 100).toFixed(1) : '0.0',
      localEnginePct: h > 0 ? ((localEngine / h) * 100).toFixed(1) : '0.0',
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      gameType: session.gameType,
      stakes: session.stakes,
    };
  }

  /**
   * Get summaries of all past sessions.
   */
  getHistoricalSessions() {
    return this._history.map(s => s.summary || {
      sessionId: s.id,
      handsPlayed: s.hands.length,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      gameType: s.gameType,
      stakes: s.stakes,
    });
  }

  /**
   * Aggregate stats across ALL sessions.
   */
  getOverallStats() {
    const all = [...this._history];
    if (this._current) all.push(this._current);

    let totalHands = 0, totalProfit = 0, totalDuration = 0;
    let totalFollowed = 0, totalIgnored = 0;
    let totalHorseBrain = 0, totalLocal = 0;

    for (const session of all) {
      const s = session.summary || {};
      totalHands += session.hands?.length || 0;
      totalProfit += s.profitLoss || 0;
      totalDuration += s.duration || 0;
      totalFollowed += s.decisionsFollowed || 0;
      totalIgnored += s.decisionsIgnored || 0;

      for (const hand of (session.hands || [])) {
        if (hand.decisionSource === 'horse_brain') totalHorseBrain++;
        else if (hand.decisionSource === 'local_engine' || hand.decisionSource === 'local_fallback') totalLocal++;
      }
    }

    return {
      sessionsPlayed: all.length,
      totalHands,
      totalDurationMin: totalDuration,
      totalProfit: Math.round(totalProfit * 100) / 100,
      avgProfitPerSession: all.length > 0
        ? Math.round((totalProfit / all.length) * 100) / 100
        : 0,
      overallFollowRate: (totalFollowed + totalIgnored) > 0
        ? ((totalFollowed / (totalFollowed + totalIgnored)) * 100).toFixed(1)
        : '0.0',
      horseBrainPct: totalHands > 0 ? ((totalHorseBrain / totalHands) * 100).toFixed(1) : '0.0',
    };
  }

  /**
   * Is a session currently active?
   */
  isActive() {
    return this._current !== null;
  }

  /**
   * Get current session hand count.
   */
  currentHandCount() {
    return this._current ? this._current.hands.length : 0;
  }

  /**
   * Clear all history.
   */
  reset() {
    this._current = null;
    this._history = [];
    this._save();
  }
}
