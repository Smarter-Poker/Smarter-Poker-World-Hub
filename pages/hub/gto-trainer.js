/**
 * /hub/gto-trainer -> redirects to /hub/training
 */
export default function GtoTrainerRedirect() {
    return null;
}

export function getServerSideProps() {
    return {
        redirect: {
            destination: '/hub/training',
            permanent: true,
        },
    };
}
