# Club Commander - Turnkey Deployment Strategy

## Overview

Club Commander uses a **Hardware-as-a-Service (HaaS)** deployment model where clubs receive pre-configured devices that work immediately upon login. Zero IT knowledge required.

---

## Device Strategy

### Device Matrix

| Device | Role | Use Case | Est. Cost |
|--------|------|----------|-----------|
| iPad Pro 12.9" | Floor Station | Main command center for brush/floor staff | $1,099 |
| iPad 10th Gen | Manager Station | Back office, reports, tournament control | $449 |
| iPad Mini 6 | Table Display | Waitlist position, tournament clock, promos | $499 |
| Samsung Galaxy Tab A8 | Budget Table Display | Lower-cost alternative for smaller rooms | $229 |
| Samsung Galaxy Tab S6 Lite | Budget Floor Station | Android alternative for cost-conscious clubs | $349 |
| Wall-Mounted TV | Lobby Display | Large waitlist/tournament display | Venue-provided |

### Recommended Configurations

#### Small Room (2-6 tables)
```
1x iPad 10th Gen (Floor/Manager combo)     $449
3x iPad Mini or Galaxy Tab A8              $687 - $1,497
1x Wall Mount Kit                          $50
                                           ─────────────
Total Hardware:                            $1,186 - $1,996
```

#### Medium Room (7-15 tables)
```
1x iPad Pro 12.9" (Floor Station)          $1,099
1x iPad 10th Gen (Manager Station)         $449
8x iPad Mini (Table Displays)              $3,992
2x Wall Mount Kits                         $100
                                           ─────────────
Total Hardware:                            $5,640
```

#### Large Room (15+ tables)
```
2x iPad Pro 12.9" (Floor Stations)         $2,198
2x iPad 10th Gen (Manager/TD Stations)     $898
20x iPad Mini (Table Displays)             $9,980
4x Wall Mount Kits                         $200
1x Digital Signage License                 $0 (included)
                                           ─────────────
Total Hardware:                            $13,276
```

---

## Hardware Program Options

### Option 1: Buy Outright
- Club purchases devices
- Smarter.Poker pre-configures before shipping
- Club owns hardware
- Software subscription separate

### Option 2: Lease Program
- $99-299/month all-inclusive
- Includes hardware + software + support
- Device replacement if damaged
- Upgrade to newer devices every 2-3 years
- No upfront capital expense

### Option 3: BYOD (Bring Your Own Device)
- Club uses existing iPads/tablets
- Download Club Commander from App Store
- Reduced subscription cost
- Must meet minimum specs

---

## Pre-Configuration Process

### What Smarter.Poker Does Before Shipping

```
1. DEVICE SETUP
   ├── Install Club Commander app
   ├── Configure MDM (Mobile Device Management)
   ├── Set device name (e.g., "Lodge-Floor-1", "Lodge-Table-5")
   ├── Lock to Club Commander app (Guided Access / Kiosk Mode)
   ├── Disable unnecessary features
   ├── Configure auto-updates
   └── Set power management (never sleep when charging)

2. VENUE CONFIGURATION
   ├── Pre-load venue profile
   ├── Set venue branding (logo, colors)
   ├── Configure table layout
   ├── Set up staff accounts (PINs ready)
   ├── Configure game types and stakes
   └── Set notification preferences

3. TESTING
   ├── Verify app launches correctly
   ├── Test all device roles (floor, table, manager)
   ├── Confirm push notifications work
   ├── Test offline mode
   └── Verify auto-reconnect

4. PACKAGING
   ├── Include charging cables
   ├── Include table stands/mounts
   ├── Include quick-start guide
   ├── Include support contact card
   └── Ship via insured carrier
```

### First-Time Setup at Venue (5 minutes)

```
STAFF DOES:
1. Unbox devices
2. Plug in to power
3. Connect to venue WiFi
4. Enter 6-digit activation code (provided by Smarter.Poker)
5. Done - system is live

THAT'S IT.
```

