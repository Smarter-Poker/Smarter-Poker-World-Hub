# Club Commander - Onboarding System Requirements

## Overview

When a poker room/club wants to use Club Commander software, they need:
1. **Self-service registration** - No manual account creation by Smarter.Poker
2. **Desktop application** - Downloadable installer with desktop shortcut
3. **Social Hub integration** - Auto-created club page on the social platform
4. **Separate login** - Club Commander has its own auth, separate from player accounts

---

## 1. Registration Flow

### URL: `/commander/register`

**Step 1: Club Information**
```
- Club/Venue Name (required)
- Address (street, city, state, zip)
- Phone Number
- Email
- Website (optional)
- Number of Poker Tables
- Games Offered (NLH, PLO, etc.)
```

**Step 2: Owner Account**
```
- Owner Name
- Email (will be login)
- Password
- Confirm Password
- Phone (for 2FA)
```

**Step 3: Subscription Tier**
```
Tier Options:
- STARTER ($99/mo): Up to 5 tables, basic features
- PROFESSIONAL ($199/mo): Up to 15 tables, tournaments, analytics
- ENTERPRISE ($399/mo): Unlimited tables, API access, white-label
```

**Step 4: Payment (Stripe)**
```
- Credit card input (Stripe Elements)
- Billing address
- Apply promo code (optional)
```

**Step 5: Confirmation**
```
- Account created confirmation
- Login credentials summary
- Download desktop app link
- Link to new Social Hub club page
- Quick start guide
```

---

## 2. Database Schema

### New Table: `commander_subscriptions`
```sql
CREATE TABLE commander_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  owner_id UUID REFERENCES auth.users(id),
  
  -- Subscription details
  tier TEXT NOT NULL CHECK (tier IN ('starter', 'professional', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  
  -- Stripe integration
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  
  -- Billing
  monthly_price DECIMAL(10,2) NOT NULL,
  billing_email TEXT NOT NULL,
  next_billing_date TIMESTAMPTZ,
  
  -- Limits based on tier
  max_tables INTEGER NOT NULL,
  max_staff INTEGER NOT NULL,
  features JSONB DEFAULT '{}',
  
  -- Timestamps
  trial_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_commander_subscriptions_venue ON commander_subscriptions(venue_id);
CREATE INDEX idx_commander_subscriptions_owner ON commander_subscriptions(owner_id);
CREATE INDEX idx_commander_subscriptions_stripe ON commander_subscriptions(stripe_customer_id);
```

### Update: `poker_venues` table
```sql
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS social_hub_page_id TEXT;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS social_hub_page_url TEXT;
```

---

## 3. Desktop Application (Electron)

### Structure
```
club-commander-desktop/
├── package.json
├── main.js              # Electron main process
├── preload.js           # Preload script
├── renderer/
│   └── index.html       # Loads the web app
├── assets/
│   ├── icon.icns        # macOS icon
│   ├── icon.ico         # Windows icon
│   └── icon.png         # Linux icon
├── build/
│   ├── entitlements.mac.plist
│   └── installer.nsh    # Windows installer script
└── electron-builder.yml # Build configuration
```

### Features
- **Auto-update**: Check for updates on launch
- **Desktop shortcut**: Created during installation
- **System tray**: Minimize to tray option
- **Offline indicator**: Show when connection lost
- **Print support**: Native print dialogs

### Build Targets
- Windows: `.exe` installer (NSIS)
- macOS: `.dmg` installer
- Linux: `.AppImage` and `.deb`

---

## 4. Social Hub Integration

### API Endpoint: `POST /api/social/create-club-page`

**Request:**
```json
{
  "venue_id": 1853,
  "name": "Bellagio Poker Room",
  "description": "World-famous poker room in Las Vegas",
  "logo_url": "https://...",
  "cover_photo_url": "https://...",
  "address": "3600 S Las Vegas Blvd",
  "city": "Las Vegas",
  "state": "NV",
  "website": "https://bellagio.mgmresorts.com/poker",
  "owner_id": "uuid-here"
}
```

**Response:**
```json
{
  "success": true,
  "page_id": "bellagio-poker-room",
  "page_url": "https://social.smarter.poker/club/bellagio-poker-room"
}
```

### Auto-Creation Flow
1. User completes registration Step 5
2. Backend calls Social Hub API to create page
3. `poker_venues.social_hub_page_id` updated
4. User shown link to their new club page

---

## 5. Implementation Priority

### Phase 1: Registration Flow (Week 1)
- [ ] Create `/commander/register` page
- [ ] Build multi-step wizard component
- [ ] Create `commander_subscriptions` table
- [ ] Integrate Stripe checkout
- [ ] Email welcome message with credentials

### Phase 2: Desktop App (Week 2)
- [ ] Set up Electron project
- [ ] Configure auto-update
- [ ] Build installers for Win/Mac/Linux
- [ ] Host downloads on CDN
- [ ] Add download links to registration confirmation

### Phase 3: Social Hub Integration (Week 3)
- [ ] Create Social Hub API endpoint
- [ ] Auto-create club page on registration
- [ ] Link venue to social page
- [ ] Add social feed widget to Commander dashboard

---

## 6. Pricing Tiers Detail

| Feature | Starter $99/mo | Professional $199/mo | Enterprise $399/mo |
|---------|---------------|---------------------|-------------------|
| Tables | Up to 5 | Up to 15 | Unlimited |
| Staff Accounts | 3 | 10 | Unlimited |
| Waitlist Management | ✅ | ✅ | ✅ |
| SMS Notifications | 100/mo | 500/mo | Unlimited |
| Tournaments | ❌ | ✅ | ✅ |
| Analytics | Basic | Advanced | Advanced + Export |
| API Access | ❌ | ❌ | ✅ |
| White-label | ❌ | ❌ | ✅ |
| Priority Support | ❌ | ✅ | ✅ + Dedicated |
| Social Hub Page | ✅ | ✅ | ✅ |
