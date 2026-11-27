/**
 * Poker Odds Calculator Dedicated Clean URL Lander -- /tools/poker-odds-calculator
 * ==============================================================================
 * Dedicated, indexable root tool lander capturing "poker odds calculator",
 * "free poker equity calculator", and multiway game odds queries.
 * Re-exports the complete PokerToolsPage application with canonical alignment.
 */

import PokerToolsPage from '../hub/poker-tools';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

export async function getServerSideProps({ req, res, query }) {
    const acceptHeader = String(req?.headers?.accept || '');
    const isMarkdownRequested =
        acceptHeader.includes('text/markdown') ||
        query?.format === 'md' ||
        req?.url?.includes('format=md');
    if (isMarkdownRequested) {
        const { renderPokerOddsCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
        const mdContent = renderPokerOddsCalculatorMarkdown({
            hand1: query?.hand1 || query?.h1 || '',
            hand2: query?.hand2 || query?.h2 || '',
            pot: query?.pot || '',
            call: query?.call || '',
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

export default function PokerOddsCalculatorLander() {
    return (
        <>
            <PokerToolsPage />
            <section
                aria-label="Free Smarter.Poker Account Unlock"
                style={{ background: '#070b14', padding: '0 20px 48px' }}
            >
                <div style={{ maxWidth: 1020, margin: '0 auto' }}>
                    <SmarterAccountUnlockGate
                        variant="calculator-pro"
                        context="tools-poker-odds-calculator"
                        redirectPath="/tools/poker-odds-calculator"
                    />
                </div>
            </section>
        </>
    );
}
