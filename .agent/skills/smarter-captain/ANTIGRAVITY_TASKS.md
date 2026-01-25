# Antigravity Tasks - Smarter Captain

These are tasks that require external accounts, manual configuration, or human action that Claude cannot complete.

## Priority 1: Required for Production

### 1. OneSignal Push Notifications (RECOMMENDED)
**Why:** Push notifications for waitlist, tournaments, and announcements - NO SMS COSTS!
**Steps:**
1. Go to https://onesignal.com and create FREE account
2. Click "New App/Website"
3. Enter app name: "Smarter Captain"
4. Select platform: **Web Push**
5. Site Setup:
   - Site URL: Your Vercel URL (e.g., https://your-app.vercel.app)
   - For local testing, enable "LOCAL TESTING"
6. Go to Settings → Keys & IDs
7. Copy:
   - **OneSignal App ID**
   - **Rest API Key**
8. Add to Vercel environment variables:
   ```
   NEXT_PUBLIC_ONESIGNAL_APP_ID=your_app_id_here
   ONESIGNAL_REST_API_KEY=your_rest_api_key_here
   ```

**Cost:** FREE (up to 10,000 subscribers)

**Benefits over SMS:**
- No per-message costs
- Works on desktop and mobile
- No verification hassles
- Rich notifications with buttons
- No phone number required from users

---

### 2. Sentry Error Monitoring Setup
**Why:** Catch and track production errors automatically
**Steps:**
1. Create account at https://sentry.io (free tier available)
2. Create new project → Select "Next.js"
3. Copy DSN from project settings
4. Add to Vercel environment variables:
   ```
   NEXT_PUBLIC_SENTRY_DSN=your_dsn_here
   SENTRY_DSN=your_dsn_here
   ```

**Cost:** Free tier includes 5,000 errors/month

---

### 3. Supabase Production Check
**Why:** Database and authentication for production
**Current:** Already configured (verify credentials are production-ready)
**Check:**
- [ ] Using production project (not development)
- [ ] Row Level Security enabled on all tables
- [ ] Backups configured
- [ ] SSL enforced

---

## Priority 2: Recommended for Launch

### 4. Email Service (Optional)
**Why:** Transactional emails (registration, receipts, reports)
**Options:**
- **Resend** (recommended, 100 emails/day free)
- SendGrid
- Postmark

**Steps for Resend:**
1. Create account at https://resend.com
2. Verify your domain
3. Get API key
4. Add to environment:
   ```
   RESEND_API_KEY=your_api_key
   ```

---

### 5. Custom Domain
**Why:** Professional URL (captain.smarter.poker)
**Steps:**
1. Configure DNS for subdomain
2. Add to Vercel project settings
3. SSL auto-configured by Vercel

---

## Priority 3: Future Enhancements

### 6. Twilio SMS (OPTIONAL - Skip if using OneSignal)
**Why:** SMS notifications as backup/alternative
**Note:** Twilio has strict verification requirements. Only set up if you specifically need SMS.
**Steps:**
1. Create account at https://www.twilio.com
2. Complete business verification
3. Register for A2P 10DLC (required for US)
4. Buy a phone number
5. Add to environment:
   ```
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   ```

**Cost:** ~$1/month + $0.0075 per SMS

---

### 7. Stripe Payments
**Why:** Tournament buy-ins, comp redemptions, subscriptions
**Steps:**
1. Create Stripe account
2. Add keys:
   ```
   STRIPE_SECRET_KEY=sk_live_xxx
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```

---

### 8. Google Maps API
**Why:** Home game location display, venue mapping
**Steps:**
1. Enable Maps JavaScript API in Google Cloud Console
2. Create API key with HTTP referrer restrictions
3. Add to environment:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_KEY=your_key
   ```

---

### 9. Hardware Procurement (For Venue Displays)
**Why:** Table displays, waitlist kiosks, tournament clocks
**Recommended:**
- **Fire TV Stick 4K** ($50) - For TV displays
- **iPad Mini** ($400) - For staff terminals
- **Samsung Tab A** ($200) - Budget staff tablet
- **Epson TM-T88** ($300) - Receipt printer for comps

---

## Environment Variables Summary

Add these to Vercel (Settings → Environment Variables):

```bash
# Required (already have these)
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# OneSignal Push Notifications (Priority 1 - FREE)
NEXT_PUBLIC_ONESIGNAL_APP_ID=
ONESIGNAL_REST_API_KEY=

# Sentry Error Monitoring (Priority 1 - FREE)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=

# Email - Optional (Priority 2)
RESEND_API_KEY=

# Twilio SMS - Optional (Priority 3)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Payments - Future (Priority 3)
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Maps - Future (Priority 3)
NEXT_PUBLIC_GOOGLE_MAPS_KEY=
```

---

## Quick Start Checklist

### Minimum Viable Setup (Do These First):
- [ ] **OneSignal:** Create account, get App ID + API Key, add to Vercel
- [ ] **Sentry:** Create account, get DSN, add to Vercel

### Testing After Setup:
- [ ] Open your app in browser
- [ ] Click "Enable Notifications" button
- [ ] Notification prompt should appear
- [ ] Trigger a test notification via API

---

## OneSignal Quick Test

After adding environment variables, test with this curl:

```bash
curl -X POST https://onesignal.com/api/v1/notifications \
  -H "Authorization: Basic YOUR_REST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "YOUR_APP_ID",
    "included_segments": ["Subscribed Users"],
    "headings": {"en": "Test"},
    "contents": {"en": "Push notifications working!"}
  }'
```

---

## Files Reference

Push notification code is in:
- `src/lib/captain/pushNotifications.js` - Server-side sending
- `src/components/captain/shared/PushNotificationProvider.jsx` - Client-side setup

Sentry config:
- `sentry.client.config.js`
- `sentry.server.config.js`
