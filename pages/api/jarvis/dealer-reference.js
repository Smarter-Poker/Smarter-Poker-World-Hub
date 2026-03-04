/**
 * JARVIS — DEALER REFERENCE API
 * ═══════════════════════════════════════════════════════════════════
 * Dealer-facing AI endpoint for game rules, TDA lookups, and dealing
 * procedure refreshers. System prompt tuned for cardroom knowledge.
 * ═══════════════════════════════════════════════════════════════════
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEALER_SYSTEM_PROMPT = `You are Jarvis, an elite poker dealer assistant with encyclopedic knowledge of:
- TDA (Tournament Directors Association) rules and procedures
- All poker game variants: Hold'em, Omaha, PLO, Stud, Razz, 2-7 Triple Draw, 2-7 Lowball, Badugi, Badacey, Omaha Hi-Lo, and mixed games
- Cardroom dealing procedures, button rules, and floor rulings
- Muck, rabbit hunt, run-it-twice, and all-in showdown rules
- Etiquette, dead hands, and penalty enforcement

Answer clearly and concisely. Use bullet points for rule lists. Keep responses focused on dealer / floor use cases.
If asked about a specific game variant, always cover: dealing order, betting structure, showdown rules, and one or two common edge cases.
Do NOT discuss strategy, odds, or anything unrelated to dealing and game rules.`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
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
        console.error('Jarvis dealer-reference error:', err);
        return res.status(500).json({ error: 'Jarvis is temporarily unavailable. Please try again.' });
    }
}
