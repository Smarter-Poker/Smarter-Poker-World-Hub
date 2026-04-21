/**
 * PlayerDatabase -- Name-linked opponent stats persistence
 * ========================================================
 * Tracks per-player statistics keyed by screen name (OCR'd from PokerBros).
 * Persists to localStorage across sessions so you build a database over time.
 *
 * Unlike opponent-stats.js (seat-based, session-only), this module builds
 * a permanent player profile that survives across sessions and tables.
 */

const STORAGE_KEY = 'poker-brain-player-db';
const DB_VERSION = 1;

function emptyStats() {
  return {
    handsObserved: 0,
    vpipCount: 0,
    pfrCount: 0,
    threeBetCount: 0,
    postflopBets: 0,
    postflopCalls: 0,
    postflopFolds: 0,
    allInCount: 0,
    wentToShowdown: 0,
    wonAtShowdown: 0,
    lastSeen: null,
    firstSeen: null,
    aliases: [],   // alternate name spellings / OCR variants
    notes: '',
  };
}

function classify(stats) {
  if (stats.handsObserved < 10) return 'UNK';
  const vpip = (stats.vpipCount / stats.handsObserved) * 100;
  const pfr  = (stats.pfrCount / stats.handsObserved) * 100;
  const totalPostflop = stats.postflopBets + stats.postflopCalls + stats.postflopFolds;
  const af = totalPostflop > 0
    ? (stats.postflopBets) / (stats.postflopCalls || 1)
    : 0;

  // Extended classification with NIT and MANIAC
  if (vpip < 15 && pfr < 10) return 'NIT';
  if (vpip > 55 && af > 3) return 'MANIAC';
  if (vpip < 25 && pfr > 18 && af >= 2) return 'TAG';
  if (vpip > 30 && pfr > 20 && af >= 2) return 'LAG';
  if (vpip > 30 && pfr < 15) return 'LP';
  if (vpip < 25 && pfr < 10) return 'TP';
  return 'UNK';
}

export default class PlayerDatabase {
  constructor() {
    this._db = {};
    this._load();
  }

