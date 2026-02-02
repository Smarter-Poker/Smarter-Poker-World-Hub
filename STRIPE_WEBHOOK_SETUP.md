# Stripe Webhook Secret - Action Required

## Status
✅ STRIPE_SECRET_KEY added to Vercel
✅ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY added to Vercel
⏳ STRIPE_WEBHOOK_SECRET - Pending webhook registration

## Next Steps

### 1. Register Webhook in Stripe Dashboard

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"
3. Enter webhook URL: `https://smarter.poker/api/store/webhooks/stripe`
4. Select events to listen for:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `charge.refunded`
5. Click "Add endpoint"

### 2. Get Webhook Signing Secret

1. After creating the endpoint, click on it
2. Click "Reveal" next to "Signing secret"
3. Copy the secret (starts with `whsec_`)

### 3. Add to Vercel

```bash
vercel env add STRIPE_WEBHOOK_SECRET production
# When prompted, paste the whsec_... value
```

### 4. Redeploy

```bash
vercel --prod
```

## Note

The webhook will work WITHOUT the secret (signature verification will be skipped with a warning), but it's recommended to add it for security.

See line 38-45 in `/pages/api/store/webhooks/stripe.js`:
```javascript
if (endpointSecret && sig) {
    // Verify signature
} else {
    // Skip verification with warning
    console.warn('⚠️  Webhook signature verification skipped');
}
```
