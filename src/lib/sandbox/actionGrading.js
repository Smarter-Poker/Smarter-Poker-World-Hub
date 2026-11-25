const WORD_BUCKETS = [
  [/\bsmall\b/, 'small'],
  [/\bthird\b/, 'small'],
  [/\bhalf\b/, 'medium'],
  [/\bmedium\b/, 'medium'],
  [/\blarge\b/, 'large'],
  [/\bbig\b/, 'large'],
  [/\boverbet\b/, 'pot'],
  [/\bpot\b/, 'pot'],
];

export function sizeBucketFromPercent(pct) {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return null;
  if (pct >= 100) return 'pot';
  if (pct > 75) return 'large';
  if (pct > 40) return 'medium';
  return 'small';
}

export function parseActionLabel(label) {
  const raw = String(label || '').trim().toLowerCase();
  if (!raw) return { type: null, size: null };
  let type = null;
  if (/\b(?:all[- ]?in|allin|shove|jam|push)\b/.test(raw)) type = 'allin';
  else if (/\bfold\b/.test(raw) || raw.startsWith('fold')) type = 'fold';
  else if (/\bcheck[- ]?raise\b|\braise\b|\b[3-9]-?bet\b|\bopen[- ]?raise\b/.test(raw)) type = 'raise';
  else if (/\bcheck\s*\/\s*call\b/.test(raw)) type = 'check_call';
  else if (/\bcheck\b/.test(raw) || raw.startsWith('check')) type = 'check';
  else if (/\bcall\b/.test(raw) || raw.startsWith('call')) type = 'call';
  else if (/\b(?:bet|overbet)\b/.test(raw) || raw.startsWith('bet') || raw.startsWith('overbet')) type = 'bet';
  else type = raw.split(/[\s_]/)[0] || null;

  let size = null;
  if (type === 'bet' || type === 'raise') {
    const fractionMatch = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    const pctMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/) || raw.match(/^(?:bet|raise)[_\s-](\d+(?:\.\d+)?)$/);
    if (fractionMatch) {
      const num = Number.parseFloat(fractionMatch[1]);
      const den = Number.parseFloat(fractionMatch[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
        size = sizeBucketFromPercent((num / den) * 100);
      }
    } else if (pctMatch) {
      size = sizeBucketFromPercent(Number.parseFloat(pctMatch[1]));
    } else {
      for (const [pattern, bucket] of WORD_BUCKETS) {
        if (pattern.test(raw)) { size = bucket; break; }
      }
    }
  }
  return { type, size };
}

export function gradeAction(userLabel, gtoLabel) {
  const user = parseActionLabel(userLabel);
  const gto = parseActionLabel(gtoLabel);
  if (!user.type || !gto.type) return false;
  if (gto.type === 'check_call' && (user.type === 'check' || user.type === 'call' || user.type === 'check_call')) return true;
  if (user.type === 'check_call' && (gto.type === 'check' || gto.type === 'call')) return true;
  if (user.type !== gto.type) return false;
  if (user.size && gto.size) return user.size === gto.size;
  return true;
}
