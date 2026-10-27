/**
 * Tournament ICM Calculator Dedicated Clean URL Lander -- /tools/icm-calculator
 * ==============================================================================
 * Dedicated, indexable root tool lander capturing "ICM calculator",
 * "tournament ICM equity calculator", and bubble factor decision queries.
 * Re-exports the complete ICMCalculatorPage application with canonical alignment.
 */

import ICMCalculatorPage from '../hub/training/icm-calculator';

export async function getServerSideProps({ req, res, query }) {
    const acceptHeader = String(req?.headers?.accept || '');
    const isMarkdownRequested =
        acceptHeader.includes('text/markdown') ||
        query?.format === 'md' ||
        req?.url?.includes('format=md');
    if (isMarkdownRequested) {
        const { renderIcmCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
        const mdContent = renderIcmCalculatorMarkdown();
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Vary', 'Accept');
        res.write(mdContent);
        res.end();
        return { props: {} };
    }
    return { props: {} };
}

export default function ICMCalculatorLander() {
    return <ICMCalculatorPage />;
}
