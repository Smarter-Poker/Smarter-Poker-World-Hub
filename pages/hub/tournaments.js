// Permanent redirect
// This eliminates the server-side function call on every request
export function getServerSideProps() {
    return {
        redirect: {
            destination: '/hub/daily-tournaments',
            permanent: true,
        },
    };
}

export default function RedirectPage() {
    return null;
}