---

## App Architecture for Multi-Device

### Progressive Web App (PWA) + Native Apps

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLUB COMMANDER APPS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │   iOS Native     │  │  Android Native  │  │     PWA      │  │
│  │   (App Store)    │  │  (Play Store)    │  │  (Browser)   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘  │
│           │                     │                    │          │
│           └─────────────────────┴────────────────────┘          │
│                                 │                               │
│                    ┌────────────▼────────────┐                  │
│                    │    Shared React Native   │                  │
│                    │    / Next.js Codebase    │                  │
│                    └────────────┬────────────┘                  │
│                                 │                               │
│           ┌─────────────────────┼─────────────────────┐        │
│           │                     │                     │        │
│           ▼                     ▼                     ▼        │
│    ┌─────────────┐      ┌─────────────┐      ┌─────────────┐  │
│    │ Floor Mode  │      │ Table Mode  │      │Manager Mode │  │
│    │ (Full UI)   │      │ (Display)   │      │ (Reports)   │  │
│    └─────────────┘      └─────────────┘      └─────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Device Role Detection

```typescript
interface DeviceConfig {
  deviceId: string;
  venueId: string;
  deviceRole: 'floor' | 'table' | 'manager' | 'kiosk' | 'display';
  displayName: string;

  // Role-specific config
  tableConfig?: {
    tableNumber: number;
    showWaitlist: boolean;
    showPromos: boolean;
    showTournamentClock: boolean;
    rotationInterval: number;     // seconds between screens
  };

  floorConfig?: {
    canManageWaitlist: boolean;
    canSeatPlayers: boolean;
    canOpenTables: boolean;
    canRunTournaments: boolean;
    requirePinForActions: boolean;
  };

  managerConfig?: {
    canViewReports: boolean;
    canManageStaff: boolean;
    canEditSettings: boolean;
    canAccessFinancials: boolean;
  };
}
```

### Automatic Role UI

When device boots:

```typescript
// On app launch
const deviceConfig = await fetchDeviceConfig(deviceId);

switch (deviceConfig.deviceRole) {
  case 'floor':
    return <FloorStationUI config={deviceConfig.floorConfig} />;

  case 'table':
    return <TableDisplayUI config={deviceConfig.tableConfig} />;

  case 'manager':
    return <ManagerDashboardUI config={deviceConfig.managerConfig} />;

  case 'kiosk':
    return <PlayerKioskUI />;

  case 'display':
    return <WallDisplayUI />;
}
```

---

## Device Management (MDM)

### Mobile Device Management Features

Using Apple Business Manager + Jamf (or similar):

```
REMOTE CAPABILITIES:
├── Push app updates silently
├── Lock/wipe lost devices
├── Monitor device health
├── Track device location
├── Push configuration changes
├── Remote restart
├── View battery/storage status
└── Bulk device enrollment

RESTRICTIONS APPLIED:
├── Disable App Store (prevent other apps)
├── Disable Safari (prevent web browsing)
├── Disable Settings changes
├── Disable AirDrop
├── Disable screen recording
├── Enable Guided Access (kiosk mode)
├── Require passcode for device
└── Auto-lock disabled when charging
```

### Device Health Dashboard

Smarter.Poker admin can monitor all deployed devices:

```
┌─────────────────────────────────────────────────────────────────┐
│  DEVICE FLEET MANAGEMENT                           [Refresh]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  The Lodge Card Club (Austin, TX)                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Device          Role      Status    Battery   Last Seen   │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │  Lodge-Floor-1   Floor     Online    87%       Just now    │ │
│  │  Lodge-Floor-2   Floor     Online    100%      Just now    │ │
│  │  Lodge-Manager   Manager   Online    92%       2 min ago   │ │
│  │  Lodge-Table-1   Table     Online    100%      Just now    │ │
│  │  Lodge-Table-2   Table     Online    100%      Just now    │ │
│  │  Lodge-Table-3   Table     Offline   --        3 hours ago │ │
│  │  Lodge-Table-4   Table     Online    100%      Just now    │ │
│  │  Lodge-Kiosk-1   Kiosk     Online    N/A       Just now    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [View All 47 Venues]                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Offline Mode

### Critical for Reliability

Devices must work even if internet drops:

```typescript
interface OfflineCapabilities {
  // Always available offline
  viewCurrentWaitlist: true;
  viewRunningGames: true;
  viewTournamentClock: true;
  displayPromotions: true;

