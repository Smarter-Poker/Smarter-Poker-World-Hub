/**
 * Stripe Setup Script
 * Creates all products and prices for the Diamond Store
 */
require('dotenv').config({ path: '.env.local' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const DIAMOND_PACKAGES = [
    { id: 'starter', name: 'Starter Pack', diamonds: 1000, bonus: 0, price: 9.99 },
    { id: 'bronze', name: 'Bronze Pack', diamonds: 2500, bonus: 0, price: 24.99 },
    { id: 'silver', name: 'Silver Pack', diamonds: 5000, bonus: 0, price: 49.99 },
    { id: 'gold', name: 'Gold Pack', diamonds: 10000, bonus: 500, price: 99.99 },
    { id: 'platinum', name: 'Platinum Pack', diamonds: 25000, bonus: 1500, price: 249.99 },
    { id: 'diamond', name: 'Diamond Pack', diamonds: 50000, bonus: 3500, price: 499.99 },
    { id: 'elite', name: 'Elite Pack', diamonds: 100000, bonus: 8000, price: 999.99 },
    { id: 'legend', name: 'Legend Pack', diamonds: 250000, bonus: 22500, price: 2499.99 }
];

const VIP_PLANS = [
    { id: 'vip-monthly', name: 'VIP Monthly', price: 19.99, interval: 'month' },
    { id: 'vip-annual', name: 'VIP Annual', price: 199.99, interval: 'year' }
];

async function setupStripe() {
    console.log('🔧 Setting up Stripe products and prices...\n');

    try {
        // Create Diamond Packages
        console.log('💎 Creating Diamond Packages...');
        for (const pkg of DIAMOND_PACKAGES) {
            const totalDiamonds = pkg.diamonds + pkg.bonus;

            const product = await stripe.products.create({
                name: pkg.name,
                description: `${totalDiamonds.toLocaleString()} Diamonds${pkg.bonus > 0 ? ` (${pkg.diamonds.toLocaleString()} + ${pkg.bonus.toLocaleString()} bonus)` : ''}`,
                images: ['https://smarter.poker/images/diamond-icon.png'],
                metadata: {
                    type: 'diamonds',
                    package_id: pkg.id,
                    diamonds: pkg.diamonds,
                    bonus: pkg.bonus,
                    total_diamonds: totalDiamonds
                }
            });

            const price = await stripe.prices.create({
                product: product.id,
                unit_amount: Math.round(pkg.price * 100), // Convert to cents
                currency: 'usd',
                metadata: {
                    package_id: pkg.id
                }
            });

            console.log(`  ✅ ${pkg.name}: ${totalDiamonds.toLocaleString()} diamonds - $${pkg.price}`);
            console.log(`     Product ID: ${product.id}`);
            console.log(`     Price ID: ${price.id}\n`);
        }

        // Create VIP Subscriptions
        console.log('\n👑 Creating VIP Subscription Plans...');
        for (const plan of VIP_PLANS) {
            const product = await stripe.products.create({
                name: plan.name,
                description: `VIP Membership - ${plan.interval === 'month' ? 'Monthly' : 'Annual'} subscription with unlimited access to all features`,
                images: ['https://smarter.poker/images/vip-crown.png'],
                metadata: {
                    type: 'vip_subscription',
                    tier: plan.interval === 'month' ? 'monthly' : 'annual'
                }
            });

            const price = await stripe.prices.create({
                product: product.id,
                unit_amount: Math.round(plan.price * 100),
                currency: 'usd',
                recurring: {
                    interval: plan.interval
                },
                metadata: {
                    vip_tier: plan.interval === 'month' ? 'monthly' : 'annual'
                }
            });

            console.log(`  ✅ ${plan.name}: $${plan.price}/${plan.interval}`);
            console.log(`     Product ID: ${product.id}`);
            console.log(`     Price ID: ${price.id}\n`);
        }

        console.log('\n✅ Stripe setup complete!');
        console.log('\n📝 Next steps:');
        console.log('1. Set up webhook endpoint in Stripe Dashboard');
        console.log('2. Add STRIPE_WEBHOOK_SECRET to .env.local');
        console.log('3. Test purchases in test mode');

    } catch (error) {
        console.error('❌ Error setting up Stripe:', error.message);
        process.exit(1);
    }
}

setupStripe();