  _load() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === DB_VERSION && parsed.players) {
          this._db = parsed.players;
        }
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }

  _save() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: DB_VERSION,
        players: this._db,
        savedAt: new Date().toISOString(),
      }));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }

  _normalize(name) {
    return String(name || '').trim().toLowerCase();
  }

  /**
   * Record a hand observation for a player.
   * @param {string} playerName - Screen name from OCR
   * @param {object} hand - { vpip, pfr, threeBet, postflopBet, postflopCall, postflopFold, allIn, wentToShowdown, wonAtShowdown }
   */
  recordHand(playerName, hand = {}) {
    const key = this._normalize(playerName);
    if (!key) return;

    if (!this._db[key]) {
      this._db[key] = { ...emptyStats(), displayName: playerName };
    }

    const s = this._db[key];
    s.handsObserved += 1;
    if (hand.vpip) s.vpipCount += 1;
    if (hand.pfr) s.pfrCount += 1;
    if (hand.threeBet) s.threeBetCount += 1;
    if (hand.postflopBet) s.postflopBets += 1;
    if (hand.postflopCall) s.postflopCalls += 1;
    if (hand.postflopFold) s.postflopFolds += 1;
    if (hand.allIn) s.allInCount += 1;
    if (hand.wentToShowdown) s.wentToShowdown += 1;
    if (hand.wonAtShowdown) s.wonAtShowdown += 1;
    s.lastSeen = new Date().toISOString();
    if (!s.firstSeen) s.firstSeen = s.lastSeen;

    // Update display name to most recent OCR spelling
    if (playerName !== s.displayName) {
      if (!s.aliases.includes(s.displayName)) s.aliases.push(s.displayName);
      s.displayName = playerName;
    }

    this._save();
  }

  /**
   * Get computed stats for a player.
   */
  getStats(playerName) {
    const key = this._normalize(playerName);
    const s = this._db[key];
    if (!s || s.handsObserved === 0) return null;

    const h = s.handsObserved;
    const totalPostflop = s.postflopBets + s.postflopCalls + s.postflopFolds;
    return {
      displayName: s.displayName,
      handsObserved: h,
      vpip: ((s.vpipCount / h) * 100).toFixed(1),
      pfr: ((s.pfrCount / h) * 100).toFixed(1),
      threeBetPct: h > 0 ? ((s.threeBetCount / h) * 100).toFixed(1) : '0.0',
      af: totalPostflop > 0
        ? (s.postflopBets / (s.postflopCalls || 1)).toFixed(1)
        : '0.0',
      wtsd: h > 0 ? ((s.wentToShowdown / h) * 100).toFixed(1) : '0.0',
      wsd: s.wentToShowdown > 0
        ? ((s.wonAtShowdown / s.wentToShowdown) * 100).toFixed(1)
        : '0.0',
      classification: classify(s),
      lastSeen: s.lastSeen,
      firstSeen: s.firstSeen,
      aliases: s.aliases,
      notes: s.notes,
    };
  }

  /**
   * Fuzzy search for player names.
   */
  searchPlayer(partial) {
    const needle = this._normalize(partial);
    if (!needle) return [];
    return Object.entries(this._db || {})
      .filter(([key, s]) => {
        if (key.includes(needle)) return true;
        return s.aliases.some(a => this._normalize(a).includes(needle));
      })
      .map(([key, s]) => this.getStats(s.displayName))
      .filter(Boolean);
  }

  /**
   * Get all tracked players sorted by hands observed.
   */
  getAllPlayers() {
    return Object.values(this._db || {})
      .sort((a, b) => b.handsObserved - a.handsObserved)
      .map(s => this.getStats(s.displayName))
      .filter(Boolean);
  }

  /**
   * Merge two player records (OCR name variants of the same person).
   */
  mergePlayer(name1, name2) {
    const k1 = this._normalize(name1);
    const k2 = this._normalize(name2);
    if (!this._db[k1] || !this._db[k2] || k1 === k2) return false;

    const s1 = this._db[k1];
    const s2 = this._db[k2];

    s1.handsObserved += s2.handsObserved;
    s1.vpipCount += s2.vpipCount;
    s1.pfrCount += s2.pfrCount;
    s1.threeBetCount += s2.threeBetCount;
    s1.postflopBets += s2.postflopBets;
    s1.postflopCalls += s2.postflopCalls;
    s1.postflopFolds += s2.postflopFolds;
    s1.allInCount += s2.allInCount;
    s1.wentToShowdown += s2.wentToShowdown;
    s1.wonAtShowdown += s2.wonAtShowdown;
    if (!s1.aliases.includes(s2.displayName)) s1.aliases.push(s2.displayName);
    s2.aliases.forEach(a => { if (!s1.aliases.includes(a)) s1.aliases.push(a); });
    if (s2.firstSeen && (!s1.firstSeen || s2.firstSeen < s1.firstSeen)) {
      s1.firstSeen = s2.firstSeen;
    }

    delete this._db[k2];
    this._save();
    return true;
  }

  /**
   * Add a note for a player.
   */
  setNote(playerName, note) {
    const key = this._normalize(playerName);
    if (this._db[key]) {
      this._db[key].notes = String(note || '');
      this._save();
    }
  }

  /**
   * Export all player stats as CSV.
   */
  exportCSV() {
    const players = this.getAllPlayers();
    if (players.length === 0) return '';
    const header = 'Name,Hands,VPIP,PFR,3Bet,AF,WTSD,WSD,Type,FirstSeen,LastSeen,Notes';
    const rows = players.map(p =>
      [p.displayName, p.handsObserved, p.vpip, p.pfr, p.threeBetPct,
       p.af, p.wtsd, p.wsd, p.classification, p.firstSeen || '', p.lastSeen || '',
       `"${(p.notes || '').replace(/"/g, '""')}"`].join(',')
    );
    return [header, ...rows].join('\n');
  }

  /**
   * Reset all data.
   */
  reset() {
    this._db = {};
    this._save();
  }
}
