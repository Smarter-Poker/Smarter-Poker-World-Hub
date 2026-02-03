/**
 * GTO Panel Image Renderer
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates GTO analysis images using a FIXED template with dynamic text.
 * The template layout and structure NEVER change - only the text content.
 *
 * POST /api/gto/render-analysis-card
 *
 * Returns: { imageUrl: "https://..." } - cached image in Supabase Storage
 */

import { createClient } from '@supabase/supabase-js';
import { createCanvas, loadImage, registerFont } from 'canvas';
import crypto from 'crypto';
import path from 'path';

// Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// LOCKED TEMPLATE CONFIGURATION - DO NOT MODIFY LAYOUT
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATE = {
    width: 800,
    height: 900,

    // Background colors (matching the template)
    background: {
        gradient: ['#0a1628', '#0d1f35', '#0a1628'],
        frameColor: '#1a3a5c',
        sectionBg: 'rgba(10, 25, 45, 0.9)',
    },

    // Header section (compact - 15% of height) - LOCKED LAYOUT
    // Jarvis TOP-LEFT corner, Action CENTERED, Badge TOP-RIGHT corner
    header: {
        y: 20,
        height: 80,
        avatar: { x: 25, y: 20, size: 50 },  // TOP-LEFT corner
        action: { x: 400, y: 50, fontSize: 36, font: 'bold' },  // CENTERED
        frequency: { x: 520, y: 50, fontSize: 20 },  // Next to action
        badge: { x: 620, y: 25, fontSize: 12 },  // TOP-RIGHT corner
    },

    // Content sections (85% of height)
    sections: {
        explanation: {
            y: 120,
            height: 180,
            titleY: 140,
            contentY: 165,
            contentHeight: 120,
        },
        gtoApproach: {
            y: 310,
            height: 140,
            titleY: 330,
            contentY: 355,
            contentHeight: 80,
        },
        evAnalysis: {
            y: 460,
            height: 160,
            titleY: 480,
            evValueY: 510,
            contentY: 560,
            contentHeight: 50,
        },
        alternateLines: {
            y: 630,
            height: 180,
            titleY: 650,
            line1Y: 680,
            line2Y: 730,
        },
    },

    // Typography
    fonts: {
        title: { size: 18, weight: 'bold', color: '#00d4ff' },
        content: { size: 14, weight: 'normal', color: '#c0d8e8' },
        action: { size: 36, weight: 'bold', color: '#00ff88' },
        ev: { size: 32, weight: 'bold', color: '#00ff88' },
    },

    // Section styling
    sectionPadding: 20,
    borderRadius: 12,
    borderColor: '#00d4ff40',
};

// Action colors
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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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

        // Generate cache key based on content
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

        // Generate the image
        const imageBuffer = await generateGTOPanelImage({
            action,
            frequency,
            explanation,
            gtoApproach,
            evValue,
            evDescription,
            alternateLines,
        });

        // Upload to Supabase Storage
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
 * Generate the GTO panel image with dynamic text on fixed template
 */
