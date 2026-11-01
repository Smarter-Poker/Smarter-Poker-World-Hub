/**
 * Positional GTO Preflop Range Matrix Route -- /tools/preflop-ranges/[position]
 * ==============================================================================
 * Server-rendered positional preflop chart pages for UTG, MP, HJ, CO, BTN, and SB
 * (plus raw Markdown at /tools/preflop-ranges/[position].md).
 */

import PreflopRangeMatrixHub from './index';

const VALID_POSITIONS = new Set(['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB']);

export async function getServerSideProps({ req, res, params, query }) {
  const rawPos = String(params?.position || query?.pos || query?.position || '')
    .replace(/\.md$/i, '')
    .trim()
    .toUpperCase();

  if (!VALID_POSITIONS.has(rawPos)) {
    return { notFound: true };
  }

  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md') ||
    String(params?.position || '').endsWith('.md');

  if (isMarkdownRequested) {
    const { renderPreflopRangesMarkdown } = await import('../../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPreflopRangesMarkdown({ position: rawPos });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      initialPosition: rawPos,
      canonicalPath: `/tools/preflop-ranges/${rawPos.toLowerCase()}`,
    },
  };
}

export default function PositionalPreflopRangeMatrixPage({
  initialPosition = 'UTG',
  canonicalPath = '/tools/preflop-ranges/utg',
}) {
  return (
    <PreflopRangeMatrixHub
      initialPosition={initialPosition}
      canonicalPath={canonicalPath}
    />
  );
}
