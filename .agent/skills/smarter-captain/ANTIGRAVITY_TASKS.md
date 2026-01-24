# Antigravity Tasks - Smarter Captain

These are tasks that require external accounts, manual configuration, or human action that Claude cannot complete.

## Priority 1: Required for Production

### 1. Twilio SMS Setup
**Why:** SMS notifications for waitlist, tournaments, and announcements
**Steps:**
1. Create account at https://www.twilio.com
2. Verify your phone number
3. Buy a phone number (~$1/month)
4. Get credentials from Dashboard:
   - Account SID
   - Auth Token
5. Add to Vercel environment variables:
   ```
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   ```
6. Test by calling the notification API

**Cost:** ~$0.0075 per SMS sent

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
5. (Optional) Add auth token for source maps:
   ```
   SENTRY_AUTH_TOKEN=your_auth_token
   ```
6. Install package: `npm install @sentry/nextjs`

**Cost:** Free tier includes 5,000 errors/month

---

### 3. Supabase Production Setup
**Why:** Database and authentication for production
**Current:** Already configured (verify credentials are production-ready)
**Check:**
- [ ] Using production project (not development)
- [ ] Row Level Security enabled on all tables
- [ ] Backups configured
- [ ] SSL enforced

---

## Priority 2: Recommended for Launch

### 4. Push Notification Service
**Why:** Browser/mobile push notifications (alternative to SMS)
**Options:**
- **OneSignal** (recommended, free tier)
- Firebase Cloud Messaging
- Pusher

**Steps for OneSignal:**
1. Create account at https://onesignal.com
2. Create app → Select "Web Push"
3. Add keys to environment:
   ```
   NEXT_PUBLIC_ONESIGNAL_APP_ID=your_app_id
   ONESIGNAL_REST_API_KEY=your_rest_key
   ```

---

### 5. Email Service
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

### 6. Custom Domain
**Why:** Professional URL (captain.smarter.poker)
**Steps:**
1. Configure DNS for subdomain
2. Add to Vercel project settings
3. SSL auto-configured by Vercel

---

## Priority 3: Future Enhancements

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

### 9. QR Code Generator Service
**Why:** Club/group invite QR codes
**Note:** Currently using a simple URL-based approach. For fancy QR codes with logos:
- Use QR Code API (api.qrserver.com - free)
- Or integrate qrcode npm package (already works without external service)

---

### 10. Hardware Procurement (For Venue Displays)
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

# Twilio (Priority 1)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Sentry (Priority 1)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=

# Push Notifications (Priority 2)
NEXT_PUBLIC_ONESIGNAL_APP_ID=
ONESIGNAL_REST_API_KEY=

# Email (Priority 2)
RESEND_API_KEY=

# Payments (Priority 3)
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Maps (Priority 3)
NEXT_PUBLIC_GOOGLE_MAPS_KEY=
```

---

## Testing Checklist

After setting up each service, test:

- [ ] **Twilio:** Send test SMS via `/api/captain/notifications/send`
- [ ] **Sentry:** Trigger test error, verify in dashboard
- [ ] **Push:** Subscribe to notifications, send test push
- [ ] **Email:** Send test email via API

---

## Questions?

If any setup is unclear, the code has comments pointing to exactly what's needed.
Look for `SETUP REQUIRED` comments in:
- `src/lib/captain/twilio.js`
- `sentry.client.config.js`
- `sentry.server.config.js`
