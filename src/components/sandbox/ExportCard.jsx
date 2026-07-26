/**
 * ExportCard — Branded analysis card for image export
 * ═══════════════════════════════════════════════════════════════
 * The card is rendered onto a <canvas> at export time (html2canvas is NOT a
 * dependency of this project), so the PNG never depends on an external
 * capture library. Failures surface to the user via toast.
 */
import { useCallback } from 'react';
import toast from 'react-hot-toast';

const C = {
    bgTop: '#0f172a', bgBottom: '#1e293b',
    text: '#E4E6EB', sub: '#94a3b8', dim: '#475569',
    cyan: '#4599FF', green: '#4ade80',
};

/** Naive word-wrap for canvas text. Returns the y after the last line. */
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let line = '';
    let lines = 0;
    for (let i = 0; i < words.length; i++) {
        const test = line ? `${line} ${words[i]}` : words[i];
        if (ctx.measureText(test).width > maxWidth && line) {
            ctx.fillText(line, x, y);
            y += lineHeight;
            lines++;
            line = words[i];
            if (lines >= maxLines) return y;
        } else {
            line = test;
        }
    }
    if (line) { ctx.fillText(line, x, y); y += lineHeight; }
    return y;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawCard(results, scenario) {
    const W = 800, H = 500;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const font = (size, weight = '400') => `${weight} ${size}px Inter, -apple-system, Helvetica, Arial, sans-serif`;

    // Background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, C.bgTop);
    grad.addColorStop(1, C.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.textAlign = 'left';
    ctx.fillStyle = C.text;
    ctx.font = font(34, '800');
    ctx.fillText('Smarter.Poker', 40, 66);
    ctx.fillStyle = C.dim;
    ctx.font = font(16);
    ctx.fillText('GTO Analysis', 40, 90);

    ctx.textAlign = 'right';
    ctx.fillStyle = C.cyan;
    ctx.font = font(16, '700');
    ctx.fillText('Virtual Sandbox', W - 40, 66);

    // Scenario block
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, 40, 120, W - 80, 92, 12);
    ctx.fill();
    ctx.fillStyle = C.sub;
    ctx.font = font(15, '600');
    ctx.fillText('SCENARIO', 60, 150);
    ctx.fillStyle = C.text;
    ctx.font = font(24, '700');
    ctx.fillText(
        `${scenario?.position || 'BTN'} — ${scenario?.hand || '??'} on ${scenario?.board || 'Preflop'}`,
        60, 186
    );

    // Result block
    ctx.fillStyle = 'rgba(34,197,94,0.10)';
    roundRect(ctx, 40, 232, W - 80, 112, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(34,197,94,0.35)';
    ctx.stroke();
    ctx.fillStyle = C.sub;
    ctx.font = font(15, '600');
    ctx.fillText('OPTIMAL ACTION', 60, 262);
    ctx.fillStyle = C.green;
    ctx.font = font(30, '800');
    ctx.fillText(String(results?.optimalAction?.label || 'N/A'), 60, 300);
    ctx.fillStyle = C.sub;
    ctx.font = font(15);
    const freq = results?.optimalAction?.frequency;
    ctx.fillText(
        `${freq != null ? `${freq}% frequency` : 'Frequency n/a'}   |   EV: ${results?.ev?.heroDisplay || 'N/A'}`,
        60, 328
    );

    // Explanation
    if (results?.explanation) {
        ctx.fillStyle = C.sub;
        ctx.font = font(15);
        wrapText(ctx, results.explanation, 40, 380, W - 80, 22, 3);
    }

    // Footer
    ctx.fillStyle = C.dim;
    ctx.font = font(14);
    ctx.fillText('smarter.poker/sandbox', 40, H - 30);
    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleDateString(), W - 40, H - 30);

    return canvas;
}

export function ExportCard({ results, scenario, onExport }) {
    const handleExport = useCallback(async () => {
        try {
            const canvas = drawCard(results, scenario);
            if (!canvas) throw new Error('Canvas unavailable');
            const dataUrl = canvas.toDataURL('image/png');

            const link = document.createElement('a');
            link.download = `smarter-poker-analysis-${Date.now()}.png`;
            link.href = dataUrl;
            link.click();

            try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            if (onExport) onExport(dataUrl);
        } catch (err) {
            console.warn('[ExportCard] Export failed:', err);
            toast.error('Export failed');
        }
    }, [results, scenario, onExport]);

    if (!results) return null;

    return (
        <button onClick={handleExport} style={{
            width: '100%', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
            background: 'rgba(35,116,225,0.1)', border: '1px solid rgba(35,116,225,0.2)',
            color: '#4599FF', cursor: 'pointer', marginBottom: '8px',
            outline: 'none', WebkitTapHighlightColor: 'transparent',
        }}>
            Export as Image
        </button>
    );
}
