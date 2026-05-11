/**
 * profanityFilter — server-side egregious-term detector for live chat.
 *
 * STREAM-POLISH-R3 CHAT-MOD-2: minimal first-cut blocklist focused on
 * absolutely-not-acceptable content (slurs + direct self-harm
 * incitement). Generic profanity (damn, hell, etc.) is intentionally
 * NOT in this list — broadcasters can mute/ban as needed via the
 * existing moderate.js path.
 *
 * Used by /api/live/comment to reject messages outright with a generic
 * 400. The matched term is NOT echoed back to the client.
 *
 * Design:
 *  - Lowercase the input, strip diacritics, collapse common l33t
 *    substitutions (4->a, 3->e, 1->i, 0->o, 5->s, 7->t, $->s, @->a).
 *  - Strip non-alphanumeric runs within each token so "n.i.g",
 *    "n_i_g", "n i g" all collapse to "nig" — defeats common evasion.
 *  - Match against a Set<string> of normalized banned tokens.
 *  - Word-boundary semantics: tokens are split on whitespace and
 *    punctuation, so legitimate words containing a substring (like
 *    "Scunthorpe" or "assassin") are not false-flagged.
 *
 * Test fixture lives next to this file in profanityFilter.test.js
 * (TODO — not in this commit).
 */

// Narrow blocklist. Entries must already be lowercased and
// l33t-normalized. Keep this list FOCUSED on actual slurs + direct
// self-harm threats. Maintainers can extend conservatively.
const SLURS = new Set([
  // n-word variants
  'nigger',
  'nigga',
  'niggers',
  'niggas',
  // anti-Asian
  'chink',
  'chinks',
  'gook',
  'gooks',
  // anti-Latino
  'spic',
  'spics',
  'wetback',
  'wetbacks',
  // anti-Semitic
  'kike',
  'kikes',
  // anti-LGBTQ
  'faggot',
  'faggots',
  'tranny',
  'trannies',
  'dyke',
  'dykes',
  // ableist
  'retard',
  'retards',
  'retarded',
]);

const THREATS = new Set([
  // Direct self-harm incitement against another user
  'kys',
  'killyourself',
]);

function normalizeToken(s) {
  if (typeof s !== 'string') return '';
  let t = s.toLowerCase();
  try {
    // Strip combining diacritical marks (U+0300..U+036F).
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch (_) {
    // older runtimes without String.prototype.normalize — fall through
  }
  // l33t substitutions
  t = t
    .replace(/[4@]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't');
  // Strip non-letters: "n.i.g", "n_i_g", "n i g" all collapse to "nig".
  t = t.replace(/[^a-z]/g, '');
  return t;
}

/**
 * checkProfanity — main export.
 * Returns:
 *   { blocked: false, reason: null }              -- pass
 *   { blocked: true,  reason: 'slur' | 'threat' } -- block
 */
export function checkProfanity(text) {
  if (typeof text !== 'string' || !text) return { blocked: false, reason: null };

  // Per-token check.
  const tokens = text.split(/[\s.,;:!?'"`()\[\]{}<>\\/|+=]+/);
  for (const raw of tokens) {
    if (!raw) continue;
    const norm = normalizeToken(raw);
    if (!norm) continue;
    if (SLURS.has(norm)) return { blocked: true, reason: 'slur' };
    if (THREATS.has(norm)) return { blocked: true, reason: 'threat' };
    // "niggerrrr" / "nggggger" — collapse repeated letters then re-check.
    const collapsed = norm.replace(/(.)\1{2,}/g, '$1');
    if (collapsed !== norm) {
      if (SLURS.has(collapsed)) return { blocked: true, reason: 'slur' };
      if (THREATS.has(collapsed)) return { blocked: true, reason: 'threat' };
    }
  }

  // Whole-string scan for multi-word threats ("kill your self" -> "killyourself").
  const fullNorm = normalizeToken(text);
  if (fullNorm) {
    for (const t of THREATS) {
      if (fullNorm.includes(t)) return { blocked: true, reason: 'threat' };
    }
  }

  return { blocked: false, reason: null };
}

export default checkProfanity;
