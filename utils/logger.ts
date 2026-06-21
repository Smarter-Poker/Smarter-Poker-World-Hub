import * as Sentry from '@sentry/nextjs';

export const logError = (context: string, error: any) => {
    console.error(`[${context}] Error:`, error);
    Sentry.captureException(error, {
        tags: { context }
    });
};
