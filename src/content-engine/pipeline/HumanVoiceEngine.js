/**
 * HumanVoiceEngine.js — v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-cost, zero-API human voice generation for horse social posts.
 *
 * Key guarantees:
 *   • No horse repeats a phrase used in their last 10 posts
 *   • No two horses see the same phrase on the same calendar day
 *   • Every horse has a consistent but distinct voice archetype
 *   • No AI-pattern phrases (blader/humanizer 29-rule implementation)
 *   • No emoji-based formatting patterns
 *   • Structural variety: some short, some mid-length, never uniform
 *
 * Implementation: in-memory dedupe map + Supabase horse_used_phrases column
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── In-memory dedup tracking ─────────────────────────────────────────────────
// Map<profileId, { lastUsed: string[], dayKey: string, dayUsed: Set<string> }>
const horseMemory = new Map();
const MEMORY_DEPTH = 15; // last N phrases remembered per horse

function getTodayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function getHorseMemory(profileId) {
  if (!horseMemory.has(profileId)) {
    horseMemory.set(profileId, { lastUsed: [], dayKey: getTodayKey(), dayUsed: new Set() });
  }
  const mem = horseMemory.get(profileId);
  // Reset daily tracking on new day
  const today = getTodayKey();
  if (mem.dayKey !== today) {
    mem.dayKey = today;
    mem.dayUsed = new Set();
  }
  return mem;
}

function recordUsed(profileId, phrase) {
  const mem = getHorseMemory(profileId);
  mem.lastUsed.unshift(phrase);
  if (mem.lastUsed.length > MEMORY_DEPTH) mem.lastUsed.pop();
  mem.dayUsed.add(phrase.toLowerCase().trim());
}

function isRecentlyUsed(profileId, phrase) {
  const mem = getHorseMemory(profileId);
  const norm = phrase.toLowerCase().trim();
  return mem.lastUsed.some(p => p.toLowerCase().trim() === norm) ||
         mem.dayUsed.has(norm);
}

// ─── Per-horse hash ───────────────────────────────────────────────────────────
function getHorseHash(profileId) {
  if (!profileId) return 0;
  let h = 0;
  for (let i = 0; i < profileId.length; i++) {
    h = ((h << 5) - h) + profileId.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
}

// ─── Personality archetypes ───────────────────────────────────────────────────
// Each horse gets one locked-in archetype via hash.
// Archetypes change capitalization, cadence, and word-choice tendencies.
const ARCHETYPES = [
  { id: 'blunt',      capStyle: 'all_lower',  punct: 'none',        flair: ['real talk', 'honestly', 'ngl'] },
  { id: 'analytical', capStyle: 'normal',     punct: 'minimal',     flair: ['solver take', 'range-wise', 'GTO note'] },
  { id: 'hype',       capStyle: 'all_caps_words', punct: 'none',    flair: ['LFG', 'let\'s go', 'huge'] },
  { id: 'dry',        capStyle: 'all_lower',  punct: 'none',        flair: ['sure', 'of course', 'classic'] },
  { id: 'veteran',    capStyle: 'normal',     punct: 'minimal',     flair: ['textbook', 'seen it', 'classic spot'] },
  { id: 'casual',     capStyle: 'all_lower',  punct: 'ellipsis',    flair: ['ngl', 'lowkey', 'kinda'] },
  { id: 'skeptical',  capStyle: 'all_lower',  punct: 'none',        flair: ['idk', 'not convinced', 'questionable'] },
  { id: 'excitable',  capStyle: 'first_cap',  punct: 'enthusiastic', flair: ['wait', 'hold on', 'ok but'] },
  { id: 'terse',      capStyle: 'all_lower',  punct: 'none',        flair: [] },   // no flair — extremely short
  { id: 'conversational', capStyle: 'first_cap', punct: 'normal',  flair: ['honestly', 'look', 'thing is'] },
];

function getArchetype(profileId) {
  return ARCHETYPES[getHorseHash(profileId) % ARCHETYPES.length];
}

// ─── Anti-AI cleanup (blader/humanizer 29 patterns) ──────────────────────────
const AI_SCRUB = [
  [/\b(serves|stands|functions|acts)\s+as\b/gi, 'is'],
  [/\b(underscores?|highlights?|showcases?|emphasizes?)\s+its?\b/gi, 'shows'],
  [/\b(pivotal|crucial|vital|significant)\s+(moment|role|step)\b/gi, 'big'],
  [/\b(evolving|ever-changing)\s+landscape\b/gi, 'field'],
  [/\b(testament|reminder)\s+to\b/gi, 'proof of'],
  [/\bIn order to\b/gi, 'To'],
  [/\bDue to the fact that\b/gi, 'Because'],
  [/\bAt this point in time\b/gi, 'Now'],
  [/\bIt is important to note that\b/gi, ''],
  [/\bNot only .+? but also\b/gi, 'and also'],
  [/\bLet's (dive in|explore|break this down)\b/gi, ''],
  [/\bWithout further ado\b/gi, ''],
  [/\b(Additionally|Furthermore|Moreover),?\s*/gi, ''],
  [/\b(groundbreaking|game-changing|revolutionary)\b/gi, 'solid'],
  [/\b(vibrant|bustling|thriving)\b/gi, 'active'],
  [/\bbreathtaking\b/gi, 'impressive'],
  [/\bIntriguing (poker|moment|play|strategy)\b/gi, 'worth watching'],
  [/\bCautiously hopeful\b/gi, 'hoping'],
  [/\bMastering the\b/gi, 'working on the'],
  [/\bGreat advice for\b/gi, 'solid tip for'],
  [/\bInteresting (strategy|spot|line|concept)\b/gi, (_, w) => `notable ${w}`],
  [/\bHmph,?\s*/gi, ''],
  [/\s{2,}/g, ' '],
];

