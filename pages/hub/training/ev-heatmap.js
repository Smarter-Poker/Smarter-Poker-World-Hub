export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/reports?source=ev-heatmap',
      permanent: false,
    },
  };
}

export default function EvHeatmapRedirect() {
  return null;
}
