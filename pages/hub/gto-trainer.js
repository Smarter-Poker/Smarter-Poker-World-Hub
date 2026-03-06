// Permanent redirect
// This eliminates the server-side function call on every request
export function getServerSideProps() {
    return {
        redirect: {
            destination: '/hub/training',
            permanent: true,
        },
    };
}

export default function RedirectPage() {
    return null;
}
