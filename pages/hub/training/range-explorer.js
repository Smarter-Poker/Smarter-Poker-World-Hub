export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/preflop-charts',
      permanent: false,
    },
  };
}

export default function RangeExplorerRedirect() {
  return null;
}