  // Queued for sync when online
  addToWaitlist: true;          // Queued, syncs when online
  seatPlayer: true;             // Queued
  callPlayer: true;             // Queued (SMS won't send until online)
  updateGameStatus: true;       // Queued

  // Requires online
  sendNotifications: false;     // Needs network
  viewReports: false;           // Needs fresh data
  processPayments: false;       // Needs network
}
```

### Sync Strategy

```typescript
// Offline-first with background sync
const syncManager = {
  // Queue actions when offline
  queueAction(action: ClubCommanderAction) {
    const queue = getOfflineQueue();
    queue.push({ ...action, timestamp: Date.now() });
    saveOfflineQueue(queue);
  },

  // Sync when connection restored
  async syncWhenOnline() {
    const queue = getOfflineQueue();

    for (const action of queue) {
      try {
        await sendToServer(action);
        removeFromQueue(action.id);
      } catch (error) {
        // Keep in queue, retry later
        console.error('Sync failed:', action.id);
      }
    }
  },

  // Real-time sync for critical data
  subscribeToUpdates(venueId: string) {
    supabase
      .channel(`venue:${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        updateLocalCache(payload);
      })
      .subscribe();
  }
};
```

---

## Table Display Modes

### Mode 1: Waitlist Position Display

```
┌─────────────────────────────────────────┐
│                                         │
│           TABLE 5 - 2/5 NLH             │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │                                   │ │
│  │         WAITLIST                  │ │
│  │                                   │ │
│  │    1. John S.         12 min     │ │
│  │    2. Maria G.         8 min     │ │
│  │    3. App User         2 min     │ │
│  │    4. Walk-in          1 min     │ │
│  │                                   │ │
│  │    ────────────────────────────   │ │
│  │    4 players waiting             │ │
│  │                                   │ │
│  └───────────────────────────────────┘ │
│                                         │
│  Scan to join waitlist:    [QR CODE]   │
│                                         │
└─────────────────────────────────────────┘
```

### Mode 2: Tournament Clock

```
┌─────────────────────────────────────────┐
│                                         │
│         DAILY $150 NLH                  │
│                                         │
│              LEVEL 8                    │
│                                         │
│         ┌─────────────┐                │
│         │             │                │
│         │   12:47     │                │
│         │             │                │
│         └─────────────┘                │
│                                         │
│       BLINDS: 400 / 800 / 800          │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  NEXT: 500/1000/1000 then 15 min BREAK │
│                                         │
│  Players: 34/67    Avg: 29,552         │
│                                         │
└─────────────────────────────────────────┘
```

### Mode 3: Promotion Display

```
┌─────────────────────────────────────────┐
│                                         │
│          HIGH HAND BONUS                │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │                                   │ │
│  │   CURRENT HIGH HAND               │ │
│  │                                   │ │
│  │   Aces Full of Kings              │ │
│  │   Sarah K. - Table 3              │ │
│  │                                   │ │
│  │   Prize: $500                     │ │
│  │                                   │ │
│  │   Time remaining: 2:34:17         │ │
│  │                                   │ │
│  └───────────────────────────────────┘ │
│                                         │
│  Beat this hand to win                 │
│                                         │
└─────────────────────────────────────────┘
```

### Mode 4: Auto-Rotation

Table displays cycle through relevant content:

```typescript
const tableDisplayRotation = [
  { component: 'WaitlistDisplay', duration: 15 },    // 15 seconds
  { component: 'TournamentClock', duration: 10 },    // If tournament running
  { component: 'PromotionDisplay', duration: 10 },   // If active promo
  { component: 'LeaderboardDisplay', duration: 10 }, // Monthly leaders
  { component: 'VenueAnnouncement', duration: 5 },   // If announcement set
];
```

---

## Floor Station Interface

### Optimized for iPad Pro 12.9"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLUB COMMANDER                                  The Lodge    Staff: Mike  │
├────────────────────────────────────┬────────────────────────────────────────┤
│                                    │                                        │
│  ACTIVE GAMES                      │  QUICK ACTIONS                         │
│  ─────────────                     │  ─────────────                         │
│                                    │                                        │
│  ┌──────────┐ ┌──────────┐        │  ┌────────────────────────────────┐   │
│  │ Table 1  │ │ Table 2  │        │  │                                │   │
│  │ 1/3 NLH  │ │ 1/3 NLH  │        │  │     Call Next Player           │   │
│  │ 9/9 FULL │ │ 9/9 FULL │        │  │                                │   │
│  └──────────┘ └──────────┘        │  └────────────────────────────────┘   │
│                                    │                                        │
│  ┌──────────┐ ┌──────────┐        │  ┌────────────────────────────────┐   │
│  │ Table 3  │ │ Table 4  │        │  │                                │   │
│  │ 2/5 NLH  │ │ 2/5 NLH  │        │  │     Add Walk-In                │   │
│  │ 7/9      │ │ 9/9 FULL │        │  │                                │   │
│  └──────────┘ └──────────┘        │  └────────────────────────────────┘   │
│                                    │                                        │
│  ┌──────────┐ ┌──────────┐        │  ┌────────────────────────────────┐   │
│  │ Table 5  │ │ Table 6  │        │  │                                │   │
│  │ 5/10 NLH │ │ 1/2 PLO  │        │  │     Open New Table             │   │
│  │ 5/9      │ │ 7/9      │        │  │                                │   │
│  └──────────┘ └──────────┘        │  └────────────────────────────────────┘   │
│                                    │                                        │
├────────────────────────────────────┤  ┌────────────────────────────────┐   │
│                                    │  │                                │   │
│  WAITLISTS                         │  │     View All Waitlists         │   │
│  ──────────                        │  │                                │   │
│                                    │  └────────────────────────────────┘   │
│  1/3 NLH ............... 8        │                                        │
│  2/5 NLH ............... 3        │                                        │
│  5/10 NLH .............. 0        ├────────────────────────────────────────┤
│  1/2 PLO ............... 2        │                                        │
│                                    │  RECENT ACTIVITY                       │
│                                    │  ───────────────                       │
│                                    │                                        │
│                                    │  7:42 PM - John S. seated T1-S5       │
│                                    │  7:40 PM - New signup: PokerPro99     │
│                                    │  7:38 PM - Text sent to Maria G.      │
│                                    │  7:35 PM - High hand: Sarah K. $500   │
│                                    │                                        │
├────────────────────────────────────┴────────────────────────────────────────┤
│  [Tables]    [Waitlist]    [Tournament]    [Players]    [Promos]   [More]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Deployment Packages

### Starter Package - $299/month

**Ideal for: Home game hosts, small clubs (1-3 tables)**

Includes:
- 1x Samsung Galaxy Tab A8 (Floor/Table combo)
- Software license
- Basic support (email)
- Free shipping

### Club Package - $499/month

**Ideal for: Small to medium clubs (4-8 tables)**

Includes:
- 1x iPad 10th Gen (Floor Station)
- 4x iPad Mini (Table Displays)
- Wall mount hardware
- Software license
- Priority support (phone + email)
- Free shipping
- On-site setup assistance (remote)

### Pro Package - $799/month

**Ideal for: Medium clubs (8-15 tables)**

Includes:
- 1x iPad Pro 12.9" (Floor Station)
- 1x iPad 10th Gen (Manager Station)
- 8x iPad Mini (Table Displays)
- Wall mount hardware
- Kiosk stand
- Software license
- Priority support (phone + email + chat)
- Free shipping
- Remote setup assistance
- Quarterly business review

### Enterprise Package - Custom Pricing

**Ideal for: Large rooms (15+ tables), casinos**

Includes:
- Custom hardware configuration
- Multiple floor stations
- Unlimited table displays
- Digital signage integration
- RFID integration (if available)
- Dedicated account manager
- 24/7 support
- On-site installation
- Staff training
- Custom integrations
- SLA guarantees

---

## Onboarding Timeline

### Week -2: Pre-Deployment
```
Day 1-3: Discovery call, venue assessment
Day 4-7: Hardware ordered, configuration begins
Day 8-14: Devices configured, tested, shipped
```

### Week 0: Go-Live
```
Day 1: Devices arrive, staff unboxes
Day 1: 30-minute setup call (connect WiFi, enter code)
Day 1: System live, staff training (1-2 hours)
Day 2-3: Shadow support (team monitors, assists)
Day 4-7: Daily check-ins, answer questions
```

### Week 1+: Ongoing
```
Weekly: Usage report email
Monthly: Optimization recommendations
Quarterly: Business review (Pro/Enterprise)
Always: Support available
```

---

## Support Model

### Tier 1: Self-Service
- In-app help center
- Video tutorials
- FAQ database
- Community forum

### Tier 2: Standard Support
- Email support (24-48 hour response)
- In-app chat (business hours)
- Phone support (business hours)

### Tier 3: Priority Support (Pro+)
- Email support (4-hour response)
- In-app chat (extended hours)
- Phone support (extended hours)
- Screen sharing assistance

### Tier 4: Enterprise Support
- Dedicated Slack channel
- Named account manager
- 24/7 emergency line
- On-site support (if needed)
- Custom training sessions

---

## Hardware Lifecycle

### Refresh Cycle

| Plan | Refresh Period | Process |
|------|---------------|---------|
| Lease | Every 2 years | New devices shipped, return old |
| Buy | N/A | Club responsible for upgrades |

### Warranty & Replacement

- All leased devices include AppleCare+
- Damaged devices replaced within 48 hours
- Lost/stolen devices remotely wiped
- Refurbished replacement for accidental damage

### End of Life

When venue cancels:
1. Data export provided (30 days)
2. Devices collected (prepaid shipping)
3. Devices wiped and refurbished
4. Account deactivated

---

## Technical Requirements

### Network Requirements

```
MINIMUM:
- 10 Mbps download / 5 Mbps upload
- Stable WiFi (2.4GHz or 5GHz)
- WPA2 security minimum

RECOMMENDED:
- 50+ Mbps download / 25+ Mbps upload
- Dedicated WiFi network for devices
- 5GHz preferred for lower latency
- Ethernet backup for floor stations
```

### Firewall/Network Ports

```
REQUIRED OUTBOUND:
- HTTPS (443) - API communication
- WSS (443) - WebSocket for real-time
- APNS (5223) - Apple push notifications
- FCM (5228-5230) - Android push notifications
```

---

## Security & Compliance

### Data Security

- All data encrypted in transit (TLS 1.3)
- All data encrypted at rest (AES-256)
- No PII stored on devices
- Automatic logout after inactivity
- PIN required for sensitive actions

### Compliance

- PCI-DSS compliant (no card data stored)
- SOC 2 Type II (in progress)
- CCPA compliant
- Gaming commission compatible

---

## Summary

The turnkey deployment model removes every barrier:

| Barrier | Solution |
|---------|----------|
| "We don't have IT staff" | Pre-configured devices, 5-minute setup |
| "Hardware is expensive" | Lease option, no upfront cost |
| "Training is hard" | Intuitive UI, video tutorials, live support |
| "What if it breaks?" | 48-hour replacement, included warranty |
| "We're not tech savvy" | Just connect WiFi and enter code |

**The result: Any poker room can go from zero to live in one day.**
