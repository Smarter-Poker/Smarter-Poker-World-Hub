/**
 * GlobalReportBugButton
 * ═══════════════════════════════════════════════════════════════════════════
 * Floating "Report A Bug" button that appears on every /hub page that does
 * NOT already have the widget accessible via a hamburger menu.
 *
 * SUPPRESSED ON: /hub/commander/* — those pages have CommanderPageShell
 * which renders the full HamburgerMenu with ReportBugWidget at the bottom.
 *
 * POSITION: fixed bottom-left (avoids GeevesFloatingOrb at bottom-right).
 *
 * INSTANCE ID: passes instanceId="global" to ReportBugWidget so its button
 * gets a unique DOM id, preventing the duplicate-id bug on pages where
 * HamburgerMenu also mounts a ReportBugWidget.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// Lazy-load the modal to avoid adding weight to the initial bundle
const ReportBugWidget = dynamic(() => import('./ReportBugWidget'), { ssr: false });

export default function GlobalReportBugButton() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        const path = router.asPath.split('?')[0];
        // Show on /hub/* pages only
        const isHubPage = path.startsWith('/hub/');
        // Suppress on Commander subpages — CommanderPageShell already provides
        // a hamburger menu with ReportBugWidget at the bottom.
        const isCommanderSub = path.startsWith('/hub/commander/');
        setVisible(isHubPage && !isCommanderSub);
    }, [router.asPath, mounted]);

    if (!visible || !mounted) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 24,
                // LEFT side — keeps clear of GeevesFloatingOrb (bottom-right z-99998)
                left: 16,
                zIndex: 8000,
                pointerEvents: 'auto',
            }}
            className="global-report-bug-container"
        >
            {/* instanceId prevents duplicate DOM ids when HamburgerMenu is also mounted */}
            <ReportBugWidget contextPath={router.asPath} theme="dark" instanceId="global" />
            <style>{`
                /* Compact pill style for the global floating trigger */
                .global-report-bug-container #report-bug-btn-global {
                    width: auto !important;
                    padding: 8px 14px !important;
                    border-radius: 20px !important;
                    font-size: 13px !important;
                    gap: 6px !important;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.5) !important;
                    backdrop-filter: blur(8px) !important;
                    background: rgba(15, 23, 42, 0.92) !important;
                    border: 1px solid rgba(255,255,255,0.2) !important;
                    white-space: nowrap !important;
                }
                .global-report-bug-container #report-bug-btn-global:hover {
                    background: rgba(15, 23, 42, 0.98) !important;
                    border-color: rgba(255,255,255,0.4) !important;
                    box-shadow: 0 6px 24px rgba(0,0,0,0.6) !important;
                }
                .global-report-bug-container #report-bug-btn-global:active {
                    transform: scale(0.98) !important;
                }
            `}</style>
        </div>
    );
}
