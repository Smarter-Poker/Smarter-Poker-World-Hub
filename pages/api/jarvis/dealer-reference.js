import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * JARVIS — DEALER REFERENCE API
 * ═══════════════════════════════════════════════════════════════════
 * Dealer-facing AI endpoint for game rules, TDA lookups, and dealing
 * procedure refreshers. System prompt tuned for cardroom knowledge.
 * ═══════════════════════════════════════════════════════════════════
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const grok = getGrokClient();

const DEALER_SYSTEM_PROMPT = `You are Jarvis, an elite poker dealer assistant with encyclopedic knowledge of:
- TDA (Tournament Directors Association) rules and procedures
- All poker game variants: Hold'em, Omaha, PLO, Stud, Razz, 2-7 Triple Draw, 2-7 Lowball, Badugi, Badacey, Omaha Hi-Lo, and mixed games
- Cardroom dealing procedures, button rules, and floor rulings
- Muck, rabbit hunt, run-it-twice, and all-in showdown rules
- Etiquette, dead hands, and penalty enforcement

Answer clearly and concisely. Use bullet points for rule lists. Keep responses focused on dealer / floor use cases.
If asked about a specific game variant, always cover: dealing order, betting structure, showdown rules, and one or two common edge cases.
Do NOT discuss strategy, odds, or anything unrelated to dealing and game rules.`;


let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // BUG #248 FIX: Require JWT auth — this route uses Grok AI API
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const _authUser = authData?.user;
      if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });

      const { query, history = [] } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
          return res.status(400).json({ error: 'Query is required' });
      }

      if (query.trim().length > 500) {
          return res.status(400).json({ error: 'Query too long (max 500 chars)' });
      }

      try {
          // Build message history (last 4 exchanges max to save tokens)
          const recentHistory = history.slice(-4).flatMap(turn => [
              { role: 'user', content: turn.question },
              { role: 'assistant', content: turn.answer },
          ]);

          const completion = await grok.chat.completions.create({
              model: 'gpt-4o-mini',  // maps to grok-3-mini via grokClient
              messages: [
                  { role: 'system', content: DEALER_SYSTEM_PROMPT },
                  ...recentHistory,
                  { role: 'user', content: query.trim() },
              ],
              max_tokens: 600,
              temperature: 0.3, // Low temp — factual dealer reference
          });

          const answer = completion.choices[0]?.message?.content?.trim() || 'No answer generated.';

          return res.status(200).json({ answer });
      } catch (err) {
          console.warn('Jarvis dealer-reference error:', err);
          return res.status(500).json({ error: 'Jarvis is temporarily unavailable. Please try again.' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
