const WORD_BUCKETS = {
  small: 'small', third: 'small', half: 'medium', medium: 'medium',
  large: 'large', big: 'large', pot: 'pot', overbet: 'pot',
};

export function sizeBucketFromPercent(pct) {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct >= 100) return 'pot';
  if (pct > 75) return 'large';
  if (pct > 40) return 'medium';
  return 'small';
}

export function parseActionLabel(label) {
  const raw = String(label || '').trim().toLowerCase();
  if (!raw) return { type: null, size: null };
  let type = null;
  if (/all[- ]?in|allin|shove/.test(raw)) type = 'allin';
  else if (raw.includes('fold')) type = 'fold';
  else if (raw.includes('check')) type = 'check';
  else if (/raise|3-?bet/.test(raw)) type = 'raise';
  else if (raw.includes('call')) type = 'call';
  else if (raw.includes('bet')) type = 'bet';
  else type = raw.split(/[\s_]/)[0] || null;

  let size = null;
  if (type === 'bet' || type === 'raise') {
    const match = raw.match(/(\d+(?:\.\d+)?)\s*%/) || raw.match(/^(?:bet|raise)[_\s-](\d+(?:\.\d+)?)$/);
    if (match) size = sizeBucketFromPercent(Number.parseFloat(match[1]));
    else {
      for (const word of Object.keys(WORD_BUCKETS)) {
        if (raw.includes(word)) { size = WORD_BUCKETS[word]; break; }
      }
    }
  }
  return { type, size };
}

export function gradeAction(userLabel, gtoLabel) {
  const user = parseActionLabel(userLabel);
  const gto = parseActionLabel(gtoLabel);
  if (!user.type || !gto.type || user.type !== gto.type) return false;
  if (user.size && gto.size) return user.size === gto.size;
  return true;
}
