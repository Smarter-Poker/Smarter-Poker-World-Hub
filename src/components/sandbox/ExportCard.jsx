/**
 * ExportCard — Branded analysis card for image export
 * ═══════════════════════════════════════════════════════════════
 * Renders a hidden div that can be captured via html2canvas as a
 * shareable PNG image.
 */
import { useRef } from 'react';

export function ExportCard({ results, scenario, onExport }) {
    const cardRef = useRef(null);

    const handleExport = async () => {
        if (!cardRef.current) return;
        try {
            // Dynamically import html2canvas only when needed
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(cardRef.current, {
                backgroundColor: '#18191a',
                scale: 2,
                useCORS: true,
            });
            const dataUrl = canvas.toDataURL('image/png');

            // Trigger download
            const link = document.createElement('a');
            link.download = `smarter-poker-analysis-${Date.now()}.png`;
            link.href = dataUrl;
            link.click();

            if (onExport) onExport(dataUrl);
        } catch (err) {
            console.error('Export failed:', err);
        }
    };

    if (!results) return null;

    return (
        <>
            {/* Hidden render target */}
            <div ref={cardRef} style={{
                position: 'absolute', left: '-9999px', top: '-9999px',
                width: '400px', padding: '24px',
                background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                borderRadius: '16px', fontFamily: "'Inter', sans-serif",
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: '#E4E6EB', fontFamily: "'Orbitron', sans-serif" }}>
                            Smarter.Poker
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>GTO Analysis</div>
                    </div>
                    <div style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: '700', background: 'rgba(35,116,225,0.2)', color: '#4599FF' }}>
                        Virtual Sandbox
                    </div>
                </div>

                {/* Scenario */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Scenario</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#E4E6EB' }}>
                        {scenario?.position || 'BTN'} - {scenario?.hand || '??'} on {scenario?.board || 'Flop'}
                    </div>
                </div>

                {/* Result */}
                <div style={{ background: 'rgba(34,197,94,0.08)', borderRadius: '10px', padding: '12px', marginBottom: '12px', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Optimal Action</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#4ade80' }}>
                        {results.optimalAction?.label || 'N/A'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                        {results.optimalAction?.frequency}% frequency | EV: {results.ev?.heroDisplay || 'N/A'}
                    </div>
                </div>

                {/* Explanation */}
                {results.explanation && (
                    <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.5', marginBottom: '12px' }}>
                        {results.explanation.substring(0, 150)}...
                    </div>
                )}

                {/* Footer */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '9px', color: '#475569' }}>smarter.poker/sandbox</div>
                    <div style={{ fontSize: '9px', color: '#475569' }}>{new Date().toLocaleDateString()}</div>
                </div>
            </div>

            {/* Export Button */}
            <button onClick={handleExport} style={{
                width: '100%', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                background: 'rgba(35,116,225,0.1)', border: '1px solid rgba(35,116,225,0.2)',
                color: '#4599FF', cursor: 'pointer', marginBottom: '8px',
            }}>
                Export as Image
            </button>
        </>
    );
}
