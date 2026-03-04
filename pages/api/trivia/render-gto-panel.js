/**
 * Trivia GTO Panel Image Generator
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates premium GTO analysis panel images for trivia questions using Grok AI.
 * Images are cached in Supabase storage for reuse.
 * 
 * POST /api/trivia/render-gto-panel
 * 
 * Input: { question, correctAnswer, explanation, difficulty, category }
 * Returns: { imageUrl: "https://..." }
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Action colors for the panel
const ACTION_COLORS = {
    'FOLD': 'red',
    'CHECK': 'gray/blue',
    'CALL': 'yellow/amber',
    'BET': 'cyan',
    'RAISE': 'neon green',
    'SHOVE': 'magenta/purple',
    'ALL-IN': 'magenta/purple',
    '3-BET': 'neon green',
    '4-BET': 'purple',
    'OPTIMAL': 'cyan',
};

// Difficulty to confidence mapping
const DIFFICULTY_CONFIDENCE = {
    'easy': 92,
    'medium': 78,
    'hard': 85,
};

// Category-specific GTO approaches
const CATEGORY_APPROACHES = {
    'gto_theory': 'Solver-based strategy involves a balanced range construction with aggressive value betting on favorable textures.',
    'gto_scenarios': 'This line optimizes expected value against an equilibrium strategy while maintaining range balance.',
    'mtt_situations': 'In tournament play, ICM pressure and stack dynamics dictate optimal frequencies for this spot.',
    'cash_game_situations': 'Deep stack play requires careful consideration of implied odds and equity realization.',
    'icm_chip_ev': 'ICM calculations show significant risk premium here. The chip EV vs $EV differential requires frequency adjustments.',
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // BUG #268 FIX: Require JWT or admin auth — calls paid Grok API
    const adminSecret = req.headers['x-admin-secret'];
    const envSecret = process.env.ADMIN_ROUTE_SECRET;
    const hasAdminAuth = envSecret && adminSecret === envSecret;

    if (!hasAdminAuth) {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Authentication required' });
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });
    }

    try {
        const {
            question,
            correctAnswer,
            explanation,
            difficulty = 'medium',
            category = 'gto_theory',
            options = [],
            correctIndex = 0,
        } = req.body;

        // Extract action from correct answer
        const action = extractAction(correctAnswer);
        const frequency = DIFFICULTY_CONFIDENCE[difficulty] || 78;
        const gtoApproach = CATEGORY_APPROACHES[category] || CATEGORY_APPROACHES['gto_theory'];

        // Generate EV value based on difficulty
        const evValue = difficulty === 'hard' ? '+1.75bb' : difficulty === 'medium' ? '+1.25bb' : '+0.85bb';

        // Generate alternate lines from other options
        const alternateLines = options
            .filter((_, i) => i !== correctIndex)
            .slice(0, 2)
            .map((opt, i) => ({
                action: extractAction(opt),
                frequency: i === 0 ? '15%' : '5%',
                reason: i === 0
                    ? 'Mixed strategy for range balance'
                    : 'Against extremely tight opponents',
            }));

        // Generate cache key
        const cacheKey = generateCacheKey({
            action, frequency, explanation, category,
        });

        // Check if image exists in cache
        const existingUrl = await checkCachedImage(cacheKey);
        if (existingUrl) {
            return res.status(200).json({
                success: true,
                imageUrl: existingUrl,
                fromCache: true,
            });
        }

        // Generate image using Grok AI
        const imageBuffer = await generateWithGrok({
            action,
            frequency,
            explanation: explanation || 'This is the optimal GTO play in this situation.',
            gtoApproach,
            evValue,
            alternateLines,
            category,
        });

        // Upload to Supabase storage
        const imageUrl = await uploadToStorage(cacheKey, imageBuffer);

        return res.status(200).json({
            success: true,
            imageUrl,
            fromCache: false,
        });

    } catch (error) {
        console.error('[Trivia-GTO-Panel] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}

/**
 * Extract action keyword from answer text
 */
