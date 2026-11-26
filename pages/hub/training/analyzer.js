export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/hand-history-upload?source=legacy-analyzer',
      permanent: false,
    },
  };
}

export default function AnalyzerRedirect() {
  return null;
}
