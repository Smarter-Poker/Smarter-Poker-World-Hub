/**
 * Poker Odds Calculator Dedicated Clean URL Lander -- /tools/poker-odds-calculator
 * ==============================================================================
 * Dedicated, indexable root tool lander capturing "poker odds calculator",
 * "free poker equity calculator", and multiway game odds queries.
 * Re-exports the complete PokerToolsPage application with canonical alignment.
 */

import PokerToolsPage from '../hub/poker-tools';

export async function getServerSideProps({ req, res, query }) {
    const acceptHeader = String(req?.headers?.accept || '');
    const isMarkdownRequested =
        acceptHeader.includes('text/markdown') ||
        query?.format === 'md' ||
        req?.url?.includes('format=md');
    if (isMarkdownRequested) {
        const { renderPokerOddsCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
        const mdContent = renderPokerOddsCalculatorMarkdown();
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Vary', 'Accept');
        res.write(mdContent);
        res.end();
        return { props: {} };
    }
    return { props: {} };
}

export default function PokerOddsCalculatorLander() {
    return <PokerToolsPage />;
}
