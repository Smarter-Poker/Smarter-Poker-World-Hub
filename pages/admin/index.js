export default function AdminIndex() {
  return null;
}

export function getServerSideProps() {
  return {
    redirect: {
      destination: '/admin/auth-health',
      permanent: false,
    },
  };
}
