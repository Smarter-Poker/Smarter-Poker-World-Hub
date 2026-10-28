/**
 * Clean Root Alias -- /tools/preflop-ranges
 * ==============================================================================
 * Clean URL entry point for GTO Preflop Range Matrix Hub.
 */

import PreflopRangeMatrixHub from './preflop-ranges/index';

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');
  if (isMarkdownRequested) {
    const { renderPreflopRangesMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const position = query?.pos || query?.position || 'UTG';
    const mdContent = renderPreflopRangesMarkdown({ position });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}

export default function PreflopRangesEntry() {
  return <PreflopRangeMatrixHub />;
}
