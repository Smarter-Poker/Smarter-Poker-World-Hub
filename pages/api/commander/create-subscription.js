// pages/api/commander/create-subscription.js
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const TIER_PRICES = {
  starter: {
    price: 99,
    priceId: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter',
  },
  professional: {
    price: 199,
    priceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || 'price_professional',
  },
  enterprise: {
    price: 399,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { paymentMethodId, selectedTier, clubInfo, ownerInfo, existingAccount, skipPayment } = req.body;
  const tier = selectedTier || req.body.tier; // support both field names

  if (!tier || !TIER_PRICES[tier]) {
    return res.status(400).json({ error: 'Invalid subscription tier' });
  }

  try {
    // ─── 1. Get or create the user account ───────────────────────────
    let userId;

    if (existingAccount) {
      // User says they already have a Smarter.Poker account — look them up
      const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();

      if (listError) {
        console.error('Error listing users:', listError);
        return res.status(500).json({ error: 'Could not verify existing account' });
      }

      const existingUser = usersData.users.find(u => u.email === ownerInfo.email);

      if (!existingUser) {
        return res.status(400).json({
          error: 'No Smarter.Poker account found with that email. Uncheck "I already have an account" and create a password instead.'
        });
      }

      userId = existingUser.id;

      // Update their metadata to include venue_owner role
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingUser.user_metadata,
          full_name: existingUser.user_metadata?.full_name || ownerInfo.name,
          phone: existingUser.user_metadata?.phone || ownerInfo.phone,
          role: 'venue_owner',
        }
      });

    } else {
      // New user — create account
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: ownerInfo.email,
        password: ownerInfo.password,
        email_confirm: true,
        user_metadata: {
          full_name: ownerInfo.name,
          phone: ownerInfo.phone,
          role: 'venue_owner'
        }
      });

      if (authError) {
        // If user already exists, try to find them instead of failing
        if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
          const { data: usersData } = await supabase.auth.admin.listUsers();
          const existingUser = usersData?.users?.find(u => u.email === ownerInfo.email);

          if (existingUser) {
            userId = existingUser.id;

            // Update metadata
            await supabase.auth.admin.updateUserById(userId, {
              user_metadata: {
                ...existingUser.user_metadata,
                full_name: existingUser.user_metadata?.full_name || ownerInfo.name,
                phone: existingUser.user_metadata?.phone || ownerInfo.phone,
                role: 'venue_owner',
              }
            });
          } else {
            return res.status(400).json({
              error: 'An account with this email already exists. Check "I already have a Smarter.Poker account" and try again.'
            });
          }
        } else {
          console.error('Auth error:', authError);
          return res.status(400).json({ error: authError.message });
        }
      } else {
        userId = authData.user.id;
      }
    }

    // ─── 2. Create or find the venue ─────────────────────────────────
    let venueId;

    // Check if venue already exists by name and address
    const { data: existingVenue } = await supabase
      .from('poker_venues')
      .select('id')
      .eq('name', clubInfo.name)
      .eq('address', clubInfo.address)
      .single();

    if (existingVenue) {
      venueId = existingVenue.id;

      await supabase
        .from('poker_venues')
        .update({
          claimed_by: userId,
          claimed_at: new Date().toISOString(),
          is_claimed: true,
          commander_enabled: true,
          commander_tier: tier,
          commander_activated_at: new Date().toISOString(),
          phone: clubInfo.phone,
          email: clubInfo.email,
          website: clubInfo.website || null,
          poker_tables: parseInt(clubInfo.tables) || null,
          games_offered: clubInfo.gamesOffered,
          registration_completed_at: new Date().toISOString(),
          onboarding_step: 5
        })
        .eq('id', venueId);
    } else {
      const { data: newVenue, error: venueError } = await supabase
        .from('poker_venues')
        .insert({
          name: clubInfo.name,
          address: clubInfo.address,
          city: clubInfo.city,
          state: clubInfo.state,
          country: 'US',
          phone: clubInfo.phone,
          email: clubInfo.email,
          website: clubInfo.website || null,
          poker_tables: parseInt(clubInfo.tables) || null,
          games_offered: clubInfo.gamesOffered,
          venue_type: 'poker_room',
          is_active: true,
          is_claimed: true,
          claimed_by: userId,
          claimed_at: new Date().toISOString(),
          commander_enabled: true,
          commander_tier: tier,
          commander_activated_at: new Date().toISOString(),
          registration_completed_at: new Date().toISOString(),
          onboarding_step: 5,
          source: 'self_registration'
        })
        .select()
        .single();

      if (venueError) {
        console.error('Venue creation error:', venueError);
        return res.status(400).json({ error: 'Failed to create venue: ' + venueError.message });
      }

      venueId = newVenue.id;
    }

    // ─── 3. Stripe (if paying) ───────────────────────────────────────
    let stripeCustomerId = null;
    let stripeSubscriptionId = null;

    if (!skipPayment && paymentMethodId) {
      const customer = await stripe.customers.create({
        email: ownerInfo.email,
        name: ownerInfo.name,
        phone: ownerInfo.phone,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId },
        metadata: { venue_id: venueId.toString(), user_id: userId },
      });

      stripeCustomerId = customer.id;

      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: TIER_PRICES[tier].priceId }],
        trial_period_days: 14,
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        metadata: { venue_id: venueId.toString(), tier },
      });

      stripeSubscriptionId = subscription.id;
    }

    // ─── 4. Commander subscription record ────────────────────────────
    // Check if one already exists for this venue
    const { data: existingSub } = await supabase
      .from('commander_subscriptions')
      .select('id')
      .eq('venue_id', venueId)
      .single();

    let subscriptionData;

    if (existingSub) {
      const { data: updatedSub } = await supabase
        .from('commander_subscriptions')
        .update({
          owner_id: userId,
          tier,
          status: 'trialing',
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          stripe_payment_method_id: paymentMethodId || null,
          monthly_price: TIER_PRICES[tier].price,
          billing_email: ownerInfo.email,
          billing_name: ownerInfo.name,
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', existingSub.id)
        .select()
        .single();
      subscriptionData = updatedSub;
    } else {
      const { data: newSub, error: subError } = await supabase
        .from('commander_subscriptions')
        .insert({
          venue_id: venueId,
          owner_id: userId,
          tier,
          status: 'trialing',
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          stripe_payment_method_id: paymentMethodId || null,
          monthly_price: TIER_PRICES[tier].price,
          billing_email: ownerInfo.email,
          billing_name: ownerInfo.name,
          billing_address: { city: clubInfo.city, state: clubInfo.state, country: 'US' },
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (subError) {
        console.error('Subscription creation error:', subError);
      }
      subscriptionData = newSub;
    }

    // ─── 5. Staff record (owner role) ────────────────────────────────
    // Upsert so it doesn't fail if they already exist
    const { data: existingStaff } = await supabase
      .from('commander_staff')
      .select('id')
      .eq('venue_id', venueId)
      .eq('user_id', userId)
      .single();

    if (!existingStaff) {
      await supabase
        .from('commander_staff')
        .insert({
          venue_id: venueId,
          user_id: userId,
          name: ownerInfo.name,
          email: ownerInfo.email,
          phone: ownerInfo.phone,
          role: 'owner',
          permissions: ['all'],
          status: 'active',
          pin: null,
        });
    }

    // ─── 6. Social Hub page (best-effort) ────────────────────────────
    try {
      const socialResponse = await fetch(`${process.env.SOCIAL_HUB_API_URL}/api/create-club-page`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SOCIAL_HUB_API_KEY}`
        },
        body: JSON.stringify({
          venue_id: venueId,
          name: clubInfo.name,
          description: `${clubInfo.name} - Poker Room in ${clubInfo.city}, ${clubInfo.state}`,
          address: clubInfo.address,
          city: clubInfo.city,
          state: clubInfo.state,
          website: clubInfo.website,
          owner_id: userId
        })
      });

      if (socialResponse.ok) {
        const socialData = await socialResponse.json();
        await supabase
          .from('poker_venues')
          .update({
            social_hub_page_id: socialData.page_id,
            social_hub_page_url: socialData.page_url
          })
          .eq('id', venueId);
      }
    } catch (socialError) {
      console.error('Social Hub page creation error:', socialError);
    }

    // ─── 7. Welcome email (best-effort) ──────────────────────────────
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send-welcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: ownerInfo.email,
          name: ownerInfo.name,
          clubName: clubInfo.name,
          tier,
          loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/commander/login`
        })
      });
    } catch (emailError) {
      console.error('Welcome email error:', emailError);
    }

    // ─── Done ────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      venueId,
      userId,
      subscriptionId: subscriptionData?.id,
      stripeCustomerId,
      stripeSubscriptionId,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: error.message || 'Registration failed' });
  }
}
