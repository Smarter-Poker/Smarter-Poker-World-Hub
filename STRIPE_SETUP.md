# Diamond Store - Stripe Setup Guide

## Required Environment Variables

The following environment variables must be set in Vercel for the Diamond Store to function:

### Stripe Keys
```bash
STRIPE_SECRET_KEY=sk_test_... (or sk_live_... for production)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_... for production)
STRIPE_WEBHOOK_SECRET=whsec_...
```

### How to Add to Vercel

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add each variable for Production environment
3. Redeploy the project for changes to take effect

## Stripe Webhook Configuration

### 1. Register Webhook Endpoint

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Enter URL: `https://smarter.poker/api/webhooks/stripe`
4. Select events to listen for:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click "Add endpoint"

### 2. Get Webhook Secret

1. After creating the endpoint, click on it
2. Click "Reveal" next to "Signing secret"
3. Copy the secret (starts with `whsec_`)
4. Add it to Vercel as `STRIPE_WEBHOOK_SECRET`

## Testing Webhooks Locally

### Using Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-brew/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# In another terminal, run your dev server
npm run dev

# Trigger test events
stripe trigger checkout.session.completed
```

## VIP Subscription Setup (Phase 3)

### Create Stripe Products

1. Go to Stripe Dashboard → Products → Add Product
2. Create two products:
   - **VIP Monthly**: $9.99/month recurring
   - **VIP Annual**: $99.99/year recurring
3. Copy the Price IDs (starts with `price_`)
4. Add to environment variables:
   ```bash
   STRIPE_PRICE_VIP_MONTHLY=price_...
   STRIPE_PRICE_VIP_ANNUAL=price_...
   ```

## Verification Checklist

- [ ] All environment variables set in Vercel
- [ ] Webhook endpoint registered in Stripe
- [ ] Webhook secret added to Vercel
- [ ] Test purchase completes successfully
- [ ] Webhook receives `checkout.session.completed` event
- [ ] Diamonds added to user balance
- [ ] Purchase record updated to 'completed' status
- [ ] Success page shows confetti
- [ ] Cart clears after successful purchase

## Troubleshooting

### "Payments not configured" error
- Check that `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are set in Vercel
- Redeploy after adding environment variables

### Webhook not receiving events
- Verify webhook URL is correct: `https://smarter.poker/api/webhooks/stripe`
- Check webhook secret is correct in Vercel
- Check Stripe Dashboard → Webhooks → Your endpoint → Recent deliveries

### Diamonds not added after purchase
- Check Supabase logs for errors in `add_diamonds_to_balance` function
- Verify `diamond_purchases` table has the purchase record
- Check webhook logs in Vercel deployment logs

## Current Status

✅ Webhook handler created: `/pages/api/webhooks/stripe.js`
✅ Success/cancel handlers added to diamond-store.js
⏳ Pending: Environment variables configuration in Vercel
⏳ Pending: Webhook endpoint registration in Stripe
