// Permanent redirect — now handled at Next.js build time (getStaticProps)
// This eliminates the server-side function call on every request
export function getStaticProps() {
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
