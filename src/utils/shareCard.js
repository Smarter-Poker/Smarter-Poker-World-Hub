/* ═══════════════════════════════════════════════════════════════════════════
   📤 SHARE CARD GENERATOR — Canvas-based shareable result cards
   Creates a PNG image from game results for social sharing
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Generate a shareable result card as a PNG blob
 * @param {Object} opts - Card options
 * @param {string} opts.gameTitle - e.g. "SPEED DRILL", "VS RANKED"
 * @param {string} opts.grade - S/A/B/C/D
 * @param {number} opts.score - Primary score value
 * @param {string} opts.scoreLabel - e.g. "SCORE", "ACCURACY"
 * @param {Array} opts.stats - Array of { label, value } stat pairs
 * @param {string} opts.color - Theme color hex
 * @param {string} [opts.subtitle] - Optional subtitle text
 * @returns {Promise<Blob|null>}
 */
export async function generateShareCard({
    gameTitle,
    grade,
    score,
    scoreLabel = 'SCORE',
    stats = [],
    color = '#00D4FF',
    subtitle,
}) {
    if (typeof document === 'undefined') return null;

    const W = 600;
    const H = 400;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a0e1a');
    bg.addColorStop(1, '#131833');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Accent glow
    ctx.save();
    ctx.globalAlpha = 0.08;
    const glow = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, 250);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Border
    ctx.strokeStyle = `${color}44`;
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, W - 16, H - 16);

    // Branding
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SMARTER.POKER', 24, 36);

    // Game title
    ctx.fillStyle = color;
    ctx.font = '800 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(gameTitle.toUpperCase(), W - 24, 36);

    // Grade circle
    const GRADE_COLORS = { S: '#FFD700', A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' };
    const gc = GRADE_COLORS[grade] || '#fff';

    ctx.beginPath();
    ctx.arc(W / 2, 120, 48, 0, Math.PI * 2);
    ctx.fillStyle = `${gc}15`;
    ctx.fill();
    ctx.strokeStyle = `${gc}66`;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = gc;
    ctx.font = '900 42px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(grade, W / 2, 122);

    // Score
    ctx.fillStyle = '#fff';
    ctx.font = '800 36px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${score}`, W / 2, 185);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '700 10px system-ui, -apple-system, sans-serif';
    ctx.fillText(scoreLabel.toUpperCase(), W / 2, 225);

    if (subtitle) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '600 12px system-ui, -apple-system, sans-serif';
        ctx.fillText(subtitle, W / 2, 242);
    }

    // Stats row
    if (stats.length > 0) {
        const statY = 275;
        const statW = (W - 80) / Math.min(stats.length, 4);
        const visibleStats = stats.slice(0, 4);

        visibleStats.forEach((stat, i) => {
            const x = 40 + statW * i + statW / 2;

            // Stat box background
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            const boxW = statW - 12;
            ctx.beginPath();
            ctx.roundRect(x - boxW / 2, statY - 8, boxW, 55, 8);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.font = '800 18px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`${stat.value}`, x, statY + 4);

            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = '600 9px system-ui, -apple-system, sans-serif';
            ctx.fillText(stat.label.toUpperCase(), x, statY + 30);
        });
    }

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '500 10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('smarter.poker \u2022 Master GTO Ranges', W / 2, H - 20);

    // Convert to blob
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
}

/**
 * Share or download the result card
 * Uses Web Share API if available, otherwise downloads
 */
export async function shareResult(cardOpts) {
    try {
        const blob = await generateShareCard(cardOpts);
        if (!blob) return;

        const file = new File([blob], 'smarter-poker-result.png', { type: 'image/png' });

        // Try native share first
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: `${cardOpts.gameTitle} - Grade ${cardOpts.grade}`,
                text: `I scored ${cardOpts.score} on ${cardOpts.gameTitle}! Can you beat me?`,
                files: [file],
            });
            return;
        }

        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'smarter-poker-result.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.warn('[ShareCard] Share failed:', e);
        }
    }
}

/**
 * Save personal best for a game mode to localStorage
 * Only updates if the new score is higher than the stored one
 * @param {string} gameMode - e.g. 'speed-drill', 'pressure-cooker'
 * @param {number} score - The score to potentially save
 * @param {string} grade - S/A/B/C/D
 */
export function savePersonalBest(gameMode, score, grade) {
    if (typeof window === 'undefined') return;
    try {
        const key = `pb_${gameMode}`;
        const existing = JSON.parse(localStorage.getItem(key) || 'null');
        const plays = (existing?.plays || 0) + 1;
        if (!existing || score > existing.score) {
            localStorage.setItem(key, JSON.stringify({ score, grade, plays, updatedAt: Date.now() }));
        } else {
            // Still increment plays count
            localStorage.setItem(key, JSON.stringify({ ...existing, plays }));
        }
    } catch (e) {
        console.warn('[PersonalBest] Save failed:', e);
    }
}

/**
 * Get a coaching tip based on grade and game mode
 */
const COACHING_TIPS = {
    S: [
        'Elite-level play. You\'re operating at GTO precision.',
        'Flawless execution. Time to raise the stakes and push harder.',
        'Near-perfect. Try a harder difficulty or faster speed next.',
    ],
    A: [
        'Strong fundamentals. Tighten up marginal spots to reach S-tier.',
        'Great session! Focus on the spots you missed to break through.',
        'You\'re close to mastery. Review your weakest positions.',
    ],
    B: [
        'Solid base. Drill the positions you\'re weakest on individually.',
        'Good progress. Pay attention to how position changes optimal ranges.',
        'Getting there. Try slowing down to build accuracy before speed.',
    ],
    C: [
        'Focus on memorizing core opening ranges before mixed spots.',
        'Study one position at a time \u2014 mastery comes from depth, not breadth.',
        'Try the easier levels first to build a strong foundation.',
    ],
    D: [
        'Start with the fundamentals: EP is tight, LP is wide, blinds defend.',
        'Review the basic range charts before speed-running drills.',
        'No worries \u2014 every GTO master started where you are. Keep grinding!',
    ],
};

export function getCoachingTip(grade) {
    const tips = COACHING_TIPS[grade] || COACHING_TIPS.C;
    return tips[Math.floor(Math.random() * tips.length)];
}
