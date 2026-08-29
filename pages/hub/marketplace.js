// Legacy Marketplace links resolve on the server so shoppers never see an
// intermediate loading page or a second app shell. Query parameters are kept
// for old ?tab= deep links; /hub/diamond-store owns their canonical handling.
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
