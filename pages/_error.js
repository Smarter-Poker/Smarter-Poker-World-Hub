import NextErrorComponent from 'next/error';

const CustomErrorComponent = (props) => {
    // This component renders the default Next.js error fallback page
    // but ensures Sentry successfully hooks into the server-side exceptions.
    return <NextErrorComponent statusCode={props.statusCode} />;
};

CustomErrorComponent.getInitialProps = async (contextData) => {
    // Server-side only. Browser Sentry was removed from the Hub on 2026-09-04
    // (docs/SENTRY-FREE-TIER-POLICY.md): a client-side navigation error here
    // has nothing to report to, and the static import this file used to carry
    // pulled the whole SDK into the client bundle for that no-op. The server
    // render path still reports, subject to the daily budget in
    // sentry.server.config.js.
    if (typeof window === 'undefined') {
        try {
            const Sentry = await import('@sentry/nextjs');
            if (typeof Sentry.captureUnderscoreErrorException === 'function') {
                await Sentry.captureUnderscoreErrorException(contextData);
            }
        } catch (_e) { /* never let reporting break the error page */ }
    }

    // Run the default Next.js getInitialProps to extract error details
    return NextErrorComponent.getInitialProps(contextData);
};

export default CustomErrorComponent;
