// pages/api/commander/create-subscription.js
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { checkMemoryRateLimit } from '../../../src/lib/commander/rateLimit';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const TIER_PRICES = {
  home_game: {
    price: 99,
    priceId: process.env.STRIPE_HOME_GAME_PRICE_ID || 'price_home_game',
  },
  charity: {
    price: 199,
    priceId: process.env.STRIPE_CHARITY_PRICE_ID || 'price_charity',
  },
  club: {
    price: 399,
    priceId: process.env.STRIPE_CLUB_PRICE_ID || 'price_club',
  },
};

// Robust user lookup — tries multiple methods
async function findUserByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();

  // Method 0 (Most reliable): Look up via profiles table → get auth user ID
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', normalizedEmail)
      .single();
    if (profile?.id) {
      return { id: profile.id, email: profile.email || normalizedEmail };
    }
  } catch (e) {
    console.error('Method 0 (profiles) failed:', e.message);
  }

  // Method 1: Supabase admin getUserByEmail (if available in this SDK version)
  try {
    const { data, error } = await supabase.auth.admin.getUserById
      ? await (async () => {
        // Try listing with a small page and filtering
        const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 50, page: 1 });
        const found = listData?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);
        return { data: found ? { user: found } : null, error: null };
      })()
      : { data: null, error: null };
    if (data?.user) {
      return data.user;
    }
  } catch (e) {
    console.error('Method 1 failed:', e.message);
  }

  // Method 2: GoTrue REST API - paginated search (up to 5000 users)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    let page = 1;
    while (page <= 50) {
      const url = `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=100`;
      const resp = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json',
        },
      });
      if (!resp.ok) break;
      const data = await resp.json();
      const users = data.users || data;
      if (!Array.isArray(users) || users.length === 0) break;
      const found = users.find(u => u.email?.toLowerCase() === normalizedEmail);
      if (found) {
        return found;
      }
      if (users.length < 100) break;
      page++;
    }
  } catch (e) {
    console.error('Method 2 failed:', e.message);
  }

  return null;
}

