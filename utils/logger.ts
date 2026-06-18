export const logError = (context: string, error: any) => {
    console.error(`[${context}] Error:`, error);
    // Placeholder for Sentry or other external logging service
};
