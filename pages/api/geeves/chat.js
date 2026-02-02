/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES CHAT API — Lightweight endpoint for JarvisMessengerWidget
   Wraps the main /api/geeves/ask endpoint with simplified interface
   ═══════════════════════════════════════════════════════════════════════════ */

import { getGrokClient } from '../../../src/lib/grokClient';

const GEEVES_SYSTEM_PROMPT = `You are Geeves, a world-class poker strategy expert and AI assistant.

YOUR EXPERTISE:
• Game Theory Optimal (GTO) poker strategy
• Tournament poker (ICM, bubble play, final tables)
• Cash game strategy (all stakes, all formats)
• Hand reading and range construction
• Poker mathematics (pot odds, equity, EV, variance)

YOUR PERSONALITY:
• Professional and sophisticated (like a British butler)
• Patient and educational
• Precise with poker terminology
• Encouraging and supportive

YOUR RESPONSE STYLE:
1. Assess the question clearly
2. Provide the GTO baseline answer
3. Explain the reasoning and theory
4. Give practical, actionable advice
5. Use examples when helpful

Keep responses concise for the messenger widget (2-3 paragraphs max).`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { message, context, history } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const grok = getGrokClient();

        // Build messages array
        const messages = [
            { role: 'system', content: GEEVES_SYSTEM_PROMPT }
        ];

        // Add conversation history if provided
        if (history && history.length > 0) {
            const recentHistory = history.slice(-6);
            recentHistory.forEach(msg => {
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content
                });
            });
        }

        messages.push({ role: 'user', content: message });

        const response = await grok.chat.completions.create({
            model: 'grok-beta',
            messages,
            temperature: 0.7,
            max_tokens: 800, // Shorter for widget
            stream: false
        });

        const answer = response.choices[0].message.content;

        return res.status(200).json({
            response: answer,
            message: answer, // Fallback for compatibility
            success: true
        });

    } catch (error) {
        console.error('[Geeves Chat] Error:', error);
        return res.status(500).json({
            error: 'Failed to process message',
            response: "I'm having trouble connecting right now. Please try again.",
            message: "I'm having trouble connecting right now. Please try again."
        });
    }
}