export default async function handler(req, res) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Rate limit: 3 subscription attempts per minute per IP
  const fwd = req.headers['x-forwarded-for'];
  const ip = fwd ? fwd.split(',')[0].trim() : req.socket?.remoteAddress || '0';
  const rl = checkMemoryRateLimit(`sub:${ip}`, 3, 60000);
  if (!rl.allowed) { return res.status(429).json({ success: false, error: 'Too many requests. Please try again shortly.' }); }

  const { paymentMethodId, selectedTier, clubInfo, ownerInfo, existingAccount, skipPayment } = req.body;
  const tier = selectedTier || req.body.tier;

  if (!tier || !TIER_PRICES[tier]) {
    return res.status(400).json({ success: false, error: 'Invalid subscription tier' });
  }

  try {
    const email = ownerInfo.email?.toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // ─── Duplicate prevention: check if this email already has an active Commander subscription ──
    const { data: existingEmailSub } = await supabase
      .from('commander_subscriptions')
      .select('id, status, venue:poker_venues(name)')
      .eq('billing_email', email)
      .in('status', ['active', 'trialing'])
      .limit(1);

    if (existingEmailSub && existingEmailSub.length > 0) {
      const venueName = existingEmailSub[0].venue?.name || 'a venue';
      return res.status(400).json({
        success: false, error: `An active Club Commander account already exists for ${email} (${venueName}). Please sign in instead.`
      });
    }

    // ─── Duplicate prevention: check if a Commander venue already exists at this address ──
    const hasAddress = clubInfo.address && clubInfo.address.trim();
    if (hasAddress) {
      const { data: existingAddrVenue } = await supabase
        .from('poker_venues')
        .select('id, name')
        .eq('address', clubInfo.address.trim())
        .eq('commander_enabled', true)
        .limit(1);

      if (existingAddrVenue && existingAddrVenue.length > 0) {
        return res.status(400).json({
          success: false, error: `A Club Commander venue already exists at this address (${existingAddrVenue[0].name}). If this is your venue, please sign in instead.`
        });
      }
    }

    let userId = null;

    if (existingAccount) {
      // ─── Path A: Existing account — look up user, skip createUser ──
      const existingUser = await findUserByEmail(email);
      if (existingUser) {
        userId = existingUser.id;
        // Update their metadata to include venue_owner role
        try {
          await supabase.auth.admin.updateUserById(userId, {
            user_metadata: {
              full_name: ownerInfo.name,
              phone: ownerInfo.phone,
              role: 'venue_owner',
            }
          });
        } catch (e) { console.log('Metadata update non-critical error:', e.message); }
      } else {
        return res.status(400).json({
          success: false, error: 'No Smarter.Poker account found with this email. Please uncheck "I already have a Smarter.Poker account" and create a new account instead.'
        });
      }
    } else {
      // ─── Path B: New account — create user ─────────────────────────
      const password = ownerInfo.password || ('Tmp' + Math.random().toString(36).slice(2) + 'X1!');

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: ownerInfo.name,
          phone: ownerInfo.phone,
          role: 'venue_owner'
        }
      });

      if (!authError && authData?.user) {
        userId = authData.user.id;
      } else if (authError?.message?.toLowerCase().includes('already') ||
        authError?.message?.toLowerCase().includes('exists') ||
        authError?.message?.toLowerCase().includes('registered')) {
        // User already exists — look them up
        const existingUser = await findUserByEmail(email);
        if (existingUser) {
          userId = existingUser.id;
          try {
            // Set metadata + password (if provided) — enables email/password login
            // for users who originally signed up via Google OAuth
            const updatePayload = {
              user_metadata: {
                full_name: ownerInfo.name,
                phone: ownerInfo.phone,
                role: 'venue_owner',
              }
            };
            if (ownerInfo.password) {
              updatePayload.password = ownerInfo.password;
            }
            await supabase.auth.admin.updateUserById(userId, updatePayload);
          } catch (e) { /* non-critical */ }
        } else {
          return res.status(400).json({
            success: false, error: 'An account with this email already exists. Please check "I already have a Smarter.Poker account" and try again.'
          });
        }
      } else {
        // Unexpected error
        console.error('createUser error:', authError?.message);
        return res.status(400).json({
          success: false, error: `Registration issue: ${authError?.message || 'Unknown error'}. Please contact support at admin@smarter.poker.`
        });
      }
    }

    // ─── 2. Create or find the venue (handle optional address) ─────
    let venueId;
    const venueAddress = clubInfo.address?.trim() || null;
    const venueCity = clubInfo.city?.trim() || null;
    const venueState = clubInfo.state?.trim() || null;
    const venueZip = clubInfo.zip?.trim() || null;

    // Try to find existing venue by name + address (only if address provided)
    let existingVenue = null;
    if (venueAddress) {
      const { data: foundVenue } = await supabase
        .from('poker_venues')
        .select('id')
        .eq('name', clubInfo.name)
        .eq('address', venueAddress)
        .single();
      existingVenue = foundVenue;
    }

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
          email: clubInfo.email || email,
          website: clubInfo.website || null,
          poker_tables: parseInt(clubInfo.tables) || null,
          games_offered: clubInfo.gamesOffered,
          registration_completed_at: new Date().toISOString(),
          onboarding_step: 5,
          ...(venueZip ? { zip: venueZip } : {}),
        })
        .eq('id', venueId);
    } else {
      const venueInsert = {
        name: clubInfo.name,
        phone: clubInfo.phone || ownerInfo.phone,
        email: clubInfo.email || email,
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
      };
      // Address fields: city/state have NOT NULL constraints, always provide defaults
      if (venueAddress) venueInsert.address = venueAddress;
      if (venueZip) venueInsert.zip = venueZip;
      venueInsert.city = venueCity || '';
      venueInsert.state = venueState || '';
      venueInsert.country = 'US';

      const { data: newVenue, error: venueError } = await supabase
        .from('poker_venues')
        .insert(venueInsert)
        .select()
        .single();

      if (venueError) {
        console.error('Venue creation error:', venueError);
        return res.status(400).json({ success: false, error: 'Failed to create venue: ' + venueError.message });
      }

      venueId = newVenue.id;
    }

    // ─── 3. Stripe (if paying) ───────────────────────────────────────
    let stripeCustomerId = null;
    let stripeSubscriptionId = null;

    // SECURITY: Payment is required when Stripe is configured with real price IDs.
    // skipPayment from client is NEVER honored — only server config determines this.
    const hasRealStripeConfig = process.env.STRIPE_SECRET_KEY &&
      TIER_PRICES[tier].priceId &&
      !['price_home_game', 'price_charity', 'price_club'].includes(TIER_PRICES[tier].priceId);

    if (hasRealStripeConfig) {
      if (!paymentMethodId) {
        return res.status(400).json({ success: false, error: 'Payment method is required' });
      }
      const customer = await stripe.customers.create({
        email,
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
          monthly_price: TIER_PRICES[tier].price,
          billing_email: email,
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
          monthly_price: TIER_PRICES[tier].price,
          billing_email: email,
          billing_name: ownerInfo.name,
          billing_address: { city: venueCity || '', state: venueState || '', country: 'US' },
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (subError) console.error('Subscription creation error:', subError);
      subscriptionData = newSub;
    }

    // ─── 5. Staff record (owner role) ────────────────────────────────
    const { data: existingStaff } = await supabase
      .from('commander_staff')
      .select('id')
      .eq('venue_id', venueId)
      .eq('user_id', userId)
      .single();

    if (!existingStaff) {
      await supabase.from('commander_staff').insert({
        venue_id: venueId,
        user_id: userId,
        name: ownerInfo.name,
        email,
        phone: ownerInfo.phone,
        role: 'owner',
        permissions: ['all'],
        status: 'active',
      });
    }

    // ─── 5.5 Auto-provision tables ─────────────────────────────────
    const tableCount = parseInt(clubInfo.tables) || 0;
    if (tableCount > 0) {
      try {
        // Check how many tables already exist for this venue
        const { data: existingTables } = await supabase
          .from('commander_tables')
          .select('table_number')
          .eq('venue_id', venueId)
          .limit(100);
        const existingNumbers = new Set((existingTables || []).map(t => t.table_number));

        // Create missing tables (default 9-max, available status)
        const tablesToInsert = [];
        for (let i = 1; i <= tableCount; i++) {
          if (!existingNumbers.has(i)) {
            tablesToInsert.push({
              venue_id: venueId,
              table_number: i,
              table_name: `Table ${i}`,
              max_seats: 9,
              status: 'available',
            });
          }
        }
        if (tablesToInsert.length > 0) {
          await supabase.from('commander_tables').insert(tablesToInsert);
        }
      } catch (e) {
        console.error('Table auto-provision error (non-critical):', e.message);
      }
    }

    // ─── 6. Auto-create Social Club Page (direct DB insert) ──────────
    // Pages start as DRAFTS (is_public: false) — user must edit and publish.
    // Includes duplicate guard to prevent creating a second page for the same venue.
    try {
      // Duplicate guard: skip if a social page already exists for this venue
      const { data: existingPage } = await supabase
        .from('social_pages')
        .select('id')
        .eq('linked_venue_id', String(venueId))
        .limit(1);

      if (existingPage && existingPage.length > 0) {
        console.log(`[Registration] Club page already exists for venue ${venueId}, skipping auto-create.`);
      } else {
        const pageSlug = clubInfo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60) + '-' + Date.now().toString(36);
        const referralCode = pageSlug.substring(0, 20) + '-' + Math.random().toString(36).substring(2, 6);

        const { data: newPage, error: pageError } = await supabase
          .from('social_pages')
          .insert({
            owner_id: userId,
            name: clubInfo.name,
            slug: pageSlug,
            page_type: 'club',
            description: `${clubInfo.name}${venueCity && venueState ? ` — Poker in ${venueCity}, ${venueState}` : ''}`,
            category: 'poker',
            linked_venue_id: String(venueId),
            location_city: venueCity || '',
            location_state: venueState || '',
            is_public: false, // ← DRAFT MODE — not visible in public listings until user publishes
            allow_member_posts: true,
            metadata: {
              source: 'commander_registration',
              referral_code: referralCode,
              status: 'draft',
              needs_setup: true
            }
          })
          .select('id')
          .single();

        if (!pageError && newPage) {
          // Auto-follow as owner
          await supabase.from('social_page_followers').insert({
            page_id: newPage.id,
            user_id: userId,
            role: 'owner',
            status: 'approved'
          });
          console.log(`[Registration] ✅ Club page auto-created (DRAFT): ${clubInfo.name} (ID: ${newPage.id})`);
        } else {
          console.error('[Registration] Club page auto-create failed:', pageError?.message);
        }
      }
    } catch (e) { console.error('[Registration] Club page auto-create error (non-critical):', e.message); }

    // ─── 7. Welcome email (best-effort) ──────────────────────────────
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send-welcome`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
        },
        body: JSON.stringify({
          to: email, name: ownerInfo.name, clubName: clubInfo.name,
          tier, loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/commander/login`
        })
      });
    } catch (e) { /* non-critical */ }

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
    return res.status(500).json({ success: false, error: error.message || 'Registration failed' });
  }
}
