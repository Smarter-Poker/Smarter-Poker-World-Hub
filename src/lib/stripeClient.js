/**
 * Stripe Client Utility
 * Initializes and exports Stripe.js instance
 */
import { loadStripe } from '@stripe/stripe-js';

let stripePromise;

export const getStripe = () => {
    if (!stripePromise) {
        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

        if (!publishableKey) {
            console.error('Stripe publishable key not configured');
            return null;
        }

        stripePromise = loadStripe(publishableKey);
    }

    return stripePromise;
};

export default getStripe;
