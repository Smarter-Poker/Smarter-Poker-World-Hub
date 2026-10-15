/**
 * BANKROLL MANAGER — Route Alias
 * Permanent 308 redirect to /hub/bankroll-manager
 */
import UniversalHeader from '../../src/components/ui/UniversalHeader';

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/bankroll-manager',
      permanent: true,
    },
  };
}

export default function BankrollRedirect() {
  return <UniversalHeader />;
}