function extractAction(text) {
    if (!text) return 'OPTIMAL';
    const upper = text.toUpperCase();

    const actions = ['ALL-IN', 'SHOVE', '4-BET', '3-BET', 'RAISE', 'BET', 'CALL', 'CHECK', 'FOLD'];
    for (const action of actions) {
        if (upper.includes(action)) return action;
    }

    // Return first word as fallback
    return text.split(' ')[0]?.toUpperCase()?.slice(0, 8) || 'OPTIMAL';
}

/**
 * Generate GTO panel image using Grok AI
 */
async function generateWithGrok({
    action,
    frequency,
    explanation,
    gtoApproach,
    evValue,
    alternateLines,
    category,
}) {
    const actionColor = ACTION_COLORS[action] || 'neon green';

    const prompt = `Create a premium poker GTO analysis panel with futuristic metal styling:

DESIGN SPECIFICATIONS:
- Dark navy/black gradient background (#0a1628 to #1a2744)
- Metallic silver-gray beveled frame with rounded corners
- Cyan accent lights at bottom corners
- Tech aesthetic like Iron Man HUD interface

HEADER SECTION:
- TOP LEFT: Circular Jarvis AI avatar (cyan glowing humanoid robot face) with "JARVIS" label below
- CENTER: Large "${action}" text in ${actionColor} with glow effect, inside a pill-shaped badge
- RIGHT: "${frequency}%" in a circular meter
- TOP RIGHT CORNER: "Smarter Poker Data" badge in cyan

CONTENT SECTIONS (4 expandable metal-framed cards):

1. ⓘ EXPLANATION:
"${explanation.slice(0, 200)}"
Highlight "${action}" in ${actionColor}, "GTO" and "EV" terms in cyan

2. ⚙ GTO APPROACH:
"${gtoApproach}"
Highlight "balanced range" in cyan

3. $ EV ANALYSIS:
Large "${evValue}" in green with glow
"This action yields an expected value of ${evValue}, significantly higher than alternatives."

4. ↕ ALTERNATE LINES:
${alternateLines.map((line, i) => `• ${i === 0 ? 'Yellow' : 'Red'} dot: ${line.action} - ${line.frequency} - "${line.reason}"`).join('\n')}

STYLE: Premium, futuristic, metal-framed poker solver UI. High-tech dark theme. NO plain/basic styling.`;

    // Call Grok image generation
    const response = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'grok-2-image-1212',
            prompt: prompt,
            n: 1,
            response_format: 'b64_json',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.data?.[0]?.b64_json) {
        throw new Error('Invalid response from Grok API');
    }

    return Buffer.from(data.data[0].b64_json, 'base64');
}

/**
 * Generate cache key from content
 */
function generateCacheKey(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return `trivia-gto-${hash.digest('hex').substring(0, 16)}`;
}

/**
 * Check if image exists in cache
 */
async function checkCachedImage(cacheKey) {
    try {
        const { data } = supabase.storage
            .from('gto-panels')
            .getPublicUrl(`${cacheKey}.png`);

        const response = await fetch(data.publicUrl, { method: 'HEAD' });
        if (response.ok) {
            return data.publicUrl;
        }
    } catch (error) {
        // Not cached
    }
    return null;
}

/**
 * Upload image to Supabase Storage
 */
async function uploadToStorage(cacheKey, buffer) {
    const { error } = await supabase.storage
        .from('gto-panels')
        .upload(`${cacheKey}.png`, buffer, {
            contentType: 'image/png',
            upsert: true,
        });

    if (error) {
        console.error('[Trivia-GTO-Panel] Upload error:', error);
        throw error;
    }

    const { data: urlData } = supabase.storage
        .from('gto-panels')
        .getPublicUrl(`${cacheKey}.png`);

    return urlData.publicUrl;
}
