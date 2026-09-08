/**
 * Legacy Hand Analyzer Route
 *
 * The former client-only analyzer compared every uploaded action with a
 * hard-coded "check" baseline and displayed generic street percentages as
 * solver output. That cannot support an honest grade. Keep the old URL alive,
 * but send every request to the server-audited hand-history workflow.
 */

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/hand-history-upload?source=legacy-analyzer',
      permanent: false,
    },
  };
}

export default function LegacyAnalyzerRedirect() {
  return null;
}
