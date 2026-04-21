/**
 * TableManager -- Multi-table detection and management scaffold
 * =============================================================
 * Manages multiple active poker tables when multi-tabling on PokerBros.
 * Each table has its own layout config, detected cards, and decision state.
 *
 * NOTE: Scaffold code -- not yet wired into the HUD.
 */

const STORAGE_KEY = 'poker-brain-tables';

export default class TableManager {
  constructor() {
    this._tables = new Map();
    this._activeTableId = null;
    this._load();
  }

  _load() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.tables) {
          for (const [id, config] of Object.entries(parsed.tables || {})) {
            this._tables.set(id, {
              tableId: id,
              layoutConfig: config.layoutConfig || null,
              detectedCards: { hole: [], board: [] },
              decision: null,
              isActive: false,
              gameType: config.gameType || 'nlhe',
              stakes: config.stakes || '',
              label: config.label || `Table ${this._tables.size + 1}`,
              createdAt: config.createdAt || new Date().toISOString(),
              fingerprint: config.fingerprint || null,
            });
          }
          this._activeTableId = parsed.activeTableId || null;
        }
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }

  _save() {
    try {
      if (typeof localStorage === 'undefined') return;
      const tables = {};
      for (const [id, t] of this._tables) {
        tables[id] = {
          layoutConfig: t.layoutConfig, gameType: t.gameType,
          stakes: t.stakes, label: t.label,
          createdAt: t.createdAt, fingerprint: t.fingerprint,
        };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tables, activeTableId: this._activeTableId,
      }));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }

  addTable(tableId, config = {}) {
    this._tables.set(tableId, {
      tableId,
      layoutConfig: config.layoutConfig || null,
      detectedCards: { hole: [], board: [] },
      decision: null, isActive: false,
      gameType: config.gameType || 'nlhe',
      stakes: config.stakes || '',
      label: config.label || `Table ${this._tables.size + 1}`,
      createdAt: new Date().toISOString(),
      fingerprint: null,
    });
    if (this._tables.size === 1) {
      this._activeTableId = tableId;
      this._tables.get(tableId).isActive = true;
    }
    this._save();
    return this.getTable(tableId);
  }

  removeTable(tableId) {
    this._tables.delete(tableId);
    if (this._activeTableId === tableId) {
      const first = this._tables.keys().next().value;
      this._activeTableId = first || null;
      if (first) this._tables.get(first).isActive = true;
    }
    this._save();
  }

  getActiveTable() {
    if (!this._activeTableId) return null;
    return this._tables.get(this._activeTableId) || null;
  }

  setActiveTable(tableId) {
    if (!this._tables.has(tableId)) return false;
    if (this._activeTableId && this._tables.has(this._activeTableId)) {
      this._tables.get(this._activeTableId).isActive = false;
    }
    this._activeTableId = tableId;
    this._tables.get(tableId).isActive = true;
    this._save();
    return true;
  }

  getTable(tableId) { return this._tables.get(tableId) || null; }
  getAllTables() { return Array.from(this._tables.values()); }

  updateTableState(tableId, { detectedCards, decision }) {
    const table = this._tables.get(tableId);
    if (!table) return;
    if (detectedCards) table.detectedCards = detectedCards;
    if (decision !== undefined) table.decision = decision;
  }

  setFingerprint(tableId, fingerprint) {
    const table = this._tables.get(tableId);
    if (!table) return;
    table.fingerprint = fingerprint;
    this._save();
  }

  /**
   * Detect which table is in the foreground via color fingerprinting.
   */
  detectActiveTable(frame) {
    if (!frame || this._tables.size <= 1) return this._activeTableId;
    const frameAvg = this._avgColor(frame, 0, 0, frame.width, frame.height);
    let bestMatch = null, bestDist = Infinity;
    for (const [id, table] of this._tables) {
      if (!table.fingerprint || !table.fingerprint.avgColor) continue;
      const dist = this._colorDistance(frameAvg, table.fingerprint.avgColor);
      if (dist < bestDist) { bestDist = dist; bestMatch = id; }
    }
    if (bestMatch && bestDist < 50 && bestMatch !== this._activeTableId) {
      this.setActiveTable(bestMatch);
    }
    return bestMatch && bestDist < 50 ? bestMatch : this._activeTableId;
  }

  _avgColor(imageData, x, y, w, h) {
    const data = imageData.data;
    const stride = imageData.width * 4;
    let r = 0, g = 0, b = 0, count = 0;
    const ex = Math.min(x + w, imageData.width);
    const ey = Math.min(y + h, imageData.height);
    for (let py = y; py < ey; py += 10) {
      for (let px = x; px < ex; px += 10) {
        const i = py * stride + px * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
      }
    }
    return count > 0 ? [r / count, g / count, b / count] : [0, 0, 0];
  }

  _colorDistance(c1, c2) {
    const dr = c1[0] - c2[0], dg = c1[1] - c2[1], db = c1[2] - c2[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  get count() { return this._tables.size; }

  reset() { this._tables.clear(); this._activeTableId = null; this._save(); }
}
