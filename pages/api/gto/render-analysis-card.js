/**
 * GTO Panel Image Generator - Using Grok AI
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates GTO analysis panel images using Grok AI image generation.
 * Images are uploaded directly to Supabase storage.
 * 
 * The template is LOCKED - only the dynamic text fields change.
 *
 * POST /api/gto/render-analysis-card
 *
 * Returns: { imageUrl: "https://..." } - image stored in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

// Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Action colors for prompt
const ACTION_COLORS = {
    'FOLD': 'red',
    'CHECK': 'gray',
    'CALL': 'yellow/orange',
    'BET': 'cyan',
    'RAISE': 'green neon',
    '3-BET': 'green neon',
    '4-BET': 'purple',
    'ALL-IN': 'magenta',
};

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // BUG #267 FIX: Require JWT auth — calls paid Grok AI image generation API
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ error: 'Invalid token' });

    try {
        const {
            action = 'RAISE',
            frequency = 85,
            explanation = '',
            gtoApproach = '',
            evValue = '+1.50bb',
            evDescription = '',
            alternateLines = [],
        } = req.body;

        // Generate cache key
        const cacheKey = generateCacheKey({
            action, frequency, explanation, gtoApproach,
            evValue, evDescription, alternateLines,
        });

        // Check if image already exists in storage
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
            explanation,
            gtoApproach,
            evValue,
            evDescription,
            alternateLines,
        });

        // Upload directly to Supabase storage
        const imageUrl = await uploadToStorage(cacheKey, imageBuffer);

        return res.status(200).json({
            success: true,
            imageUrl,
            fromCache: false,
        });

    } catch (error) {
        console.error('[GTO-Render] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
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
    evDescription,
    alternateLines,
}) {
    const actionColor = ACTION_COLORS[action?.toUpperCase()] || 'green neon';
    const evColor = evValue?.startsWith('+') ? 'green' : 'red';

    // Build the LOCKED template prompt with dynamic data
    const prompt = `Create a poker GTO analysis panel with EXACT futuristic metal styling:

FRAME: Dark navy/black gradient background with beveled metallic silver-gray frame. Rounded corners with cyan accent lights at bottom. Tech aesthetic like Iron Man HUD.

HEADER SECTION:
- TOP LEFT: Jarvis humanoid AI avatar (cyan glowing robot face in circular frame) with "JARVIS" label below
- CENTER: Large "${action?.toUpperCase()}" text in ${actionColor} with glow effect, next to "${frequency}%" badge
- TOP RIGHT: "Smarter Poker Data" badge in cyan

CONTENT SECTIONS (4 metal-framed cards with dark backgrounds):

1. EXPLANATION SECTION:
- Header: "ⓘ Explanation" with arrow icon
- Text: "${explanation}"
- Highlight key terms like "${action?.toUpperCase()}", "GTO action", "Expected Value (EV)" in cyan/green

2. GTO APPROACH SECTION:
- Header: "⚙ GTO Approach" with arrow icon  
- Text: "${gtoApproach}"
- Highlight "balanced range" in cyan

3. EV ANALYSIS SECTION:
- Header: "$ EV Analysis" with arrow icon
- Large "${evValue}" in ${evColor} with glow
- Text: "${evDescription}"
- Highlight "expected value", "+1.50 big blinds", "pot equity" in cyan/green

4. ALTERNATE LINES SECTION:
- Header: "Y 2 Alternate Lines" with arrow icon
${alternateLines.map((line, i) => `- ${i === 0 ? 'Yellow' : 'Red'} dot: "${line.action?.toUpperCase()}" ${line.frequency || line.frequencyPct} frequency - "${line.reason}"`).join('\n')}

Style: Premium, futuristic, metal-framed UI. Like a high-tech poker solver interface. No plain/basic styling.`;

    // Call Grok image generation API
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

    if (!data.data || !data.data[0] || !data.data[0].b64_json) {
        throw new Error('Invalid response from Grok API');
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(data.data[0].b64_json, 'base64');
    return imageBuffer;
}

/**
 * Generate cache key from content
 */
function generateCacheKey(data) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return `gto-panel-${hash.digest('hex').substring(0, 16)}`;
}

/**
 * Check if image exists in cache/storage
 */
async function checkCachedImage(cacheKey) {
    try {
        const { data } = supabase.storage
            .from('gto-panels')
            .getPublicUrl(`${cacheKey}.png`);

        // Verify the file actually exists
        const response = await fetch(data.publicUrl, { method: 'HEAD' });
        if (response.ok) {
            return data.publicUrl;
        }
    } catch (error) {
        // File doesn't exist, continue to generate
    }
    return null;
}

/**
 * Upload image to Supabase Storage
 */
async function uploadToStorage(cacheKey, buffer) {
    const { data, error } = await supabase.storage
        .from('gto-panels')
        .upload(`${cacheKey}.png`, buffer, {
            contentType: 'image/png',
            upsert: true,
        });

    if (error) {
        console.error('[GTO-Render] Upload error:', error);
        throw error;
    }

    const { data: urlData } = supabase.storage
        .from('gto-panels')
        .getPublicUrl(`${cacheKey}.png`);

    return urlData.publicUrl;
}
