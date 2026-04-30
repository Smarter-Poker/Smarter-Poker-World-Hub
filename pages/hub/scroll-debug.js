/**
 * SCROLL DEBUG PAGE — Diagnoses desktop scroll blocking
 * Navigate to /hub/scroll-debug to run diagnostics
 */
import { useState, useEffect } from 'react';

export default function ScrollDebug() {
    const [results, setResults] = useState(null);
    const [scrollEvents, setScrollEvents] = useState(0);
    const [wheelEvents, setWheelEvents] = useState(0);

    useEffect(() => {
        // Count wheel events
        const onWheel = () => setWheelEvents(prev => prev + 1);
        window.addEventListener('wheel', onWheel, { passive: true });
        
        // Count scroll events
        const onScroll = () => setScrollEvents(prev => prev + 1);
        window.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            window.removeEventListener('wheel', onWheel);
            window.removeEventListener('scroll', onScroll);
        };
    }, []);

    const runDiagnostics = () => {
        const diag = {};

        // 1. Body inline styles
        diag.bodyInline = {
            overflow: document.body.style.overflow || '(empty)',
            overflowY: document.body.style.overflowY || '(empty)',
            position: document.body.style.position || '(empty)',
            touchAction: document.body.style.touchAction || '(empty)',
            width: document.body.style.width || '(empty)',
            height: document.body.style.height || '(empty)',
        };

        // 2. Body computed styles
        const bcs = getComputedStyle(document.body);
        diag.bodyComputed = {
            overflow: bcs.overflow,
            overflowY: bcs.overflowY,
            position: bcs.position,
            touchAction: bcs.touchAction,
            height: bcs.height,
        };

        // 3. HTML computed styles
        const hcs = getComputedStyle(document.documentElement);
        diag.htmlComputed = {
            overflow: hcs.overflow,
            overflowY: hcs.overflowY,
            height: hcs.height,
        };

        // 4. Scroll info
        diag.scrollInfo = {
            docScrollHeight: document.documentElement.scrollHeight,
            bodyScrollHeight: document.body.scrollHeight,
            viewportHeight: window.innerHeight,
            currentScrollY: window.scrollY,
            isScrollable: document.documentElement.scrollHeight > window.innerHeight,
        };

        // 5. Body classes
        diag.bodyClasses = document.body.className;
        diag.htmlInlineOverflow = document.documentElement.style.overflow || '(empty)';

        // 6. ALL fixed elements with dimensions > 100x100
        const fixed = [];
        document.querySelectorAll('*').forEach(el => {
            const cs = getComputedStyle(el);
            if (cs.position === 'fixed' && cs.display !== 'none') {
                const rect = el.getBoundingClientRect();
                if (rect.width > 100 && rect.height > 100) {
                    fixed.push({
                        tag: el.tagName,
                        id: el.id || '(none)',
                        class: (el.className || '').toString().substring(0, 80),
                        w: Math.round(rect.width),
                        h: Math.round(rect.height),
                        top: Math.round(rect.top),
                        left: Math.round(rect.left),
                        zIndex: cs.zIndex,
                        pointerEvents: cs.pointerEvents,
                        visibility: cs.visibility,
                        opacity: cs.opacity,
                        overflow: cs.overflow,
                    });
                }
            }
        });
        diag.largeFixedElements = fixed;

        // 7. Element at viewport center
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const centerEl = document.elementFromPoint(cx, cy);
        if (centerEl) {
            const ancestors = [];
            let node = centerEl;
            for (let i = 0; i < 10 && node && node !== document.documentElement; i++) {
                const ncs = getComputedStyle(node);
                ancestors.push({
                    tag: node.tagName,
                    id: node.id || '',
                    class: (node.className || '').toString().substring(0, 60),
                    overflow: ncs.overflow,
                    overflowY: ncs.overflowY,
                    position: ncs.position,
                    pointerEvents: ncs.pointerEvents,
                    touchAction: ncs.touchAction,
                });
                node = node.parentElement;
            }
            diag.centerElement = ancestors;
        }

        // 8. Test programmatic scroll
        const beforeScroll = window.scrollY;
        window.scrollBy(0, 500);
        diag.scrollTest = {
            beforeScroll,
            afterScroll: window.scrollY,
            scrollWorked: window.scrollY !== beforeScroll,
        };

        setResults(diag);
    };

    return (
        <div style={{ padding: 20, background: '#0a0a0a', color: '#fff', minHeight: '200vh', fontFamily: 'monospace' }}>
            <h1 style={{ color: '#00d4ff' }}>Scroll Debug Diagnostics</h1>
            
            <div style={{ marginBottom: 20, display: 'flex', gap: 12 }}>
                <button onClick={runDiagnostics} style={{
                    padding: '12px 24px', background: '#3b82f6', color: 'white',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 16
                }}>
                    Run Diagnostics
                </button>
                <button onClick={() => navigator.clipboard.writeText(JSON.stringify(results, null, 2))} style={{
                    padding: '12px 24px', background: '#22c55e', color: 'white',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 16
                }}>
                    Copy Results
                </button>
            </div>

            <div style={{ background: '#1a1a1a', padding: 16, borderRadius: 12, marginBottom: 20 }}>
                <p>Wheel events received: <strong style={{ color: '#00d4ff' }}>{wheelEvents}</strong></p>
                <p>Scroll events received: <strong style={{ color: '#22c55e' }}>{scrollEvents}</strong></p>
                <p style={{ color: '#9ca3af', fontSize: 12 }}>Try scrolling with your mouse wheel. If wheel events increment but scroll events don&apos;t, something is blocking the scroll.</p>
            </div>

            {results && (
                <pre style={{ 
                    background: '#111', padding: 16, borderRadius: 12, 
                    overflow: 'auto', fontSize: 12, lineHeight: 1.6,
                    border: '1px solid #333', maxHeight: '60vh'
                }}>
                    {JSON.stringify(results, null, 2)}
                </pre>
            )}

            <div style={{ height: 1000, background: 'linear-gradient(180deg, #0a0a0a, #1a1a2a)', marginTop: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: '#666', fontSize: 18 }}>Spacer content — you should be able to scroll through this</p>
            </div>
        </div>
    );
}
