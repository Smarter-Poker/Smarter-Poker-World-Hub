/**
 * 🧠 JARVIS BANKROLL ANALYSIS API
 * ═══════════════════════════════════════════════════════════════════════════
 * AI-powered leak detection and personalized insights for bankroll management
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/ai/grokClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    try {
        // Fetch last 90 days of ledger entries
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { data: entries, error: entriesError } = await supabase
            .from('ledger_entries')
            .select('*')
            .eq('user_id', userId)
            .gte('entry_date', ninetyDaysAgo.toISOString().split('T')[0])
            .order('entry_date', { ascending: false });

        if (entriesError) {
            console.error('[Jarvis Bankroll] Error fetching entries:', entriesError);
            return res.status(500).json({ error: entriesError.message });
        }

        if (!entries || entries.length === 0) {
            return res.status(200).json({
                success: true,
                insights: {
                    summary: "No session data available for analysis.",
                    patterns: [],
                    recommendations: ["Start logging your sessions to get personalized insights!"],
                    riskLevel: 'unknown'
                }
            });
        }

        // Calculate key metrics for Jarvis
        const metrics = calculateMetrics(entries);

        // Generate AI insights using Grok
        const grokClient = getGrokClient();
        const prompt = buildAnalysisPrompt(metrics, entries);

        const completion = await grokClient.chat.completions.create({
            model: 'grok-3-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are Jarvis, a personal poker bankroll assistant. Analyze the player's financial data and provide actionable insights. Be direct, supportive, and data-driven. Use emojis sparingly for emphasis. Keep responses concise but insightful.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        const aiResponse = completion.choices[0]?.message?.content || '';

        // Parse AI response into structured insights
        const insights = parseAIResponse(aiResponse, metrics);

        return res.status(200).json({
            success: true,
            insights,
            metrics: {
                totalSessions: metrics.totalSessions,
                netPL: metrics.netPL,
                winRate: metrics.winRate,
                avgSession: metrics.avgSession
            }
        });

    } catch (error) {
        console.error('[Jarvis Bankroll] Server error:', error);
        return res.status(500).json({
            success: false,
            error: 'Analysis failed',
            insights: {
                summary: "Unable to complete analysis at this time.",
                patterns: [],
                recommendations: ["Try again later or check your connection."],
                riskLevel: 'unknown'
            }
        });
    }
}

function calculateMetrics(entries) {
    const sessionsByCategory = {};
    const sessionsByDay = {};
    const sessionsByHour = {};
    let totalIn = 0;
    let totalOut = 0;
    let winCount = 0;
    let lossCount = 0;
    let biggestWin = 0;
    let biggestLoss = 0;

    entries.forEach(entry => {
        const grossIn = entry.gross_in || 0;
        const grossOut = entry.gross_out || 0;
        const net = grossOut - grossIn;

        totalIn += grossIn;
        totalOut += grossOut;

        if (net > 0) winCount++;
        if (net < 0) lossCount++;

        if (net > biggestWin) biggestWin = net;
        if (net < biggestLoss) biggestLoss = net;

        // Category breakdown
        const cat = entry.category || 'other';
        if (!sessionsByCategory[cat]) {
            sessionsByCategory[cat] = { count: 0, netPL: 0 };
        }
        sessionsByCategory[cat].count++;
        sessionsByCategory[cat].netPL += net;

        // Day of week
        const date = new Date(entry.entry_date);
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
        if (!sessionsByDay[dayName]) {
            sessionsByDay[dayName] = { count: 0, netPL: 0 };
        }
        sessionsByDay[dayName].count++;
        sessionsByDay[dayName].netPL += net;

        // Hour (if start_time available)
        if (entry.start_time) {
            const hour = parseInt(entry.start_time.split(':')[0]);
            const timeSlot = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';
            if (!sessionsByHour[timeSlot]) {
                sessionsByHour[timeSlot] = { count: 0, netPL: 0 };
            }
            sessionsByHour[timeSlot].count++;
            sessionsByHour[timeSlot].netPL += net;
        }
    });

    const netPL = totalOut - totalIn;
    const totalSessions = entries.length;
    const winRate = totalSessions > 0 ? Math.round((winCount / totalSessions) * 100) : 0;
    const avgSession = totalSessions > 0 ? Math.round(netPL / totalSessions) : 0;

    // Find worst category/day
    let worstCategory = null;
    let worstCategoryLoss = 0;
    Object.entries(sessionsByCategory).forEach(([cat, data]) => {
        if (data.netPL < worstCategoryLoss && data.count >= 3) {
            worstCategory = cat;
            worstCategoryLoss = data.netPL;
        }
    });

    let worstDay = null;
    let worstDayLoss = 0;
    Object.entries(sessionsByDay).forEach(([day, data]) => {
        if (data.netPL < worstDayLoss && data.count >= 2) {
            worstDay = day;
            worstDayLoss = data.netPL;
        }
    });

    return {
        totalSessions,
        netPL,
        winRate,
        avgSession,
        winCount,
        lossCount,
        biggestWin,
        biggestLoss,
        sessionsByCategory,
        sessionsByDay,
        sessionsByHour,
        worstCategory,
        worstCategoryLoss,
        worstDay,
        worstDayLoss
    };
}

function buildAnalysisPrompt(metrics, entries) {
    const recentEntries = entries.slice(0, 10).map(e => ({
        date: e.entry_date,
        category: e.category,
        net: (e.gross_out || 0) - (e.gross_in || 0)
    }));

    return `
Analyze this player's bankroll data from the last 90 days:

Key Metrics:
- Total Sessions: ${metrics.totalSessions}
- Net P/L: $${metrics.netPL.toLocaleString()}
- Win Rate: ${metrics.winRate}%
- Average Session: $${metrics.avgSession}
- Biggest Win: $${metrics.biggestWin}
- Biggest Loss: $${Math.abs(metrics.biggestLoss)}

Category Breakdown:
${Object.entries(metrics.sessionsByCategory).map(([cat, data]) =>
        `- ${cat}: ${data.count} sessions, $${data.netPL > 0 ? '+' : ''}${data.netPL}`
    ).join('\n')}

Day Breakdown:
${Object.entries(metrics.sessionsByDay).map(([day, data]) =>
        `- ${day}: ${data.count} sessions, $${data.netPL > 0 ? '+' : ''}${data.netPL}`
    ).join('\n')}

Recent Sessions:
${recentEntries.map(e => `- ${e.date} ${e.category}: $${e.net > 0 ? '+' : ''}${e.net}`).join('\n')}

${metrics.worstCategory ? `Worst Category: ${metrics.worstCategory} (down $${Math.abs(metrics.worstCategoryLoss)})` : ''}
${metrics.worstDay ? `Worst Day: ${metrics.worstDay} (down $${Math.abs(metrics.worstDayLoss)})` : ''}

Provide a brief analysis with:
1. One sentence summary of their current state
2. 2-3 pattern observations (good or bad)
3. 2-3 actionable recommendations
4. Overall risk assessment (low/medium/high)

Format your response as:
SUMMARY: [one sentence]
PATTERNS:
- [pattern 1]
- [pattern 2]
RECOMMENDATIONS:
- [rec 1]
- [rec 2]
RISK: [low/medium/high]
`;
}

function parseAIResponse(response, metrics) {
    const lines = response.split('\n').filter(l => l.trim());

    let summary = '';
    let patterns = [];
    let recommendations = [];
    let riskLevel = 'medium';

    let currentSection = '';

    lines.forEach(line => {
        const trimmed = line.trim();

        if (trimmed.startsWith('SUMMARY:')) {
            summary = trimmed.replace('SUMMARY:', '').trim();
        } else if (trimmed === 'PATTERNS:') {
            currentSection = 'patterns';
        } else if (trimmed === 'RECOMMENDATIONS:') {
            currentSection = 'recommendations';
        } else if (trimmed.startsWith('RISK:')) {
            const risk = trimmed.replace('RISK:', '').trim().toLowerCase();
            if (['low', 'medium', 'high'].includes(risk)) {
                riskLevel = risk;
            }
        } else if (trimmed.startsWith('-') && currentSection === 'patterns') {
            patterns.push(trimmed.replace('-', '').trim());
        } else if (trimmed.startsWith('-') && currentSection === 'recommendations') {
            recommendations.push(trimmed.replace('-', '').trim());
        }
    });

    // Fallback if parsing failed
    if (!summary && response) {
        summary = response.slice(0, 150);
    }

    // Default recommendations if empty
    if (recommendations.length === 0) {
        if (metrics.netPL < 0) {
            recommendations.push("Review losing sessions for patterns");
            recommendations.push("Consider taking a break to reset mentally");
        } else {
            recommendations.push("Keep up the good work!");
            recommendations.push("Consider moving up in stakes gradually");
        }
    }

    return {
        summary,
        patterns,
        recommendations,
        riskLevel
    };
}
