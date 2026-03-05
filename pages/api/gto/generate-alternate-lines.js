/**
 * Generate Alternate Lines (Coaching - NOT GTO)
 * 
 * Uses Grok to generate EXPLOIT and SIMPLIFY coaching suggestions
 * for poker scenarios. No fake solver frequencies - just practical
 * coaching advice with "when to use" guidance.
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const _supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // BUG #267 FIX: Require JWT auth — calls paid Grok API
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { data: { user: authUser }, error: authErr } = await _supabase.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { scenario } = req.body;

    if (!scenario) {
        return res.status(400).json({ success: false, error: 'Missing scenario data' });
    }

    try {
        const alternateLines = await generateAlternateLines(scenario);
        return res.status(200).json({
            success: true,
            alternate_lines: alternateLines
        });
    } catch (error) {
        console.error('Alternate lines generation error:', error);
        return res.status(500).json({
            success: false, error: 'Failed to generate alternate lines',
            details: error.message
        });
    }
}

async function generateAlternateLines(scenario) {
    const XAI_API_KEY = process.env.XAI_API_KEY;

    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY not configured');
    }

    // Build the input contract for Grok
    const grokInput = {
        hand_context: {
            game: scenario.gameType || 'Cash',
            format: scenario.format || '6-max',
            position: scenario.position || 'UTG',
            hand: scenario.hand || 'AA',
            stack_bb: scenario.stackBb || 100,
            action_so_far: scenario.actionSoFar || 'First to act preflop'
        },
        solver_anchor: {
            recommended_action: scenario.gtoAction || 'RAISE',
            recommended_frequency: scenario.gtoFrequency || 100,
            reason_summary: scenario.gtoReason || 'Premium hand, pure value raise'
        },
        constraints: {
            allowed_actions: scenario.allowedActions || ['RAISE', 'CALL', 'FOLD'],
            pool_assumptions: scenario.poolAssumptions || 'Standard online pool'
        }
    };

    // Calculate what percentage is left for alternate plays
    const mainFrequency = scenario.gtoFrequency || 100;
    const remainingFrequency = 100 - mainFrequency;

    const systemPrompt = `You are generating Alternate Plays for a poker training scenario.

CRITICAL RULES:
1. Alternate Plays are COACHING suggestions, NOT GTO or solver-derived
2. You MUST NOT invent fake EV numbers or pretend these are solver outputs
3. You MAY propose exploit/simplification lines based on player-pool tendencies
4. Keep advice concise and actionable
5. The main GTO action is ${grokInput.solver_anchor.recommended_action} at ${mainFrequency}%
${remainingFrequency > 0 ? `6. The remaining ${remainingFrequency}% can be split among alternate lines` : '6. Since main action is 100%, alternates are for EXPLOITATIVE/SIMPLIFY coaching only - no frequencies'}

OUTPUT FORMAT (JSON only):
{
  "alternate_lines": [
    {
      "category": "EXPLOIT" or "SIMPLIFY",
      "action": "string (the action like CALL, FOLD, larger sizing, etc.)",
      ${remainingFrequency > 0 ? '"frequency": number (percentage of the remaining freq to allocate),' : ''}
      "description": "short coaching tip (max 15 words)",
      "when_to_use": "brief condition when this makes sense",
      "risk": "brief downside if misapplied"
    }
  ],
  "disclaimer": "Alternate Plays are coaching options, not solver-derived GTO lines."
}

Provide exactly 2 alternate lines: one EXPLOIT and one SIMPLIFY.`;

    const userPrompt = `Generate alternate plays for this scenario:

Hand Context:
- Game: ${grokInput.hand_context.game} ${grokInput.hand_context.format}
- Position: ${grokInput.hand_context.position}
- Hand: ${grokInput.hand_context.hand}
- Stack: ${grokInput.hand_context.stack_bb}bb
- Action: ${grokInput.hand_context.action_so_far}

Solver Anchor:
- GTO Action: ${grokInput.solver_anchor.recommended_action} (${mainFrequency}%)
- Reason: ${grokInput.solver_anchor.reason_summary}

Pool Assumptions: ${grokInput.constraints.pool_assumptions}

Return JSON only.`;

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${XAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'grok-3-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 500
        })
    });

    if (!response.ok) {
        throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error('Empty response from Grok');
    }

    // Parse JSON from response (handle markdown code blocks)
    let parsed;
    try {
        const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
            content.match(/```\n?([\s\S]*?)\n?```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : content;
        parsed = JSON.parse(jsonStr.trim());
    } catch (e) {
        console.error('Failed to parse Grok response:', content);
        throw new Error('Invalid JSON from Grok');
    }

    return {
        lines: parsed.alternate_lines || [],
        disclaimer: parsed.disclaimer || 'Coaching suggestions, not GTO.',
        mainAction: grokInput.solver_anchor.recommended_action,
        mainFrequency: mainFrequency,
        generatedAt: new Date().toISOString()
    };
}
