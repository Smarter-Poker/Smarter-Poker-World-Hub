export default function HubAdminIndex() {
  return null;
}

export function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/admin/video-operations',
      permanent: false,
    },
  };
}
