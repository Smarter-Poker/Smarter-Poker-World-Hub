// Legacy Marketplace links resolve on the server so shoppers never see an
// intermediate loading page or a second app shell. Query parameters are kept
// for old ?tab= deep links; /hub/diamond-store owns their canonical handling.
//
// In practice next.config.js declares the same redirect and Next applies
// redirects() before page routing, so production answers 308 from there rather
// than the 307 this file would produce. This stays as the fallback, and because
// the footer route matrix needs /hub/marketplace to exist as a physical page.
export async function getServerSideProps({ resolvedUrl }) {
  const queryIndex = String(resolvedUrl || '').indexOf('?');
  const query = queryIndex >= 0 ? String(resolvedUrl).slice(queryIndex) : '';

  return {
    redirect: {
      destination: `/hub/diamond-store${query}`,
      permanent: false,
    },
  };
}

export default function MarketplacePage() {
  return null;
}
