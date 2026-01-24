---
name: Diamond Store & Payments
description: In-app purchases, diamond bundles, VIP membership, and merchandise
---

# Diamond Store & Payments Skill

## Overview
Complete store with diamond purchases, VIP subscriptions, and merchandise via Stripe.

## Diamond Economy
**1 Diamond = $0.01 (1 cent)**
- No discounts on purchases under $100
- 5% bonus on purchases of $100 or more

## Diamond Bundles
```javascript
const DIAMOND_BUNDLES = [
  { id: 'micro', name: 'Micro', diamonds: 100, price: 1.00, bonus: 0 },
  { id: 'small', name: 'Small', diamonds: 500, price: 5.00, bonus: 0 },
  { id: 'medium', name: 'Medium', diamonds: 1000, price: 10.00, bonus: 0 },
  { id: 'standard', name: 'Standard', diamonds: 2500, price: 25.00, bonus: 0, featured: true },
  { id: 'large', name: 'Large', diamonds: 5000, price: 50.00, bonus: 0 },
  { id: 'value', name: 'Value', diamonds: 10000, price: 100.00, bonus: 500, hasDiscount: true },
  { id: 'premium', name: 'Premium', diamonds: 25000, price: 250.00, bonus: 1250, hasDiscount: true },
  { id: 'whale', name: 'Whale', diamonds: 50000, price: 500.00, bonus: 2500, hasDiscount: true }
];
```

## VIP Membership — $19.99/month
Unlocks ALL features with no diamond costs.

### Plans
```javascript
const VIP_MEMBERSHIP = {
  monthly: { id: 'vip-monthly', price: 19.99, interval: 'month' },
  annual: { id: 'vip-annual', price: 199.99, interval: 'year', savings: 39.89 }
};
```

### VIP Benefits (Everything Included)
| Benefit | Description | A La Carte Value |
|---------|-------------|------------------|
| Diamond Arena Access | Unlimited tournament entries | $500+/mo |
| Diamond Arcade | All arcade games free | $100+/mo |
| Premium Training | Full training access | $50/mo |
| Avatar Engine | Unlimited AI avatars | $100+/mo |
| Advanced Analytics | Deep bankroll insights | $30/mo |
| AI Personal Assistant | Priority AI coaching | $50/mo |
| Exclusive Leaderboards | VIP-only competitions | Exclusive |
| Priority Support | 24/7 priority support | Priceless |
| Daily Diamond Bonus | +25 diamonds daily | $7.50/mo |
| VIP Badge & Flair | Exclusive cosmetics | Exclusive |
| 2x XP Boost | Double XP earnings | $25/mo |
| Early Access | First access to features | Exclusive |

**Total Feature Value: $800+/mo → VIP Price: $19.99/mo**

## Merchandise
```javascript
const MERCHANDISE = [
  // Apparel
  { id: 'hoodie-neural', name: 'Neural Network Hoodie', price: 59.99, category: 'apparel' },
  { id: 'tshirt-gto', name: 'GTO Wizard Tee', price: 29.99, category: 'apparel' },
  { id: 'hat-diamond', name: 'Diamond Dad Hat', price: 34.99, category: 'apparel' },
  // Accessories
  { id: 'card-protector-gold', name: 'Gold Card Protector', price: 24.99, category: 'accessories' },
  { id: 'card-protector-black', name: 'Stealth Card Protector', price: 24.99, category: 'accessories' },
  { id: 'deck-premium', name: 'Premium Playing Cards', price: 14.99, category: 'accessories' },
  { id: 'chip-set-100', name: '100-Chip Travel Set', price: 79.99, category: 'accessories' },
  { id: 'chip-set-500', name: '500-Chip Pro Set', price: 199.99, category: 'accessories' }
];
```

## Stripe Integration

