---
description: Enable Apple and Facebook OAuth providers in Supabase for social sign-in
---

# Enable Social OAuth Providers

The sign-in/sign-up UI buttons are already built. Google is fully enabled. Use this guide to add Apple and Facebook when ready.

## Supabase Project Info
- **Project Ref**: `kuklfnapbkmacvwxktbh`
- **Callback URL**: `https://kuklfnapbkmacvwxktbh.supabase.co/auth/v1/callback`
- **Dashboard**: https://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh/auth/providers

---

## Facebook OAuth Setup

### Step 1: Create a Meta Developer Account
1. Go to https://developers.facebook.com
2. Log in with a Facebook account
3. If first time, click "Get Started" and complete the developer registration

### Step 2: Create a Facebook App
1. Go to https://developers.facebook.com/apps/create/
2. Select app type: **Consumer**
3. App name: `Smarter.Poker`
4. Contact email: your email
5. Click "Create App"

### Step 3: Add Facebook Login Product
1. In the app dashboard, find "Add a Product"
2. Find **Facebook Login** and click "Set Up"
3. Choose **Web** platform
4. Site URL: `https://smarter.poker`
5. Click Save

### Step 4: Configure OAuth Settings
1. Go to Facebook Login → Settings (left sidebar)
2. Under **Valid OAuth Redirect URIs**, add:
   ```
   https://kuklfnapbkmacvwxktbh.supabase.co/auth/v1/callback
   ```
3. Click "Save Changes"

### Step 5: Get App Credentials
1. Go to Settings → Basic (left sidebar)
2. Copy the **App ID** (this is your Client ID)
3. Copy the **App Secret** (click "Show", this is your Client Secret)

### Step 6: Enable in Supabase
1. Go to https://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh/auth/providers
2. Click **Facebook** row
3. Toggle **Facebook enabled** ON
4. Paste **App ID** into "Facebook client ID"
5. Paste **App Secret** into "Facebook secret"
6. Click **Save**

### Step 7: Go Live (Required for Public Users)
1. In the Facebook app dashboard, toggle the app from **Development** to **Live**
2. This requires a Privacy Policy URL — use: `https://smarter.poker/terms`
3. You may need to complete Facebook's App Review for the `email` permission

---

## Apple OAuth Setup

> **Prerequisite**: Apple Developer Program membership ($99/year) at https://developer.apple.com/programs/

### Step 1: Register an App ID
1. Go to https://developer.apple.com/account/resources/identifiers/list
2. Click the **+** button
3. Select **App IDs** → Continue
4. Select **App** type → Continue
5. Description: `Smarter Poker`
6. Bundle ID: `com.smarterpoker.web` (Explicit)
7. Under Capabilities, check **Sign In with Apple**
8. Click Continue → Register

### Step 2: Create a Services ID
1. Go to https://developer.apple.com/account/resources/identifiers/list/serviceId
2. Click **+** → Select **Services IDs** → Continue
3. Description: `Smarter Poker Web`
4. Identifier: `com.smarterpoker.web.signin`
5. Click Continue → Register
6. Click on the newly created Service ID
7. Check **Sign In with Apple** → click **Configure**
8. Primary App ID: Select `Smarter Poker` (from Step 1)
9. Domains: `kuklfnapbkmacvwxktbh.supabase.co`
10. Return URLs: `https://kuklfnapbkmacvwxktbh.supabase.co/auth/v1/callback`
11. Click Save → Continue → Save

### Step 3: Create a Key for Sign In with Apple
1. Go to https://developer.apple.com/account/resources/authkeys/list
2. Click **+** → Key Name: `Smarter Poker Auth Key`
3. Check **Sign In with Apple** → Configure
4. Primary App ID: Select `Smarter Poker`
5. Click Save → Continue → Register
6. **Download the .p8 key file** (you can only download it ONCE)
7. Note the **Key ID** displayed on screen

### Step 4: Generate the Client Secret
Apple doesn't use a simple secret — it uses a JWT signed with your .p8 key. Supabase handles this if you provide:
- **Service ID** (from Step 2): e.g., `com.smarterpoker.web.signin`
- **Secret Key** (contents of the .p8 file)
- **Team ID** (from Apple Developer account → Membership)
- **Key ID** (from Step 3)

### Step 5: Enable in Supabase
1. Go to https://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh/auth/providers
2. Click **Apple** row
3. Toggle **Apple enabled** ON
4. Enter the **Service ID** as "Client ID"
5. Paste the **contents of the .p8 file** as "Secret Key"
6. Click **Save**

> ⚠️ Apple secret keys expire every 6 months. Set a calendar reminder to regenerate.

---

## Currently Enabled Providers

| Provider | Status | Notes |
|----------|--------|-------|
| Email    | ✅ Enabled | Default |
| Phone    | ✅ Enabled | Twilio SMS |
| Google   | ✅ Enabled | GCP project under smarterpoker45@gmail.com |
| Apple    | ❌ Disabled | Needs Apple Developer Program |
| Facebook | ❌ Disabled | Needs Meta Developer account |
