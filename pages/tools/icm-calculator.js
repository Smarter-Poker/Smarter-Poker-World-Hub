/**
 * Tournament ICM Calculator Dedicated Clean URL Lander -- /tools/icm-calculator
 * ==============================================================================
 * Dedicated, indexable root tool lander capturing "ICM calculator",
 * "tournament ICM equity calculator", and bubble factor decision queries.
 * Re-exports the complete ICMCalculatorPage application with canonical alignment.
 */

import ICMCalculatorPage from '../hub/training/icm-calculator';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import SmarterCalculatorSaveBar from '../../src/components/seo/SmarterCalculatorSaveBar';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

export async function getServerSideProps({ req, res, query }) {
    const acceptHeader = String(req?.headers?.accept || '');
    const isMarkdownRequested =
        acceptHeader.includes('text/markdown') ||
        query?.format === 'md' ||
        req?.url?.includes('format=md');
    if (isMarkdownRequested) {
        const { renderIcmCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
        const mdContent = renderIcmCalculatorMarkdown({
            stacks: query?.stacks || '',
            payouts: query?.payouts || '',
        });
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Vary', 'Accept');
        res.write(mdContent);
        res.end();
        return { props: {} };
    }
    setPublicSeoHtmlCache(res);
    return { props: {} };
}

export default function ICMCalculatorLander() {
    return (
        <>
            <ICMCalculatorPage />
            <section
                aria-label="Free Smarter.Poker Account Unlock"
                style={{ background: '#070b14', padding: '8px 20px 48px' }}
            >
                <div style={{ maxWidth: 1020, margin: '0 auto' }}>
                    <SmarterCalculatorSaveBar
                        toolSlug="icm-calculator"
                        toolName="Tournament ICM Calculator"
                        eyebrow="Free ICM Spot Sync"
                        title="Save This Final-Table ICM Bubble Spot Free"
                        description="Store Final-Table Payout Structures, Compare Deal Chop Equity & Practice Live Bubble Drills."
                        ctaLabel="Save ICM Spot Free"
                        summaryText="Final-Table ICM Equity & Bubble Factor Spot"
                        redirectPath="/tools/icm-calculator"
                    />
                    <SmarterAccountUnlockGate
                        variant="calculator-pro"
                        context="tools-icm-calculator"
                        redirectPath="/tools/icm-calculator"
                    />
                </div>
            </section>
        </>
    );
}
