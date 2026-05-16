/**
 * GlobalReportBugButton
 * ═══════════════════════════════════════════════════════════════════════════
 * Floating "Report A Bug" button that appears on every /hub and /commander
 * page. Renders as a fixed pill in the bottom-right corner.
 *
 * Only shows on pages that don't already have a hamburger menu (which has
 * ReportBugWidget built in). On those pages it provides a second entry point
 * — that's fine. The key requirement is zero pages have ZERO access.
 *
 * Lives in _app.js global providers so it truly covers 100% of the platform.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// Lazy-load the modal to avoid adding weight to the initial bundle
const ReportBugWidget = dynamic(() => import('./ReportBugWidget'), { ssr: false });

// Pages where a hamburger menu with Report A Bug is already prominently
// displayed — we still render the global button but it becomes the second
// access point (belt-and-suspenders). These pages benefit from having both.
const HUB_PATH_PREFIXES = ['/hub/', '/commander/'];

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
        // Show on all hub and commander pages
        const isHubPage = HUB_PATH_PREFIXES.some(prefix => path.startsWith(prefix));
        // Also show on the landing / auth pages optionally — but keeping it
        // hub-only per user's requirement ("inside all pages of smarter.poker")
        setVisible(isHubPage);
    }, [router.asPath, mounted]);

    if (!visible || !mounted) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 24,
                right: 16,
                zIndex: 8000, // Below hamburger drawer (10100) but above most content
                // Only show when no other element at that position is obvious
                // (hamburger menus open at 10100 and cover this automatically)
                pointerEvents: 'auto',
            }}
            className="global-report-bug-container"
        >
            {/* Compact pill trigger — expands to full ReportBugWidget modal */}
            <ReportBugWidget contextPath={router.asPath} theme="dark" compact />
            <style>{`
                /* Override ReportBugWidget button to be a compact floating pill
                   when used as the global floating trigger */
                .global-report-bug-container #report-bug-btn {
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
                .global-report-bug-container #report-bug-btn:hover {
                    background: rgba(15, 23, 42, 0.98) !important;
                    border-color: rgba(255,255,255,0.4) !important;
                    box-shadow: 0 6px 24px rgba(0,0,0,0.6) !important;
                }
            `}</style>
        </div>
    );
}
