export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/aggregate?source=ev-heatmap',
      permanent: false,
    },
  };
}

export default function EvHeatmapRedirect() {
  return null;
}
