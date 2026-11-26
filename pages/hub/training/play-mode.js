export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/arena/cash-001?level=1',
      permanent: false,
    },
  };
}

export default function PlayModeRedirect() {
  return null;
}