### Environment Variables
```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Create Diamond Purchase Checkout
```javascript
// pages/api/payments/create-checkout.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const { bundleId, userId } = req.body;
  const bundle = DIAMOND_BUNDLES.find(b => b.id === bundleId);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${bundle.name} - ${bundle.diamonds + bundle.bonus} Diamonds`,
          description: bundle.bonus > 0
            ? `${bundle.diamonds} + ${bundle.bonus} bonus diamonds (5% bonus!)`
            : `${bundle.diamonds} diamonds`
        },
        unit_amount: Math.round(bundle.price * 100)
      },
      quantity: 1
    }],
    mode: 'payment',
    success_url: `${process.env.NEXT_PUBLIC_URL}/hub/diamond-store?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/hub/diamond-store?canceled=true`,
    metadata: { userId, bundleId, diamonds: bundle.diamonds + bundle.bonus }
  });

  res.json({ sessionId: session.id, url: session.url });
}
```

### Create VIP Subscription Checkout
```javascript
// pages/api/payments/create-vip-subscription.js
export default async function handler(req, res) {
  const { planId, userId } = req.body;

  // Create Stripe prices in dashboard first, then use price IDs
  const prices = {
    'vip-monthly': process.env.STRIPE_VIP_MONTHLY_PRICE_ID,
    'vip-annual': process.env.STRIPE_VIP_ANNUAL_PRICE_ID
  };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: prices[planId], quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.NEXT_PUBLIC_URL}/hub/diamond-store?vip=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/hub/diamond-store?vip=canceled`,
    metadata: { userId, plan: planId }
  });

  res.json({ sessionId: session.id, url: session.url });
}
```

### Webhook Handler
```javascript
// pages/api/payments/webhook.js
export default async function handler(req, res) {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    process.env.STRIPE_WEBHOOK_SECRET
  );

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      if (session.mode === 'payment') {
        // Diamond purchase
        await awardDiamonds(session.metadata.userId, session.metadata.diamonds, session.id);
      } else if (session.mode === 'subscription') {
        // VIP subscription started
        await activateVIP(session.metadata.userId, session.subscription);
      }
      break;

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      // Handle VIP status changes
      await updateVIPStatus(event.data.object);
      break;
  }

  res.json({ received: true });
}
```

## Database Schema
```sql
-- Purchase history
CREATE TABLE purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  stripe_session_id TEXT UNIQUE,
  purchase_type TEXT, -- 'diamonds', 'merch'
  amount_paid DECIMAL(10, 2),
  diamonds_awarded INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- VIP Subscriptions
CREATE TABLE vip_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  plan TEXT, -- 'vip-monthly', 'vip-annual'
  status TEXT, -- 'active', 'canceled', 'past_due', 'trialing'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Merchandise orders
CREATE TABLE merch_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  stripe_session_id TEXT UNIQUE,
  items JSONB, -- Array of { itemId, quantity, price }
  total_amount DECIMAL(10, 2),
  shipping_address JSONB,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'shipped', 'delivered'
  tracking_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Check VIP status helper
CREATE OR REPLACE FUNCTION is_vip(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM vip_subscriptions
    WHERE user_id = p_user_id
    AND status = 'active'
    AND current_period_end > NOW()
  );
END;
$$ LANGUAGE plpgsql;
```

## Components
- `pages/hub/diamond-store.js` - Main store page with 3 tabs
- `DiamondPackageCard` - Diamond purchase option
- `VIPCard` - VIP subscription option
- `MerchCard` - Merchandise item
- `CheckoutButton` - Stripe checkout trigger
- `VIPBadge` - Display VIP status

## Page Structure
```
/hub/diamond-store
├── Diamonds Tab (default)
│   ├── 8 diamond packages ($1 - $500)
│   └── 5% bonus on $100+ purchases
├── VIP Membership Tab
│   ├── Monthly ($19.99/mo)
│   ├── Annual ($199.99/yr - save $39.89)
│   └── 12 VIP benefits listed
└── Merch Tab
    ├── Apparel (hoodies, tees, hats)
    └── Accessories (cards, chips, protectors)
```
