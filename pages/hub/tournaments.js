/**
 * /hub/tournaments -> redirects to /hub/daily-tournaments
 */
export default function TournamentsRedirect() {
    return null;
}

export function getServerSideProps() {
    return {
        redirect: {
            destination: '/hub/daily-tournaments',
            permanent: true,
        },
    };
}
