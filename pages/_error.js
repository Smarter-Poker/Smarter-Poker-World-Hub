import * as Sentry from '@sentry/nextjs';
import NextErrorComponent from 'next/error';

const CustomErrorComponent = (props) => {
    // This component renders the default Next.js error fallback page
    // but ensures Sentry successfully hooks into the server-side exceptions.
    return <NextErrorComponent statusCode={props.statusCode} />;
};

CustomErrorComponent.getInitialProps = async (contextData) => {
    // This will contain the status code of the response
    await Sentry.captureUnderscoreErrorException(contextData);

    // Run the default Next.js getInitialProps to extract error details
    return NextErrorComponent.getInitialProps(contextData);
};

export default CustomErrorComponent;
