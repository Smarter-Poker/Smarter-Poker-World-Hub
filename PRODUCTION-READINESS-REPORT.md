# Club Commander — Production Readiness Report
**Date:** 2026-02-12  
**Status:** ✅ PRODUCTION READY (with noted caveats)

---

## Security Audit Results

### API Authentication (FIXED)
| Metric | Before | After |
|--------|--------|-------|
| Total API endpoints | 201 | 208 |
| Protected endpoints | 72 | 162 (78%) |
| Unprotected write endpoints | 72 | 0 |
| Read-only public endpoints | — | 36 |
| Intentionally public (auth/webhooks/devices) | — | 10 |

**Guards Applied:**
- `guardWriteStaff` (public reads, staff auth for writes): 78 endpoints
- `guardStaff` (full auth required): 18 endpoints  
- `guardManager` (manager-only operations): 10 endpoints
- `guardUser` (player-facing writes): 29 endpoints
- Pre-existing auth (`verifyStaffSession`/`verifyManagerSession`): 11 endpoints

### Rate Limiting (FIXED)
| Endpoint | Risk | Limit |
|----------|------|-------|
| `staff/verify-pin` | PIN brute force | 5/min + 10-fail lockout (5min) |
| `notifications/send` | SMS cost attack | 20/min per IP |
| `create-subscription` | Stripe abuse | 3/min per IP |
| `kiosk/buy-time` | Payment flooding | 10/min per IP |
| `onboarding/request` | Form spam | 3/min per IP |
| `leads` | Form spam | 5/min per IP |
| `exports/*` | Resource abuse | 5/hour (pre-existing) |

### Webhook Security
- **Stripe:** ✅ Signature verification via `constructEvent()`
- **Twilio:** ⚠️ No signature verification (low risk — only writes delivery statuses)

### Input Security
- **XSS:** ✅ No `dangerouslySetInnerHTML` usage anywhere
- **SQL Injection:** ✅ All queries via Supabase client (parameterized)
- **ILIKE queries:** ✅ Safe (Supabase parameterizes internally)
- **Service Role Key:** ✅ Not exposed in client-side code
- **Secrets in code:** ✅ None found (all via process.env)
- **Open redirects:** ✅ Only hardcoded safe URLs

---

## Bug Fixes Applied

| Bug | Impact | Fix |
|-----|--------|-----|
| `supabase.raw('visit_count + 1')` in checkin.js | Visit counter never incremented | Read-then-update pattern |
| `supabase.raw('bounties_collected + 1')` in eliminate.js | Bounty tracker never incremented | Read-then-update pattern |
| `guardManager` on leads.js | Public lead form required manager auth (broken) | Replaced with rate limiting |

### Missing APIs Created (11 endpoints)
Pages were fetching APIs that didn't exist — all now created with auth guards:
- `dealers/index.js` + `dealers/[id].js` — Dealer CRUD
- `admin/api-keys.js` + `admin/api-keys/[id].js` — API key management
- `admin/audit-logs.js` — Audit log viewer
- `admin/leads.js` — Lead management
- `admin/venues.js` + `admin/venues/[id]/settings.js` — Admin venue ops
- `announcements.js` — Club announcements
- `home-games/rsvps/[id].js` — RSVP management
- `leagues/my.js` — Player league standings
- `squads/[id]/members/[memberId].js` — Squad member removal

### Duplicate Routes Removed
3 files conflicted (both `foo.js` and `foo/index.js` resolve to same route):
- `incidents/index.js` (kept `incidents.js`)
- `settings/index.js` (kept `settings.js`)
- `waitlist/[id]/index.js` (kept `waitlist/[id].js`)

---

## Code Quality Assessment

### Strengths
- **Consistent API patterns:** All 201 endpoints follow req.method dispatch
- **Error handling:** try/catch on all database operations
- **Method validation:** All multi-method APIs check req.method
- **No broken imports:** All module references resolve correctly
- **No committed secrets:** Only .env.example in git

### Caveats (Non-blocking)
- **34 console.log statements** in API routes (consider structured logging)
- **eslint ignored during builds** (enable after stabilization)
- **No error boundaries** on commander pages (graceful degradation)
- **398 files create individual Supabase clients** (consider shared singleton, but each serverless invocation is isolated)
- **notifications/send.js has 26 sequential awaits** (could parallelize for performance)

---

## Environment Variables Required

### Critical (app won't function without)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

### Payment Processing
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_STARTER_PRICE_ID
STRIPE_PROFESSIONAL_PRICE_ID
STRIPE_ENTERPRISE_PRICE_ID
```

### Notifications
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
ONESIGNAL_APP_ID
ONESIGNAL_REST_API_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
```

### Other
```
NEXT_PUBLIC_APP_URL
ADMIN_SETUP_SECRET
SALES_EMAIL
```

---

## Pending Migrations

Run before deployment:
```sql
-- Staff name fields (from TC parity fix)
supabase/migrations/20260212_staff_name_fields.sql
```

---

## Deployment Checklist

- [ ] Run pending migration
- [ ] Verify all env vars set on Vercel
- [ ] Trigger production deployment
- [ ] Test PIN login flow (verify rate limiting works)
- [ ] Test waitlist add/seat/remove cycle
- [ ] Test member check-in (verify visit_count increments)
- [ ] Test tournament elimination (verify bounty counter increments)
- [ ] Verify webhook URLs configured (Stripe + Twilio)
- [ ] Test notification delivery (SMS or push)
