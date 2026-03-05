/**
 * Jarvis Post-Game Analysis API
 * 
 * Analyzes all mistakes from a completed game session and provides
 * a comprehensive breakdown with learning recommendations.
 * 
 * POST /api/gto/analyze-game
 * Body: { mistakes, scenario, finalScore, position, stackDepth }
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { getCachedResponse, setCachedResponse } from '../../../src/lib/jarvisCache';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  // BUG #244 FIX: Require JWT auth — these routes use paid AI APIs
  const { createClient: _createAuthClient } = await import('@supabase/supabase-js');
  const _authSupa = _createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const _token = req.headers.authorization?.replace('Bearer ', '');
  if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
  const { data: { user: _authUser }, error: _authErr } = await _authSupa.auth.getUser(_token);
  if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const {
            mistakes,       // Array of { hand, userAction, correctAction }
            scenario,       // The scenario played
            finalScore,     // User's score 0-100
            position,       // e.g., "CO"
            stackDepth      // e.g., 100
        } = req.body;

        if (!mistakes || mistakes.length === 0) {
            return res.status(200).json({
                success: true,
                analysis: {
                    summary: "Perfect game! No mistakes to analyze.",
                    recommendations: ["Keep practicing to maintain your edge!"],
                    patternInsights: []
                }
            });
        }

        // Create cache key from sorted mistakes
        const sortedMistakes = mistakes.map(m => `${m.hand}:${m.userAction}`).sort().join('|');
        const cacheParams = {
            mistakesHash: sortedMistakes,
            scenarioTitle: scenario?.title,
            position,
            stackDepth
        };

        const cached = await getCachedResponse('analyze-game', cacheParams);
        if (cached) {
            return res.status(200).json({
                ...cached,
                fromCache: true
            });
        }

        const prompt = buildAnalysisPrompt(mistakes, scenario, finalScore, position, stackDepth);

        const grok = getGrokClient();
        const completion = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are Jarvis, an elite GTO poker coach providing post-game analysis.
                    Be encouraging but direct. Focus on patterns and actionable improvements.
                    Format your response as JSON with: summary, patternInsights[], recommendations[].
                    Keep insights concise (max 2 sentences each). Max 3 recommendations.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.5,
            max_tokens: 800,
        });

        const responseText = completion.choices[0]?.message?.content;

        if (!responseText) {
            throw new Error('Empty response from Jarvis');
        }

        // Parse JSON response
        let analysis;
        try {
            const cleanedResponse = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            analysis = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('[AnalyzeGame] Parse error, using raw text');
            analysis = {
                summary: responseText.slice(0, 200),
                patternInsights: [],
                recommendations: ["Review your range construction"]
            };
        }

        const response = {
            success: true,
            analysis,
            meta: {
                mistakeCount: mistakes.length,
                score: finalScore,
                generatedAt: new Date().toISOString(),
            }
        };

        // Cache the response
        await setCachedResponse('analyze-game', cacheParams, response, 30);

        return res.status(200).json(response);

    } catch (error) {
        console.error('[AnalyzeGame] Error:', error);

        // Graceful fallback
        const mistakeCount = req.body?.mistakes?.length || 0;
        return res.status(200).json({
            success: true,
            analysis: {
                summary: `You made ${mistakeCount} mistake${mistakeCount !== 1 ? 's' : ''} this game. ${getEncouragement(req.body?.finalScore)}`,
                patternInsights: [
                    { pattern: "Range Construction", insight: "Focus on memorizing starting ranges by position." }
                ],
                recommendations: [
                    "Practice this scenario again to reinforce the correct plays",
                    "Review the hands you missed most frequently"
                ]
            },
            fallback: true,
            meta: {
                mistakeCount,
                score: req.body?.finalScore,
                generatedAt: new Date().toISOString(),
            }
        });
    }
}

function buildAnalysisPrompt(mistakes, scenario, finalScore, position, stackDepth) {
    const mistakesList = mistakes.map((m, i) =>
        `${i + 1}. ${m.hand}: Chose ${m.userAction?.toUpperCase() || 'FOLD'}, should be ${m.correctAction?.toUpperCase()}`
    ).join('\n');

    return `Analyze this poker training session:

SCENARIO: ${scenario?.title || 'Range Training'}
Position: ${position || 'Unknown'}
Stack Depth: ${stackDepth || 100}bb
Final Score: ${finalScore}%

MISTAKES MADE (${mistakes.length} total):
${mistakesList}

Provide analysis in this JSON format:
{
    "summary": "2-3 sentence overview of their performance and main issue",
    "patternInsights": [
        { "pattern": "Pattern name", "insight": "Specific observation about their mistakes" }
    ],
    "recommendations": [
        "Actionable improvement tip 1",
        "Actionable improvement tip 2"  
    ]
}

Focus on:
- Patterns in their mistakes (e.g., folding too many suited connectors, missing 3-bet opportunities)
- Position-specific issues
- Actionable study recommendations

Be encouraging but analytical. Return ONLY valid JSON.`;
}

function getEncouragement(score) {
    if (score >= 80) return "Almost perfect! Just a few spots to polish.";
    if (score >= 60) return "Good foundation - let's tighten up some spots.";
    if (score >= 40) return "Solid effort! Focus on the patterns in your mistakes.";
    return "Great learning opportunity! Every mistake is a lesson.";
}
