/**
 * Phase 4.4 — Catch-all consolidation pilot for /api/sandbox/*
 *
 * Replaces the individual handler files with a single dispatcher.
 * Each sub-route's logic lives in pages/api/sandbox/_routes/<name>.js
 * (the underscore-prefix tells Pages Router to NOT compile it as its
 * own route).
 *
 * Per plan §4.4 — "Module by module, incrementally." Sandbox is the
 * pilot slice; pattern can extend to larger directories (training,
 * poker, club-arena, social, etc.) in follow-up commits.
 *
 * Bundle-size win: N lambdas → 1 lambda for /api/sandbox/*. Each
 * sub-handler still gets its own code path but Vercel's File Tracing
 * only walks node_modules once per lambda, not 11 times.
 */
import coachAccuracy from './_routes/coach-accuracy.js';
import coachResult from './_routes/coach-result.js';
import createShare from './_routes/create-share.js';
import customDrill from './_routes/custom-drill.js';
import equitySnapshot from './_routes/equity-snapshot.js';
import leaderboard from './_routes/leaderboard.js';
import macroAnalysis from './_routes/macro-analysis.js';
import quizLeaderboard from './_routes/quiz-leaderboard.js';
import saveHand from './_routes/save-hand.js';
import savedHands from './_routes/saved-hands.js';
import sessionStats from './_routes/session-stats.js';
import sessions from './_routes/sessions.js';
import socialExport from './_routes/social-export.js';

const ROUTES = {
  'coach-accuracy': coachAccuracy,
  'coach-result': coachResult,
  'create-share': createShare,
  'custom-drill': customDrill,
  'equity-snapshot': equitySnapshot,
  leaderboard,
  'macro-analysis': macroAnalysis,
  'quiz-leaderboard': quizLeaderboard,
  'save-hand': saveHand,
  'saved-hands': savedHands,
  'session-stats': sessionStats,
  sessions,
  'social-export': socialExport,
};

export default async function handler(req, res) {
  // Every /api/sandbox/* request funnels through here, so this is the last
  // place an unexpected throw can still become JSON. Without it, anything a
  // sub-handler throws OUTSIDE its own try/catch — or that this dispatcher
  // throws itself — reaches the client as Next's HTML 500 page, which every
  // caller on this surface then fails to parse as JSON ("Unexpected token <").
  try {
    const segments = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
    const route = segments[0] || '';
    const fn = ROUTES[route];
    if (!fn) return res.status(404).json({ success: false, error: 'Unknown sandbox route' });
    return await fn(req, res);
  } catch (err) {
    console.warn('[sandbox dispatcher] Unhandled error:', err?.message || err);
    // A sub-handler may already have started the response; never double-send.
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
    return undefined;
  }
}
