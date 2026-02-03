/**
 * GTO Panel Image Renderer - Using @vercel/og
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates GTO analysis images using a FIXED template with dynamic text.
 * The template layout and structure NEVER change - only the text content.
 *
 * Uses @vercel/og for Vercel Edge-optimized image generation with proper fonts.
 *
 * POST /api/gto/render-analysis-card
 *
 * Returns: { imageUrl: "https://..." } - cached image in Supabase Storage
 */

import { ImageResponse } from '@vercel/og';
import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Web Crypto API hash function for Edge runtime
async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Action colors - LOCKED
const ACTION_COLORS = {
    'FOLD': '#ff4444',
    'CHECK': '#888888',
    'CALL': '#ffaa00',
    'BET': '#00d4ff',
    'RAISE': '#00ff88',
    '3-BET': '#00ff88',
    '4-BET': '#aa44ff',
    'ALL-IN': '#ff00ff',
};

export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const body = await req.json();
        const {
            action = 'RAISE',
            frequency = 85,
            explanation = '',
            gtoApproach = '',
            evValue = '+1.50bb',
            evDescription = '',
            alternateLines = [],
        } = body;

        // Generate cache key based on content
        const cacheKey = await generateCacheKey({
            action, frequency, explanation, gtoApproach,
            evValue, evDescription, alternateLines,
        });

        // Check if image already exists in storage
        const existingUrl = await checkCachedImage(cacheKey);
        if (existingUrl) {
            return new Response(JSON.stringify({
                success: true,
                imageUrl: existingUrl,
                fromCache: true,
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Generate the image using @vercel/og
        const imageResponse = new ImageResponse(
            generateGTOPanel({
                action,
                frequency,
                explanation,
                gtoApproach,
                evValue,
                evDescription,
                alternateLines,
            }),
            {
                width: 800,
                height: 900,
            }
        );

        // Convert to buffer for upload
        const imageBuffer = await imageResponse.arrayBuffer();

        // Upload to Supabase Storage
        const imageUrl = await uploadToStorage(cacheKey, Buffer.from(imageBuffer));

        return new Response(JSON.stringify({
            success: true,
            imageUrl,
            fromCache: false,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('[GTO-Render] Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

/**
 * Generate the GTO Panel JSX - LOCKED LAYOUT
 * ═══════════════════════════════════════════════════════════════════════════
 * - Jarvis avatar: TOP-LEFT corner
 * - Action (RAISE/CALL/etc): CENTERED
 * - Smarter Poker Data badge: TOP-RIGHT corner
 * - 4 content sections (Explanation, GTO Approach, EV Analysis, Alternate Lines)
 */
function generateGTOPanel({
    action,
    frequency,
    explanation,
    gtoApproach,
    evValue,
    evDescription,
    alternateLines,
}) {
    const actionColor = ACTION_COLORS[action?.toUpperCase()] || '#00ff88';
    const evColor = evValue?.startsWith('+') ? '#00ff88' : '#ff4444';

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(180deg, #0a1628 0%, #0d1f35 50%, #0a1628 100%)',
                padding: '15px',
                fontFamily: 'Inter, system-ui, sans-serif',
            }}
        >
            {/* Outer Frame */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    height: '100%',
                    border: '2px solid #00d4ff40',
                    borderRadius: '16px',
                    padding: '10px',
                    boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
                }}
            >
                {/* HEADER - Compact with Jarvis left, Action center, Badge right */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(0, 40, 60, 0.8)',
                        borderRadius: '12px',
                        padding: '12px 20px',
                        marginBottom: '10px',
                    }}
                >
                    {/* Jarvis Avatar - TOP LEFT */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '50px',
                            height: '50px',
                            borderRadius: '50%',
                            border: '2px solid #00d4ff',
                            background: '#0a2030',
                            boxShadow: '0 0 10px rgba(0, 212, 255, 0.5)',
                        }}
                    >
                        <span style={{ color: '#00d4ff', fontSize: '24px', fontWeight: 'bold' }}>J</span>
                    </div>

                    {/* ACTION - CENTERED */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '8px 24px',
                                background: `linear-gradient(180deg, ${actionColor}20 0%, ${actionColor}10 100%)`,
                                border: `2px solid ${actionColor}`,
                                borderRadius: '8px',
                                boxShadow: `0 0 15px ${actionColor}60`,
                            }}
                        >
                            <span
                                style={{
                                    color: actionColor,
                                    fontSize: '32px',
                                    fontWeight: 'bold',
                                    textShadow: `0 0 10px ${actionColor}`,
                                }}
                            >
                                {action?.toUpperCase() || 'RAISE'}
                            </span>
                        </div>

                        {/* Frequency Badge */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '6px 16px',
                                background: '#0a2a3a',
                                border: `2px solid ${actionColor}`,
                                borderRadius: '20px',
                            }}
                        >
                            <span style={{ color: actionColor, fontSize: '18px', fontWeight: 'bold' }}>
                                {frequency}%
                            </span>
                        </div>
                    </div>

                    {/* Smarter Poker Data Badge - TOP RIGHT */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '6px 16px',
                            background: 'rgba(0, 80, 120, 0.6)',
                            border: '1px solid #00d4ff',
                            borderRadius: '15px',
                        }}
                    >
                        <span style={{ color: '#00d4ff', fontSize: '11px', fontWeight: 'bold' }}>
                            Smarter Poker Data
                        </span>
                    </div>
                </div>

                {/* CONTENT SECTIONS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    {/* EXPLANATION Section */}
                    <Section title="EXPLANATION" icon="ℹ️">
                        <p style={{ color: '#c0d8e8', fontSize: '13px', lineHeight: '1.5', margin: 0 }}>
                            {explanation || 'Analysis explanation will appear here.'}
                        </p>
                    </Section>

                    {/* GTO APPROACH Section */}
                    <Section title="GTO APPROACH" icon="◎">
                        <p style={{ color: '#c0d8e8', fontSize: '13px', lineHeight: '1.5', margin: 0 }}>
                            {gtoApproach || 'GTO strategy approach will appear here.'}
                        </p>
                    </Section>

                    {/* EV ANALYSIS Section */}
                    <Section title="EV ANALYSIS" icon="$">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span
                                style={{
                                    color: evColor,
                                    fontSize: '28px',
                                    fontWeight: 'bold',
                                    textShadow: `0 0 8px ${evColor}`,
                                }}
                            >
                                {evValue || '+0.00bb'}
                            </span>
                            <p style={{ color: '#c0d8e8', fontSize: '12px', lineHeight: '1.4', margin: 0 }}>
                                {evDescription || 'Expected value analysis.'}
                            </p>
                        </div>
                    </Section>

                    {/* ALTERNATE LINES Section */}
                    <Section title={`${alternateLines?.length || 2} ALTERNATE LINES`} icon="⑂">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {(alternateLines?.length > 0 ? alternateLines : [
                                { action: 'CALL', frequency: '10%', reason: 'Balanced with drawing hands' },
                                { action: 'FOLD', frequency: '5%', reason: 'Against extremely tight opponents' },
                            ]).slice(0, 2).map((line, idx) => {
                                const lineColor = ACTION_COLORS[line.action?.toUpperCase()] || '#ffaa00';
                                return (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {/* Colored dot */}
                                        <div
                                            style={{
                                                width: '12px',
                                                height: '12px',
                                                borderRadius: '50%',
                                                background: lineColor,
                                                boxShadow: `0 0 6px ${lineColor}`,
                                            }}
                                        />
                                        {/* Action */}
                                        <span style={{ color: lineColor, fontSize: '14px', fontWeight: 'bold', width: '50px' }}>
                                            {line.action?.toUpperCase() || 'CALL'}
                                        </span>
                                        {/* Frequency */}
                                        <span style={{ color: '#ffaa00', fontSize: '13px', width: '100px' }}>
                                            {line.frequencyPct || line.frequency || '10%'} frequency
                                        </span>
                                        {/* Reason */}
                                        <span style={{ color: '#8899aa', fontSize: '11px', flex: 1 }}>
                                            {line.reason || ''}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}

/**
 * Section component for content blocks
 */
function Section({ title, icon, children }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(10, 30, 50, 0.9)',
                border: '1px solid #00d4ff30',
                borderRadius: '10px',
                padding: '12px 15px',
            }}
        >
            {/* Section Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '14px' }}>{icon}</span>
                <span style={{ color: '#00d4ff', fontSize: '14px', fontWeight: 'bold' }}>{title}</span>
            </div>
            {/* Section Content */}
            {children}
        </div>
    );
}

/**
 * Generate cache key from content
 */
async function generateCacheKey(data) {
    const hash = await hashString(JSON.stringify(data));
    return `gto-panel-${hash.substring(0, 16)}`;
}

/**
 * Check if image exists in cache/storage
 */
async function checkCachedImage(cacheKey) {
    try {
        const { data } = await supabase.storage
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
