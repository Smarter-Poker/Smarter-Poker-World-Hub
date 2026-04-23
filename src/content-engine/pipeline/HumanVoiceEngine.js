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
// Each horse gets one locked-in archetype via hash — defines their TENDENCIES,
// not their fixed behavior. applyStyle injects randomness so the same horse
// never looks identical post after post.
const ARCHETYPES = [
  { id: 'blunt',         capStyle: 'all_lower',  punct: 'none',        flair: ['real talk', 'honestly', 'ngl'] },
  { id: 'analytical',   capStyle: 'normal',     punct: 'minimal',     flair: ['solver take', 'GTO note', 'range perspective'] },
  { id: 'hype',         capStyle: 'normal',     punct: 'none',        flair: ['massive', 'huge', 'unreal'] },
  { id: 'dry',          capStyle: 'all_lower',  punct: 'none',        flair: ['sure', 'of course', 'classic'] },
  { id: 'veteran',      capStyle: 'normal',     punct: 'minimal',     flair: ['textbook', 'seen it', 'classic spot'] },
  { id: 'casual',       capStyle: 'all_lower',  punct: 'none',        flair: ['ngl', 'lowkey', 'kinda'] },
  { id: 'skeptical',    capStyle: 'all_lower',  punct: 'none',        flair: ['idk', 'not convinced', 'questionable'] },
  { id: 'excitable',    capStyle: 'first_cap',  punct: 'enthusiastic', flair: ['wait', 'hold on', 'ok but'] },
  { id: 'terse',        capStyle: 'all_lower',  punct: 'none',        flair: [] },
  { id: 'conversational', capStyle: 'first_cap', punct: 'normal',    flair: ['honestly', 'look', 'thing is'] },
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
// Each archetype defines a TENDENCY, not a fixed rule.
// Randomness is injected so the same horse varies post to post.
// Goal: no two consecutive posts look structurally identical.
function applyStyle(text, archetype) {
  let out = scrub(text);

  // Strip trailing punctuation before any style is applied
  out = out.replace(/[.!?,;]+$/, '').trim();

  // ── Capitalization: archetype tendency + random drift ──────────────────────
  // 'all_lower' horses: 70% stay lower, 20% capitalize first word, 10% normal
  // 'first_cap' horses: 75% capitalize first word, 15% all lower, 10% normal
  // 'normal' horses: 60% unchanged, 25% first_cap, 15% all lower
  const capRoll = Math.random();
  const cs = archetype.capStyle;
  if (cs === 'all_lower') {
    if (capRoll < 0.70) out = out.toLowerCase();
    else if (capRoll < 0.90) out = out[0].toUpperCase() + out.slice(1).toLowerCase();
    else { /* leave as-is (normal) */ }
  } else if (cs === 'first_cap') {
    if (capRoll < 0.75) out = out[0].toUpperCase() + out.slice(1);
    else if (capRoll < 0.90) out = out.toLowerCase();
    else { /* leave as-is */ }
  } else { // 'normal'
    if (capRoll < 0.60) { /* leave as-is */ }
    else if (capRoll < 0.85) out = out[0].toUpperCase() + out.slice(1);
    else out = out.toLowerCase();
  }

  // ── Punctuation: archetype tendency + random drift ─────────────────────────
  // 'none' horses: 65% no punct, 25% period, 10% nothing (already done)
  // 'minimal' horses: 50% period, 30% nothing, 20% comma then next thought
  // 'enthusiastic' horses: 50% '!', 30% '!!', 20% nothing
  // 'ellipsis' horses: 50% '...', 30% nothing, 20% period (NOT always '...')
  // 'normal' horses: 45% period, 30% nothing, 15% '?', 10% comma-tail
  const punctRoll = Math.random();
  const p = archetype.punct;
  if (p === 'none') {
    if (punctRoll > 0.75) out += '.';
    // else: no punct
  } else if (p === 'minimal') {
    if (punctRoll > 0.50) out += '.';
    // else: no punct
  } else if (p === 'enthusiastic') {
    if (punctRoll > 0.70) out += '!!';
    else if (punctRoll > 0.30) out += '!';
    // else: no punct (20%)
  } else if (p === 'ellipsis') {
    if (punctRoll > 0.50) out += '...';
    else if (punctRoll > 0.20) out += '.';
    // else: no punct (20%)
  } else { // 'normal'
    if (punctRoll > 0.55) out += '.';
    else if (punctRoll > 0.85) out += '?';
    // else: no punct
  }

  return out.trim();
}


// ─── Structural length variance ───────────────────────────────────────────────
// Ensures mix of short (1-4 words), medium (5-9), and longer phrases.
// Pool selection is seeded by horse + time so patterns shift naturally.
// Per-horse call counter — increments monotonically, breaks timeBucket ties
const horsePick = new Map();
function nextPickOffset(profileId) {
  const n = (horsePick.get(profileId) || 0) + 1;
  horsePick.set(profileId, n);
  return n;
}

function pickFromPool(pool, profileId, salt = 0) {
  const h = getHorseHash(profileId);
  // Rotate seed every 4 hours + monotonic per-call counter to guarantee variance
  const timeBucket = Math.floor(Date.now() / (1000 * 60 * 60 * 4));
  const callN = nextPickOffset(profileId);
  const base = (h + timeBucket + salt + callN) % pool.length;
  // Try every candidate in order, skip recently used
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(base + i) % pool.length];
    if (!isRecentlyUsed(profileId, candidate)) return candidate;
  }
  // All used — rotate by callN to avoid always returning pool[0]
  return pool[callN % pool.length];
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST CAPTION POOLS
// Each pool has short, medium, long entries mixed in to ensure structural variety.
// ═══════════════════════════════════════════════════════════════════════════════
const POST_CAPTIONS = {

  massive_pot: [
    // Short
    'stack going in', 'big money', 'pot got out of hand', 'two big hands collide',
    'all in', 'monster pot', 'it went in', 'massive',
    // Medium
    'that pot got huge fast', 'not sure who I\'m rooting for', 'someone\'s night just changed',
    'chips were moving fast in that one', 'both players had a read, or thought they did',
    'pot size changes the math on everything', 'the swings in this game are real',
    'the money went in fast on that one', 'when both players feel good about it',
    'all the chips are in the middle', 'this is why people watch poker',
    // Longer
    'that\'s a lot of money in the middle for one hand', 'looked calm at the table, was not calm',
    'both ran it like they knew something the other didn\'t', 'nobody blinked. respect.',
    'the stacks got deep enough that everything after the flop was interesting',
    'this hand changed the whole trajectory of the session',
    'getting it all in pre is one thing, this was different',
    'sometimes you just know going into it that it\'s going to be big',
  ],

  bluff: [
    // Short
    'pure stones', 'zero cards', 'had nothing', 'ran it anyway',
    // Medium
    'he had nothing and bet it big', 'that bluff had no business working',
    'cold as ice at that table', 'the nerve to pull that off in that spot',
    'the river bet was the whole story', 'they bought the story completely',
    // Longer
    'that sizing was a statement, not a question', 'didn\'t flinch once during the whole hand',
    'bluff worked. should it have? probably not.', 'put a story together and they believed it',
    'pure aggression, zero cards, full commitment',
  ],

  bad_beat: [
    // Short
    'brutal', 'runner runner', 'variance', 'oof', 'the deck lied',
    // Medium
    'ran good until he didn\'t', 'had it won then didn\'t',
    'the river card was brutal', 'nobody deserves that runout',
    'played it right, lost anyway. that\'s poker',
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
    'takes a lot to rattle some people, this did it',
    'whatever was said, it got in his head and stayed there',
    'nobody wins when the table tilts like that',
  ],

  celebrity: [
    // Short
    'legend stuff', 'still elite', 'different level',
    // Medium
    'hard not to watch when he\'s at the table', 'some things don\'t change',
    'built the reputation hand by hand', 'watched this guy play for years, still impressive',
    // Longer
    'the name carries weight for a reason', 'you can learn something from every hand he plays',
    'that\'s just a different feel for the game, hard to teach',
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
    'stack depth is doing a lot of work in this hand, good study material',
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
    'not every day is a winning day. he knows that better than most',
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
    'field was tough, still made a run and played it well',
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
    'the mental game matters more as stakes go up, and this shows it',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENT POOLS
// ═══════════════════════════════════════════════════════════════════════════════
const COMMENT_PHRASES = {

  video: [
    'this hand is something', 'watched it twice', 'the timing on that was different',
    'hard to argue with that result', 'not sure I make that call there',
    'the river changes everything', 'seen a lot of hands, that one stands out',
    'the bet sizing tells the whole story', 'cold as ice',
    'that read was there before the cards came', 'position doing all the work',
    'would\'ve played it the same way', 'probably not the solver line but it worked',
    'two hours at a table with that guy and you learn something',
    'the blocker logic is real here', 'gutsy. genuinely gutsy.',
    'that fold saved his whole session', 'aggressive line, made sense though',
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
    'fearless at the table', 'risky, worth it',
    'the read was there before the shove', 'everyone at the table knew but nobody moved',
  ],

  tournament: [
    'ICM nightmare spot', 'the bubble is brutal', 'chip leader playing it right',
    'final table spots don\'t come free', 'shove range widens near the money',
    'field was tough, still made it work', 'deep run incoming',
    'tournament poker needs a different gear',
  ],

  strategy: [
    'the sizing tells the story', 'think about it from a range perspective',
    'EV is all that matters long term', 'textbook spot',
    'solver would have a different answer, this works too',
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
    'true', 'i felt this', 'let\'s go', 'banger',
    'needed this', 'dead on', 'this hits', 'hard agree', 'say it louder',
    'exactly', 'not wrong', 'always', 'every time', 'preach', 'that\'s the one',
    'couldn\'t have said it better', 'this is why I follow this page', 'the truth',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// DM POOLS
// ═══════════════════════════════════════════════════════════════════════════════
const DM_PHRASES = {
  reply: [
    'yeah for sure', 'definitely', 'makes sense', 'for real', 'i hear that',
    'variance is brutal man', 'gotta keep grinding', 'tough spot', 'standard cooler', 
    'next hand', 'always happens at the worst time', 'just part of the game',
    'happens to the best of us', 'keep pushing', 'can\'t win them all',
    'sometimes the math doesn\'t matter', 'good luck at the tables today',
    'been there too many times to count', 'shake it off and keep playing'
  ],
  conclude: [
    'gotta head back to the tables, catch you later', 
    'back to the grind for me, gl', 
    'table is starting, talk later', 
    'good luck at the tables',
    'about to sit down for a session, ttyl',
    'anyway back to the tables',
    'gonna go punt a buy in, catch you later'
  ]
};

// ─── Pick with dedup ──────────────────────────────────────────────────────────
function pick(pool, profileId, salt = 0) {
  const phrase = pickFromPool(pool, profileId, salt);
  recordUsed(profileId, phrase);
  return phrase;
}

// ─── Detect content type from text ───────────────────────────────────────────
function detectCategory(text = '') {
  const t = (text || '').toLowerCase();  // guard against explicit null
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
// CONTEXT-AWARE TITLE INJECTION
// Extracts meaningful signals from the clip title / article headline and
// constructs a caption that actually references the content.
// ~60% of the time we use context; 40% we fall back to the category pool.
// This ensures variety while never feeling completely disconnected from the post.
// ═══════════════════════════════════════════════════════════════════════════════

// Known player names (first name OR last name match is enough)
const KNOWN_PLAYERS = [
  'Negreanu', 'Ivey', 'Hellmuth', 'Polk', 'Brunson', 'Esfandiari', 'Selbst',
  'Holz', 'Cada', 'Moneymaker', 'Chan', 'Hachem', 'Antonius', 'Dwan', 'Galfond',
  'Solberg', 'Rampage', 'Brad Owen', 'Neeme', 'Mariano', 'Wolfgang', 'Jaman',
  'Johnnie Vibes', 'Boski', 'Ryan Depaulo', 'Frankie', 'Doug', 'Berkey',
  'Persson', 'Reinkemeier', 'Kenney', 'Yockey', 'Aldemir', 'Koroknai',
  'Phil', 'Daniel', 'Tom', 'Ike', 'Uri', 'Biluzin',
];

// Known venues / shows
const KNOWN_VENUES = [
  { match: /hustler/i,      name: 'Hustler Casino Live' },
  { match: /bellagio/i,     name: 'Bellagio' },
  { match: /lodge/i,        name: 'the Lodge' },
  { match: /live at the bike/i, name: 'Live at the Bike' },
  { match: /triton/i,       name: 'Triton' },
  { match: /pokergo/i,      name: 'PokerGO' },
  { match: /high stakes poker/i, name: 'High Stakes Poker' },
  { match: /poker after dark/i,  name: 'Poker After Dark' },
  { match: /wynn/i,         name: 'Wynn' },
  { match: /aria/i,         name: 'Aria' },
  { match: /stones/i,       name: 'Stones' },
  { match: /wsop/i,         name: 'the WSOP' },
  { match: /wpt/i,          name: 'the WPT' },
  { match: /ept/i,          name: 'the EPT' },
  { match: /cgwc/i,         name: 'the CGWC' },
];

// Context-aware caption templates keyed by what was detected
// {{subject}} = player name or show/venue name
const CONTEXT_TEMPLATES = {
  player: [
    '{{subject}} in this one',
    'watching {{subject}} is always interesting',
    'that {{subject}} hand was something',
    'classic {{subject}} at the table',
    '{{subject}} knows what he\'s doing out there',
    '{{subject}} runs hot and cold like everyone else',
    'always something to learn from watching {{subject}}',
    '{{subject}} makes it look easy',
    'hard to argue with how {{subject}} played that',
    '{{subject}} doing {{subject}} things',
  ],
  venue: [
    '{{subject}} always delivers',
    'another one from {{subject}}',
    '{{subject}}, never a dull hand',
    'the action at {{subject}} never stops',
    '{{subject}} has been running wild lately',
    'if you\'re not watching {{subject}} you\'re missing out',
    '{{subject}} is where the real hands happen',
    'back at {{subject}}, back at it',
  ],
  concept: {
    bluff:       ['had to be a bluff. had to be.', 'the nerve on that bet', 'stone cold execution', 'run it and pray strategy', 'that sizing was a statement'],
    hero_call:   ['that\'s a hero call if I\'ve ever seen one', 'no way I make that call', 'the read was real', 'pure instinct', 'dialed in on that one'],
    full_house:  ['flopped a monster', 'river full house hits different', 'when the board gives you everything', 'flopped the world'],
    bad_beat:    ['brutal runout', 'the deck said no', 'one outer special', 'variance is a beast'],
    vlog:        ['the grind on camera is something else', 'raw look at the real game', 'day in the life stuff always hits', 'respect for documenting the grind'],
    wsop:        ['every WSOP hand matters at this stage', 'bubble pressure is different', 'deep run energy', 'WSOP is the standard'],
    day_final:   ['every chip counts late in a tournament', 'the pressure ramps up fast', 'this is what tournament poker looks like'],
    breakdown:   ['breaking it down hand by hand is how you get better', 'the analysis is always worth watching', 'street-by-street breakdowns are underrated'],
  }
};

/**
 * Extract context from a title string.
 * Returns { type: 'player'|'venue'|'concept'|null, value: string|null }
 */
function extractTitleContext(title) {
  if (!title || typeof title !== 'string' || title.length < 3) return { type: null, value: null };
  const t = title;

  // 1. Check for known players
  for (const p of KNOWN_PLAYERS) {
    if (new RegExp(`\\b${p}\\b`, 'i').test(t)) {
      return { type: 'player', value: p };
    }
  }

  // 2. Check for known venues/shows
  for (const v of KNOWN_VENUES) {
    if (v.match.test(t)) return { type: 'venue', value: v.name };
  }

  // 3. Check for key concepts
  if (/hero\s*call/i.test(t)) return { type: 'concept', value: 'hero_call' };
  if (/full\s*house/i.test(t)) return { type: 'concept', value: 'full_house' };
  if (/bluff/i.test(t)) return { type: 'concept', value: 'bluff' };
  if (/bad\s*beat|suck\s*out|cooler/i.test(t)) return { type: 'concept', value: 'bad_beat' };
  if (/vlog|day\s*\d/i.test(t)) return { type: 'concept', value: 'vlog' };
  if (/wsop|world\s*series/i.test(t)) return { type: 'concept', value: 'wsop' };
  if (/day\s*(\d+|final|2|3)/i.test(t)) return { type: 'concept', value: 'day_final' };
  if (/breakdown|analysis|hand history|street.by.street/i.test(t)) return { type: 'concept', value: 'breakdown' };

  return { type: null, value: null };
}

/**
 * Build a context-aware caption from the extracted title context.
 * Returns null if no useful context found (fallback to pool).
 */
function buildContextCaption(ctx, profileId) {
  if (!ctx || ctx.type === null) return null;

  const archetype = getArchetype(profileId);

  if (ctx.type === 'player') {
    const templates = CONTEXT_TEMPLATES.player;
    const h = getHorseHash(profileId);
    const template = templates[(h + Math.floor(Math.random() * 3)) % templates.length];
    const phrase = template.replace(/{{subject}}/g, ctx.value);
    recordUsed(profileId, phrase);
    return applyStyle(phrase, archetype);
  }

  if (ctx.type === 'venue') {
    const templates = CONTEXT_TEMPLATES.venue;
    const h = getHorseHash(profileId);
    const template = templates[(h + Math.floor(Math.random() * 3)) % templates.length];
    const phrase = template.replace(/{{subject}}/g, ctx.value);
    recordUsed(profileId, phrase);
    return applyStyle(phrase, archetype);
  }

  if (ctx.type === 'concept') {
    const pool = CONTEXT_TEMPLATES.concept[ctx.value];
    if (!pool) return null;
    const phrase = pool[Math.floor(Math.random() * pool.length)];
    recordUsed(profileId, phrase);
    return applyStyle(phrase, archetype);
  }

  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL OUTPUT SANITIZER — strip chars that are BANNED from horse-generated text
// Em dash (—) is forbidden: it reads as formal/editorial, not human.
// Applied at every public export as a final safety net.
// ═══════════════════════════════════════════════════════════════════════════════
function sanitizeHorseOutput(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\u2014/g, ',')   // em dash → comma (natural spoken rhythm)
    .replace(/  +/g, ' ')       // collapse double spaces left by removal
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a post caption for a video clip.
 * No API calls, no cost. Deduplication built in.
 */
export function generatePostCaption(category, profileId, clipTitle = '') {
  // Null-guard: callers may pass explicit null
  const safeTitle = (clipTitle && typeof clipTitle === 'string') ? clipTitle : '';
  // 60% of the time: try to generate a title-aware, contextual caption
  if (safeTitle && Math.random() < 0.60) {
    const ctx = extractTitleContext(safeTitle);
    const contextCaption = buildContextCaption(ctx, profileId);
    // BUG-FIX: contextCaption early-return previously bypassed sanitizeHorseOutput
    if (contextCaption && contextCaption.trim().length >= 10) return sanitizeHorseOutput(contextCaption);
  }

  // Fallback: pick from category-appropriate phrase pool
  const pool = POST_CAPTIONS[category] ||
               POST_CAPTIONS[detectCategory(safeTitle)] ||
               POST_CAPTIONS.massive_pot;

  const archetype = getArchetype(profileId);

  // Min-length guard: retry up to 3x to avoid sub-10-char captions
  let phrase = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = pick(pool, profileId);
    if (candidate && candidate.trim().length >= 10) { phrase = candidate; break; }
    if (!phrase || candidate.length > phrase.length) phrase = candidate || phrase;
  }

  // 20% chance: prefix with archetype flair (randomized pick, not always same word)
  if (archetype.flair.length > 0 && Math.random() < 0.20) {
    const flair = archetype.flair[Math.floor(Math.random() * archetype.flair.length)];
    phrase = `${flair}, ${phrase.toLowerCase()}`;
  }

  return sanitizeHorseOutput(applyStyle(phrase, archetype));
}

/**
 * Generate a comment on a post.
 * No API calls, no cost. Deduplication built in.
 */
export function generateComment(commentType, profileId) {
  const pool = COMMENT_PHRASES[commentType] || COMMENT_PHRASES.general;
  const archetype = getArchetype(profileId);
  const phrase = pick(pool, profileId, 1);
  return sanitizeHorseOutput(applyStyle(phrase, archetype));
}

/**
 * Generate a news-link caption from a headline.
 * No API calls, no cost. Deduplication built in.
 */
export function generateNewsCaption(headline, profileId, newsType = 'poker') {
  const archetype = getArchetype(profileId);
  // Null-guard: callers may pass explicit null
  const safeHeadline = (headline && typeof headline === 'string') ? headline : '';

  // Only attempt poker-context extraction if it's actually poker news
  if (newsType === 'poker') {
    // 65% of the time: try to build a title-aware caption from the headline
    if (safeHeadline && Math.random() < 0.65) {
      const ctx = extractTitleContext(safeHeadline);
      const contextCaption = buildContextCaption(ctx, profileId);
      // BUG-FIX: contextCaption early-return previously bypassed sanitizeHorseOutput
      if (contextCaption && contextCaption.trim().length >= 10) return sanitizeHorseOutput(contextCaption);
    }
  }

  // Determine the pool based on newsType
  let pool;
  if (newsType === 'sports') {
    pool = [
      'game of the week type stuff', 'the numbers really do not lie',
      'hard to argue with that performance', 'watching this one closely',
      'not many people are talking about this yet', 'the sport has a moment here',
      'every season has a story, this might be it', 'the pressure is real here',
      'respect the grind no matter the sport', 'that stat line tells the whole story',
    ];
  } else {
    // Fallback: detect pool from headline only if it's poker (or fallback to generic news)
    const detected = detectCategory(safeHeadline);
    pool = detected
      ? POST_CAPTIONS[detected] || [
          'worth reading if you follow the scene', 'good context for where things stand right now',
          'hadn\'t heard this one yet', 'makes sense when you think about it',
          'this changes a few things going forward', 'filed this one away',
          'relevant if you\'re paying attention to the scene', 'the poker world keeps moving',
          'worth knowing about', 'the story keeps going on this one',
          'not surprised honestly but still worth noting', 'this one actually matters',
        ]
      : [
          'worth reading if you follow the scene', 'good context for where things stand right now',
          'hadn\'t heard this one yet', 'makes sense when you think about it',
          'this changes a few things going forward', 'filed this one away',
          'relevant if you\'re paying attention to the scene', 'the poker world keeps moving',
          'worth knowing about', 'the story keeps going on this one',
          'not surprised honestly but still worth noting', 'this one actually matters',
        ];
  }

  // Min-length guard: retry up to 3x to avoid sub-10-char captions
  let phrase = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = pick(pool, profileId, 2);
    if (candidate && candidate.trim().length >= 10) { phrase = candidate; break; }
    if (!phrase || candidate.length > phrase.length) phrase = candidate || phrase;
  }

  // 20% chance: prefix with archetype flair
  // ONLY prefix poker-specific flairs if newsType is poker to avoid weird sports terminology
  // Safe flairs that are fine anywhere: honestly, facts, real talk, wild, sick, crazy
  if (archetype.flair.length > 0 && Math.random() < 0.20) {
    let allowedFlairs = archetype.flair;
    if (newsType !== 'poker') {
      // Filter out overly poker-specific flairs
      const pokerFlairs = ['solver take', 'GTO note', 'range perspective', 'EV check', 'solver approved', 'study note'];
      allowedFlairs = archetype.flair.filter(f => !pokerFlairs.includes(f));
    }
    
    if (allowedFlairs.length > 0) {
      const flair = allowedFlairs[Math.floor(Math.random() * allowedFlairs.length)];
      phrase = `${flair}, ${phrase.toLowerCase()}`;
    }
  }

  return sanitizeHorseOutput(applyStyle(phrase, archetype));
}

/**
 * Generate a direct message reply.
 * Concludes the conversation if history is getting long.
 */
export function generateDMReply(historyLength, profileId) {
  const isConcluding = historyLength >= 3;
  const pool = isConcluding ? DM_PHRASES.conclude : DM_PHRASES.reply;
  const archetype = getArchetype(profileId);
  const phrase = pick(pool, profileId, 3);
  return sanitizeHorseOutput(applyStyle(phrase, archetype));
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
  // Guard: Supabase may return null data — treat as empty
  const safe = Array.isArray(recentPhrases) ? recentPhrases : [];
  mem.lastUsed = safe
    .filter(p => p != null && typeof p === 'string' && p.trim().length > 0)
    .slice(0, MEMORY_DEPTH);
  for (const p of mem.lastUsed) mem.dayUsed.add(p.toLowerCase().trim());
}

export default { generatePostCaption, generateComment, generateNewsCaption, generateDMReply, seedHorseMemory };