async function generateGTOPanelImage({
    action,
    frequency,
    explanation,
    gtoApproach,
    evValue,
    evDescription,
    alternateLines,
}) {
    const canvas = createCanvas(TEMPLATE.width, TEMPLATE.height);
    const ctx = canvas.getContext('2d');

    // Draw background with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, TEMPLATE.height);
    gradient.addColorStop(0, TEMPLATE.background.gradient[0]);
    gradient.addColorStop(0.5, TEMPLATE.background.gradient[1]);
    gradient.addColorStop(1, TEMPLATE.background.gradient[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, TEMPLATE.width, TEMPLATE.height);

    // Draw outer frame
    drawFrame(ctx, 10, 10, TEMPLATE.width - 20, TEMPLATE.height - 20);

    // Draw header section
    await drawHeader(ctx, action, frequency);

    // Draw content sections
    drawSection(ctx, 'EXPLANATION', TEMPLATE.sections.explanation, explanation);
    drawSection(ctx, 'GTO APPROACH', TEMPLATE.sections.gtoApproach, gtoApproach);
    drawEVSection(ctx, TEMPLATE.sections.evAnalysis, evValue, evDescription);
    drawAlternateLines(ctx, TEMPLATE.sections.alternateLines, alternateLines);

    return canvas.toBuffer('image/png');
}

/**
 * Draw the metallic frame border
 */
function drawFrame(ctx, x, y, width, height) {
    // Outer glow
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#00d4ff40';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 16);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner frame
    ctx.strokeStyle = '#1a4a6c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + 5, y + 5, width - 10, height - 10, 12);
    ctx.stroke();
}

/**
 * Draw the compact header with avatar, action, frequency, badge
 */
async function drawHeader(ctx, action, frequency) {
    const h = TEMPLATE.header;
    const actionColor = ACTION_COLORS[action.toUpperCase()] || '#00ff88';

    // Header background bar
    ctx.fillStyle = 'rgba(0, 40, 60, 0.8)';
    ctx.beginPath();
    ctx.roundRect(25, h.y, TEMPLATE.width - 50, h.height, 12);
    ctx.fill();

    // Draw Jarvis avatar placeholder (circle with glow)
    ctx.beginPath();
    ctx.arc(h.avatar.x + h.avatar.size / 2, h.avatar.y + h.avatar.size / 2, h.avatar.size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#0a2030';
    ctx.fill();

    // Avatar icon (simplified brain icon)
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('J', h.avatar.x + h.avatar.size / 2, h.avatar.y + h.avatar.size / 2 + 8);

    // Action text (RAISE, CALL, FOLD, etc.)
    ctx.fillStyle = actionColor;
    ctx.shadowColor = actionColor;
    ctx.shadowBlur = 10;
    ctx.font = `bold ${h.action.fontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillText(action.toUpperCase(), h.action.x, h.action.y + 15);
    ctx.shadowBlur = 0;

    // Frequency badge
    ctx.fillStyle = '#0a2a3a';
    ctx.beginPath();
    ctx.roundRect(h.frequency.x, h.frequency.y - 15, 60, 35, 17);
    ctx.fill();
    ctx.strokeStyle = actionColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = actionColor;
    ctx.font = `bold ${h.frequency.fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(`${frequency}%`, h.frequency.x + 30, h.frequency.y + 7);

    // Smarter Poker Data badge
    ctx.fillStyle = 'rgba(0, 80, 120, 0.6)';
    ctx.beginPath();
    ctx.roundRect(h.badge.x, h.badge.y, 150, 30, 15);
    ctx.fill();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#00d4ff';
    ctx.font = `bold ${h.badge.fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('Smarter Poker Data', h.badge.x + 75, h.badge.y + 20);
}

/**
 * Draw a content section with title and wrapped text
 */
function drawSection(ctx, title, config, content) {
    const x = 25;
    const width = TEMPLATE.width - 50;

    // Section background
    ctx.fillStyle = 'rgba(10, 30, 50, 0.9)';
    ctx.beginPath();
    ctx.roundRect(x, config.y, width, config.height, 10);
    ctx.fill();
    ctx.strokeStyle = '#00d4ff30';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Section title with icon
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    const icon = title === 'EXPLANATION' ? 'i' : (title === 'GTO APPROACH' ? '◎' : '$');
    ctx.fillText(`${icon}  ${title}`, x + 15, config.titleY);

    // Content text (wrapped)
    ctx.fillStyle = '#c0d8e8';
    ctx.font = '14px Arial';
    wrapText(ctx, content, x + 15, config.contentY, width - 30, 20);
}

/**
 * Draw EV Analysis section
 */
function drawEVSection(ctx, config, evValue, description) {
    const x = 25;
    const width = TEMPLATE.width - 50;

    // Section background
    ctx.fillStyle = 'rgba(10, 30, 50, 0.9)';
    ctx.beginPath();
    ctx.roundRect(x, config.y, width, config.height, 10);
    ctx.fill();
    ctx.strokeStyle = '#00d4ff30';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Title
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('$  EV ANALYSIS', x + 15, config.titleY);

    // EV Value (big green number)
    const evColor = evValue.startsWith('+') ? '#00ff88' : '#ff4444';
    ctx.fillStyle = evColor;
    ctx.shadowColor = evColor;
    ctx.shadowBlur = 8;
    ctx.font = 'bold 32px Arial';
    ctx.fillText(evValue, x + 15, config.evValueY);
    ctx.shadowBlur = 0;

    // Description
    ctx.fillStyle = '#c0d8e8';
    ctx.font = '14px Arial';
    wrapText(ctx, description, x + 15, config.contentY, width - 30, 18);
}

/**
 * Draw Alternate Lines section
 */
function drawAlternateLines(ctx, config, lines) {
    const x = 25;
    const width = TEMPLATE.width - 50;

    // Section background
    ctx.fillStyle = 'rgba(10, 30, 50, 0.9)';
    ctx.beginPath();
    ctx.roundRect(x, config.y, width, config.height, 10);
    ctx.fill();
    ctx.strokeStyle = '#00d4ff30';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Title
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`⑂  ${lines.length || 2} ALTERNATE LINES`, x + 15, config.titleY);

    // Draw each alternate line
    const linePositions = [config.line1Y, config.line2Y];

    lines.slice(0, 2).forEach((line, idx) => {
        const y = linePositions[idx];
        const color = ACTION_COLORS[line.action?.toUpperCase()] || '#ffaa00';

        // Colored dot
        ctx.beginPath();
        ctx.arc(x + 25, y + 5, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Action and frequency
        ctx.fillStyle = color;
        ctx.font = 'bold 14px Arial';
        ctx.fillText(line.action?.toUpperCase() || 'CALL', x + 40, y + 10);

        ctx.fillStyle = '#ffaa00';
        ctx.font = '14px Arial';
        ctx.fillText(`${line.frequencyPct || line.frequency || '10%'} frequency`, x + 100, y + 10);

        // Reason
        ctx.fillStyle = '#8899aa';
        ctx.font = '12px Arial';
        ctx.fillText(line.reason || '', x + 220, y + 10);
    });
}

/**
 * Wrap text to fit within width
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    if (!text) return;

    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (const word of words) {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && line !== '') {
            ctx.fillText(line.trim(), x, currentY);
            line = word + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line.trim(), x, currentY);
}

/**
 * Generate cache key from content
 */
function generateCacheKey(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return `gto-panel-${hash.digest('hex').substring(0, 16)}`;
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

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '1mb',
        },
    },
};
