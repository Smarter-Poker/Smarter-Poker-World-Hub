/**
 * /api/trivia/* — Hono catch-all router (Phase 4.4 module #3, 2026-04-28)
 *
 * Consolidates 3 separate handlers (daily/submit/render-gto-panel) under
 * a single Hono app. Same pattern as calls/* and venues/* — auth +
 * rate-limit + Sentry wrapper as middleware.
 *
 * Routes (mounted at /api/trivia):
 *   GET  /daily            — fetch today's questions (public, cache 1h)
 *   POST /submit           — save score + return leaderboard (optional auth for username)
 *   POST /render-gto-panel — generate AI panel image, cache to Supabase storage
 *
 * Replaces:
 *   pages/api/trivia/daily.js              (226 LOC)
 *   pages/api/trivia/submit.js             (116 LOC)
 *   pages/api/trivia/render-gto-panel.js   (304 LOC)
 *   = 646 LOC total, now ~520 LOC consolidated.
 *
 * Auth note: only render-gto-panel requires auth (Bearer JWT). daily is
 * public. submit uses auth optionally to attach username (falls back to
 * Guest_<random>). The shared middleware applies rate-limit on writes
 * but NOT auth — each route handles its own auth check (mixed pattern).
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import crypto from 'crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

// ─── Lazy Supabase ────────────────────────────────────────────────────────
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function getTodayCST() {
  const now = new Date();
  const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const year = cstDate.getFullYear();
  const month = String(cstDate.getMonth() + 1).padStart(2, '0');
  const day = String(cstDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const FALLBACK_QUESTIONS = [
  { id: 'fb1', category: 'poker_history', difficulty: 'medium', question: 'In what year was the first World Series of Poker Main Event held?', options: ['1968', '1970', '1972', '1975'], correct_index: 1, explanation: 'The first WSOP was held in 1970 at Binion\'s Horseshoe Casino in Las Vegas. Johnny Moss was voted champion by his peers.' },
  { id: 'fb2', category: 'famous_hands', difficulty: 'medium', question: 'What hand did Chris Moneymaker hold when he won the 2003 WSOP Main Event?', options: ['5-4 suited', 'A-K suited', 'Pocket Fives', '7-2 offsuit'], correct_index: 2, explanation: 'Chris Moneymaker held pocket fives and made a full house to beat Sam Farha\'s top pair, sparking the "poker boom."' },
  { id: 'fb3', category: 'gto_theory', difficulty: 'hard', question: 'In GTO poker, what is the "Minimum Defense Frequency" concept used for?', options: ['Calculating pot odds', 'Determining how often to call to prevent profitable bluffs', 'Sizing your bets', 'Choosing starting hands'], correct_index: 1, explanation: 'MDF tells you the minimum frequency you must call/continue to prevent your opponent from profitably bluffing with any two cards.' },
  { id: 'fb4', category: 'player_profiles', difficulty: 'easy', question: 'Which player holds the record for most WSOP bracelets?', options: ['Phil Ivey', 'Doyle Brunson', 'Phil Hellmuth', 'Johnny Chan'], correct_index: 2, explanation: 'Phil Hellmuth holds the record with 17 WSOP bracelets, more than any other player in history.' },
  { id: 'fb5', category: 'tournament_facts', difficulty: 'medium', question: 'What is the largest first-place prize ever awarded in a poker tournament?', options: ['$8.5 million', '$10 million', '$12 million', '$18.3 million'], correct_index: 3, explanation: 'Antonio Esfandiari won $18.3 million in the 2012 Big One for One Drop, the largest first-place prize in poker history.' },
  { id: 'fb6', category: 'rule_knowledge', difficulty: 'easy', question: 'In Texas Hold\'em, what happens if two players have the exact same hand?', options: ['The player with position wins', 'The pot is split equally', 'There\'s a runout card', 'The player who bet first wins'], correct_index: 1, explanation: 'When hands are identical, the pot is split equally among the tied players. This is called a "chop."' },
  { id: 'fb7', category: 'poker_history', difficulty: 'hard', question: 'Who is credited with inventing Texas Hold\'em poker?', options: ['Doyle Brunson', 'Unknown - originated in Robstown, Texas', 'Johnny Moss', 'Benny Binion'], correct_index: 1, explanation: 'The origins of Texas Hold\'em are unclear, but it\'s believed to have originated in Robstown, Texas in the early 1900s.' },
  { id: 'fb8', category: 'famous_hands', difficulty: 'medium', question: 'What is the "Dead Man\'s Hand" in poker?', options: ['Pocket Kings', 'Aces and Eights (black)', 'Queen-Seven offsuit', 'Two-Seven offsuit'], correct_index: 1, explanation: 'The Dead Man\'s Hand is two pair of black aces and black eights. It\'s the hand Wild Bill Hickok allegedly held when he was shot and killed in 1876.' },
  { id: 'fb9', category: 'gto_theory', difficulty: 'medium', question: 'What does "polarized range" mean in poker?', options: ['Playing only premium hands', 'A range containing only very strong hands or bluffs', 'Adjusting to opponent tendencies', 'Playing in position only'], correct_index: 1, explanation: 'A polarized range contains only the strongest value hands and bluffs, with no medium-strength hands.' },
  { id: 'fb10', category: 'tournament_facts', difficulty: 'easy', question: 'What is the buy-in for the WSOP Main Event?', options: ['$5,000', '$10,000', '$25,000', '$50,000'], correct_index: 1, explanation: 'The WSOP Main Event has had a $10,000 buy-in since its inception in 1970.' },
];

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/trivia');

// Shared middleware: rate-limit on writes
app.use('*', async (c, next) => {
  const method = c.req.method;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const req = c.env?.req;
    const res = c.env?.res;
    if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
      return c.body(null, 429);
    }
  }
  await next();
});

// ─── GET /api/trivia/daily ────────────────────────────────────────────────
app.get('/daily', async (c) => {
  try {
    const today = getTodayCST();

    const { data: questions, error } = await getSupabase()
      .from('trivia_questions')
      .select('id, category, difficulty, question, options, correct_index, explanation')
      .eq('daily_date', today)
      .order('order_index', { ascending: true })
      .limit(100);

    if (error) console.warn('[trivia/daily] Database error:', error);

    const userStats = { totalPlayed: 0, bestScore: 0, currentStreak: 0 };

    const { data: leaderboard } = await getSupabase()
      .from('trivia_scores')
      .select('username, score')
      .eq('play_date', today)
      .order('score', { ascending: false })
      .limit(10);

    const finalQuestions = (questions && questions.length >= 10)
      ? questions
      : shuffleArray([...FALLBACK_QUESTIONS]).slice(0, 10);

    c.header('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return c.json({
      success: true,
      date: today,
      questions: finalQuestions,
      hasPlayedToday: false,
      todayScore: null,
      leaderboard: leaderboard || [],
      userStats,
    });
  } catch (error) {
    console.warn('[trivia/daily] Error:', error);
    return c.json({
      success: true,
      questions: shuffleArray([...FALLBACK_QUESTIONS]).slice(0, 10),
      hasPlayedToday: false,
      todayScore: null,
      leaderboard: [],
      userStats: { totalPlayed: 0, bestScore: 0, currentStreak: 0 },
    });
  }
});

// ─── POST /api/trivia/submit ──────────────────────────────────────────────
app.post('/submit', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { score, correctCount, xpEarned, totalQuestions } = body;

    if (typeof score !== 'number' || typeof correctCount !== 'number') {
      return c.json({ success: false, error: 'Invalid score data' }, 400);
    }

    const today = getTodayCST();

    // Optional auth: extract username via safe local-HMAC + fallback verifier.
    // Uses serverAuth.js (Phase 4.1d ESM-clean) — same pattern as venues/*.
    let username = 'Guest_' + Math.random().toString(36).substring(2, 8);
    const req = c.env?.req;
    if (req && c.req.header('authorization')?.startsWith('Bearer ')) {
      try {
        const supabase = getSupabase();
        const { user } = await getServerUserWithFallback(req, supabase);
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, full_name')
            .eq('id', user.id)
            .maybeSingle();
          username = profile?.username || profile?.full_name || user.email?.split('@')[0] || username;
        }
      } catch (e) {
        console.warn('[trivia/submit] auth lookup failed:', e?.message || e);
      }
    }

    const { error: insertError } = await getSupabase()
      .from('trivia_scores')
      .insert({
        username,
        score,
        correct_count: correctCount,
        total_questions: totalQuestions,
        xp_earned: xpEarned,
        play_date: today,
        created_at: new Date().toISOString(),
      });

    if (insertError) console.warn('[trivia/submit] Insert error:', insertError);

    const { data: leaderboard } = await getSupabase()
      .from('trivia_scores')
      .select('username, score')
      .eq('play_date', today)
      .order('score', { ascending: false })
      .limit(10);

    return c.json({
      success: true,
      message: 'Score saved successfully',
      score,
      xpEarned,
      leaderboard: leaderboard || [],
    });
  } catch (error) {
    console.warn('[trivia/submit] Error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── POST /api/trivia/render-gto-panel ────────────────────────────────────
// Generates AI GTO panel image via Grok, caches to Supabase storage.
// Auth: requires Bearer JWT (this is a paid AI inference endpoint).
app.post('/render-gto-panel', async (c) => {
  try {
    // Auth gate — Grok inference is expensive, must be authenticated.
    // Use safe local-HMAC + fallback (serverAuth.js, Phase 4.1d).
    const authHeader = c.req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    const req = c.env?.req;
    const supabaseAuthClient = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabaseAuthClient);
    if (!user) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const { question, correctAnswer, explanation, difficulty, category } = body;

    if (!question || !correctAnswer || !explanation) {
      return c.json({ error: 'Missing required fields: question, correctAnswer, explanation' }, 400);
    }

    // Cache key: hash of input → deterministic image lookup
    const cacheKey = crypto
      .createHash('sha256')
      .update(`${question}|${correctAnswer}|${explanation}|${difficulty}|${category}`)
      .digest('hex')
      .substring(0, 16);

    // Check cache first
    const supabase = getSupabase();
    const { data: cached } = await supabase
      .storage
      .from('trivia-gto-panels')
      .list('', { search: `${cacheKey}.png`, limit: 1 });

    if (cached && cached.length > 0) {
      const { data: { publicUrl } } = supabase
        .storage
        .from('trivia-gto-panels')
        .getPublicUrl(`${cacheKey}.png`);
      return c.json({ imageUrl: publicUrl, cached: true });
    }

    // Generate via Grok (lazy import to keep cold-start small)
    const grokApiKey = process.env.XAI_API_KEY;
    if (!grokApiKey) {
      return c.json({ error: 'AI image generation not configured' }, 503);
    }

    const grokRes = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${grokApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-2-image-1212',
        prompt: `Professional poker GTO analysis panel: ${question}. Correct answer: ${correctAnswer}. Explanation: ${explanation.substring(0, 200)}. Difficulty: ${difficulty}. Category: ${category}. Style: dark background, neon accents, clean typography, no text overlay.`,
        n: 1,
        size: '1024x1024',
      }),
    });

    if (!grokRes.ok) {
      const errBody = await grokRes.text();
      console.warn('[trivia/render-gto-panel] Grok error:', grokRes.status, errBody);
      return c.json({ error: 'Image generation failed' }, 502);
    }

    const grokData = await grokRes.json();
    const imageBase64 = grokData?.data?.[0]?.b64_json;
    if (!imageBase64) {
      return c.json({ error: 'No image returned from generation' }, 502);
    }

    // Upload to Supabase storage with cacheKey
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const { error: uploadError } = await supabase
      .storage
      .from('trivia-gto-panels')
      .upload(`${cacheKey}.png`, imageBuffer, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError && !uploadError.message?.includes('already exists')) {
      console.warn('[trivia/render-gto-panel] Upload error:', uploadError);
    }

    const { data: { publicUrl } } = supabase
      .storage
      .from('trivia-gto-panels')
      .getPublicUrl(`${cacheKey}.png`);

    return c.json({ imageUrl: publicUrl, cached: false });
  } catch (error) {
    console.warn('[trivia/render-gto-panel] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[trivia] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[trivia] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
