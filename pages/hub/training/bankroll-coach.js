export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/gto-reports?source=bankroll-coach',
      permanent: false,
    },
  };
}

export default function BankrollCoachRedirect() {
  return null;
}
