export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/gto-reports',
      permanent: false,
    },
  };
}

export default function PerformanceHeatmapRedirect() {
  return null;
}
