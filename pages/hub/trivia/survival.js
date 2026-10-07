/**
 * Compatibility route only. Redirect on the server before React, auth,
 * question loading, recovery adoption, or any entry-charge path can run.
 */
const LIVE_SURVIVAL_ROUTE = '/hub/trivia/survival-game';

export default function SurvivalCompatibilityRedirect() {
    return null;
}

export function getServerSideProps() {
    return {
        redirect: {
            destination: LIVE_SURVIVAL_ROUTE,
            permanent: false,
        },
    };
}
