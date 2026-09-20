/** Check required production configuration once per server startup. */
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { checkProductionEnv } = require('./lib/envGuard');
        checkProductionEnv({ force: true });
    }
}