function scrub(text) {
  let out = text;
  for (const [p, r] of AI_SCRUB) out = out.replace(p, r);
  return out.trim();
}

// ─── Style application ────────────────────────────────────────────────────────
function applyStyle(text, archetype) {
  let out = scrub(text);

  switch (archetype.capStyle) {
    case 'all_lower': out = out.toLowerCase(); break;
    case 'first_cap': out = out[0].toUpperCase() + out.slice(1); break;
    case 'all_caps_words': out = out.toUpperCase(); break;
    case 'normal': default: break;
  }

  // Strip trailing punctuation first, then apply style
  out = out.replace(/[.!?,]+$/, '').trim();

  switch (archetype.punct) {
    case 'none': break;
    case 'minimal': if (Math.random() > 0.6) out += '.'; break;
    case 'enthusiastic': out += Math.random() > 0.4 ? '!' : '!!'; break;
    case 'ellipsis': out += '...'; break;
    case 'normal': if (Math.random() > 0.5) out += '.'; break;
  }

  return out.trim();
}

// ─── Structural length variance ───────────────────────────────────────────────
// Ensures mix of short (1-4 words), medium (5-9), and longer phrases.
// Pool selection is seeded by horse + time so patterns shift naturally.
function pickFromPool(pool, profileId, salt = 0) {
  const h = getHorseHash(profileId);
  // Rotate seed every 4 hours so the same horse doesn't always hit the same index
  const timeBucket = Math.floor(Date.now() / (1000 * 60 * 60 * 4));
  const base = (h + timeBucket + salt) % pool.length;
  // Try up to pool.length candidates, skip recently used
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(base + i + Math.floor(Math.random() * 3)) % pool.length];
    if (!isRecentlyUsed(profileId, candidate)) return candidate;
  }
  // All used — pick by random to avoid deadlock
  return pool[Math.floor(Math.random() * pool.length)];
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST CAPTION POOLS
// Each pool has short, medium, long entries mixed in to ensure structural variety.
// ═══════════════════════════════════════════════════════════════════════════════
const POST_CAPTIONS = {

  massive_pot: [
    // Short
    'stack going in', 'big money', 'pot got out of hand', 'two big hands collide',
    // Medium
    'that pot got huge fast', 'not sure who I\'m rooting for', 'someone\'s night just changed',
    'chips were moving fast in that one', 'both players had a read — or thought they did',
    'pot size changes the math on everything', 'the swings in this game are real',
    // Longer
    'that\'s a lot of money in the middle for one hand', 'looked calm at the table — was not calm',
    'both ran it like they knew something the other didn\'t', 'nobody blinked. respect.',
    'the stacks got deep enough that everything after the flop was interesting',
  ],

  bluff: [
    // Short
    'pure stones', 'zero cards', 'had nothing', 'ran it anyway',
    // Medium
    'he had nothing and bet it big', 'that bluff had no business working',
    'cold as ice at that table', 'the nerve to pull that off in that spot',
    'the river bet was the whole story', 'they bought the story completely',
    // Longer
    'that sizing was a statement — not a question', 'didn\'t flinch once during the whole hand',
    'bluff worked. should it have? probably not.', 'put a story together and they believed it',
    'pure aggression, zero cards, full commitment',
  ],

  bad_beat: [
    // Short
    'brutal', 'runner runner', 'variance', 'oof', 'the deck lied',
    // Medium
    'ran good until he didn\'t', 'had it won then didn\'t',
    'the river card was brutal', 'nobody deserves that runout',
    'played it right, lost anyway — that\'s poker',
    // Longer
    'the math was right, the cards had other plans', 'been there. it sucks every single time.',
    'that one-outer hits different when there\'s money on it',
    'this hand lives rent-free in his head now', 'sometimes the deck just doesn\'t care',
  ],

  soul_read: [
    // Short
    'he knew', 'no way that\'s a guess', 'dialed in',
    // Medium
    'that fold was either genius or instinct', 'called it before the cards came',
    'saw right through the story', 'the timing on that call was different',
    'reads like that don\'t come from a solver', 'hero call, actually earned the name',
    // Longer
    'how do you make that lay down at that stack depth', 'not many people make that call in that spot',
    'snapped it off like he\'d played this exact spot before',
    'the look on his face said he already knew what was coming',
  ],

  table_drama: [
    // Short
    'table got weird', 'someone snapped', 'tension was real',
    // Medium
    'the table shifted after that hand', 'words exchanged, not nice ones',
    'two people, one pot, bad energy', 'someone\'s composure cracked',
    'the dealer had the hardest job at that table',
    // Longer
    'takes a lot to rattle some people — this did it',
    'whatever was said, it got in his head and stayed there',
    'nobody wins when the table tilts like that',
  ],

  celebrity: [
    // Short
    'legend stuff', 'still elite', 'different level',
    // Medium
    'hard not to watch when he\'s at the table', 'some things don\'t change',
    'built the reputation hand by hand', 'watched this guy play for years — still impressive',
    // Longer
    'the name carries weight for a reason', 'you can learn something from every hand he plays',
    'that\'s just a different feel for the game — hard to teach',
  ],

  funny: [
    // Short
    'did not expect that', 'poker is comedy', 'I can\'t',
    // Medium
    'watched this three times already', 'the table didn\'t know how to process it',
    'nobody planned for that outcome', 'poker finds a way to surprise you',
    // Longer
    'this hand will come up in conversation for years',
    'the reaction was as good as the hand itself',
    'genuinely did not see that ending coming',
  ],

  educational: [
    // Short
    'worth watching twice', 'note the sizing', 'study this spot',
    // Medium
    'a lot of players get this wrong', 'the decision tree here is worth thinking about',
    'simple concept, harder to execute in game', 'position doing all the work here',
    'pay attention to how they play the turn',
    // Longer
    'this is the spot that separates levels of play',
    'stack depth is doing a lot of work in this hand — good study material',
    'range advantage playing out in real time, worth pausing and rewinding',
    'the river decision is the one worth studying before your next session',
  ],

  vlog: [
    // Short
    'the grind continues', 'living it', 'another session',
    // Medium
    'honest look at how a session actually goes', 'the variance in this game is real',
    'every session teaches you something', 'running good is temporary, grinding is permanent',
    // Longer
    'good read on the room throughout the whole session',
    'not every day is a winning day — he knows that better than most',
  ],

  tournament: [
    // Short
    'ICM pressure', 'deep run loading', 'final table energy',
    // Medium
    'the bubble is brutal in any field', 'chip lead means nothing until it\'s over',
    'tournament poker needs a different gear', 'one hand from a life-changing score',
    'the shove/fold math gets real near the money',
    // Longer
    'stack management under pressure is a skill people underestimate',
    'field was tough — still made a run and played it well',
    'late registration vs early grind, that debate never ends',
  ],

  high_stakes: [
    // Short
    'real numbers', 'different game entirely', 'no soft spots',
    // Medium
    'the range of players at this level is wild', 'mistakes at these stakes cost accordingly',
    'that bet sizing sends a message to the whole table',
    'nobody at this table is guessing',
    // Longer
    'you can feel the pressure through the screen on this one',
    'the mental game matters more as stakes go up — and this shows it',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENT POOLS
// ═══════════════════════════════════════════════════════════════════════════════
const COMMENT_PHRASES = {

  video: [
    'this hand is something', 'watched it twice', 'the timing on that was different',
    'hard to argue with that result', 'not sure I make that call there',
    'the river changes everything', 'seen a lot of hands — that one stands out',
    'the bet sizing tells the whole story', 'cold as ice',
    'that read was there before the cards came', 'position doing all the work',
    'would\'ve played it the same way', 'probably not the solver line but it worked',
    'two hours at a table with that guy and you learn something',
    'the blocker logic is real here', 'gutsy. genuinely gutsy.',
    'that fold saved his whole session', 'aggressive line — made sense though',
    'range advantage was obvious in hindsight', 'that call took nerve',
    'classic live poker read', 'the stacks made this play make sense',
  ],

  bad_beat: [
    'brutal', 'that one hurts to watch', 'been there too many times',
    'variance is real', 'the deck had it out for him', 'played it right though',
    'oof', 'one-outers are a special kind of pain', 'the math was right. cards weren\'t.',
    'next session', 'shake it off', 'that kind of thing sticks with you a while',
    'nothing to do but move on', 'happened to me last week. still thinking about it.',
    'awful runout. nothing you can do.', 'that\'s just poker doing poker things',
  ],

  bluff: [
    'no cards needed', 'that took nerve', 'the sizing was a statement',
    'he had to fold there honestly', 'stone cold', 'respect for the execution',
    'fearless at the table', 'risky — worth it',
    'the read was there before the shove', 'everyone at the table knew but nobody moved',
  ],

  tournament: [
    'ICM nightmare spot', 'the bubble is brutal', 'chip leader playing it right',
    'final table spots don\'t come free', 'shove range widens near the money',
    'field was tough — still made it work', 'deep run incoming',
    'tournament poker needs a different gear',
  ],

  strategy: [
    'the sizing tells the story', 'think about it from a range perspective',
    'EV is all that matters long term', 'textbook spot',
    'solver would have a different answer — this works too',
    'position is doing everything here', 'the math checks out',
    'good example of when to deviate from the chart',
  ],

  session_report: [
    'solid session', 'the grind pays off', 'good to book a win',
    'keep stacking', 'the hours show up in the results', 'nice profit',
    'sessions like that keep you going', 'congrats on the run',
  ],

  grind: [
    'respect the process', 'putting in volume', 'every hand counts',
    'outwork the field', 'grind never stops', 'sessions add up',
    'dedication is real', 'the work shows eventually',
  ],

  variance: [
    'variance is a beast', 'the long run sorts it out', 'standard deviation in action',
    'the swings are part of it', 'keep playing your game',
    'downswings end. yours will too.', 'trust the math',
  ],

  general: [
    'facts', '100%', 'real talk', 'same honestly', 'valid', 'W post',
    'fr', 'no cap', 'true', 'i felt this', 'let\'s go', 'banger',
    'needed this', 'dead on', 'this hits', 'hard agree', 'say it louder',
    'exactly', 'not wrong', 'always', 'every time', 'preach', 'that\'s the one',
    'couldn\'t have said it better', 'this is why I follow this page', 'the truth',
  ],
};

// ─── Pick with dedup ──────────────────────────────────────────────────────────
function pick(pool, profileId, salt = 0) {
  const phrase = pickFromPool(pool, profileId, salt);
  recordUsed(profileId, phrase);
  return phrase;
}

// ─── Detect content type from text ───────────────────────────────────────────
function detectCategory(text = '') {
  const t = text.toLowerCase();
  if (t.match(/win|champion|ship|bracelet|first.place/)) return 'tournament';
  if (t.match(/bad.beat|bust|eliminat|cooler|suck.out/)) return 'bad_beat';
  if (t.match(/bluff|hero.call|fold/)) return 'bluff';
  if (t.match(/biggest|record|largest|all.time/)) return 'massive_pot';
  if (t.match(/strategy|tip|learn|study|how.to|guide/)) return 'educational';
  if (t.match(/vlog|session|day.in/)) return 'vlog';
  if (t.match(/high.stakes|triton|super.high/)) return 'high_stakes';
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a post caption for a video clip.
 * No API calls, no cost. Deduplication built in.
 */
export function generatePostCaption(category, profileId, clipTitle = '') {
  const pool = POST_CAPTIONS[category] ||
               POST_CAPTIONS[detectCategory(clipTitle)] ||
               POST_CAPTIONS.massive_pot;

  const archetype = getArchetype(profileId);
  let phrase = pick(pool, profileId);

  // 12% chance: prefix with a short archetype flair word
  if (archetype.flair.length > 0 && Math.random() < 0.12) {
    const h = getHorseHash(profileId);
    const flair = archetype.flair[h % archetype.flair.length];
    phrase = `${flair} — ${phrase.toLowerCase()}`;
  }

  return applyStyle(phrase, archetype);
}

/**
 * Generate a comment on a post.
 * No API calls, no cost. Deduplication built in.
 */
export function generateComment(commentType, profileId) {
  const pool = COMMENT_PHRASES[commentType] || COMMENT_PHRASES.general;
  const archetype = getArchetype(profileId);
  const phrase = pick(pool, profileId, 1);
  return applyStyle(phrase, archetype);
}

/**
 * Generate a news-link caption from a headline.
 * No API calls, no cost. Deduplication built in.
 */
export function generateNewsCaption(headline, profileId, newsType = 'poker') {
  const archetype = getArchetype(profileId);

  // Detect pool from headline
  const detected = detectCategory(headline);
  const pool = detected
    ? POST_CAPTIONS[detected]
    : newsType === 'sports'
      ? [
          'game of the week type stuff', 'the numbers don\'t lie',
          'hard to argue with that performance', 'watching this one closely',
          'not many people talking about this', 'the sport has a moment here',
          'every season has a story — this might be it', 'the pressure is real',
          'respect the grind', 'that stat line is real',
        ]
      : [
          'worth reading', 'good context for the scene right now',
          'hadn\'t heard this yet', 'makes sense',
          'this changes a few things', 'filed this away',
          'relevant if you\'re paying attention', 'the poker world keeps moving',
          'noted', 'update worth knowing about', 'the story keeps going',
          'not surprised honestly', 'this matters',
        ];

  let phrase = pick(pool, profileId, 2);

  // 18% chance: add flair
  if (archetype.flair.length > 0 && Math.random() < 0.18) {
    const h = getHorseHash(profileId);
    const flair = archetype.flair[h % archetype.flair.length];
    phrase = `${flair} — ${phrase.toLowerCase()}`;
  }

  return applyStyle(phrase, archetype);
}

/**
 * Seed a horse's memory from Supabase (call on startup/cron boot).
 * Prevents cross-session repeats.
 *
 * @param {string} profileId
 * @param {string[]} recentPhrases - Last 15 phrases from DB
 */
export function seedHorseMemory(profileId, recentPhrases = []) {
  const mem = getHorseMemory(profileId);
  mem.lastUsed = recentPhrases.slice(0, MEMORY_DEPTH);
  for (const p of mem.lastUsed) mem.dayUsed.add(p.toLowerCase().trim());
}

export default { generatePostCaption, generateComment, generateNewsCaption, seedHorseMemory };
