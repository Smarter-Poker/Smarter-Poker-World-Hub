const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

(async () => {
    console.log('=== SECONDARY TABLE EXISTENCE CHECKS ===\n');

    const tables = [
        'commander_table_seats',
        'commander_table_displays',
        'commander_checkins',
        'commander_cashier_transactions',
        'commander_cash_transactions',
        'commander_transactions',
        'commander_comp_redemptions',
        'commander_notification_log',
        'commander_push_subscriptions',
        'commander_home_members',
        'commander_waitlist_group_members',
        'commander_club_announcements',
        'commander_venue_settings',
        'commander_service_requests',
        'commander_incidents',
        'commander_high_hands',
        'commander_promotion_awards',
        'commander_staff',
        'commander_members',
        'profiles',
        'poker_venues',
    ];

    for (const t of tables) {
        const { data, error } = await sb.from(t).select('*', { count: 'exact', head: true });
        if (error) {
            console.log('  [X] ' + t + ': ' + error.message.substring(0, 60));
        } else {
            console.log('  [OK] ' + t);
        }
    }

    // Verify the cashier.js API uses the correct table
    console.log('\n=== CASHIER TABLE CHECK ===');
    const cashierTables = [
        'commander_cashier_transactions',
        'commander_cash_register',
        'commander_transactions',
    ];
    for (const t of cashierTables) {
        const { data, error } = await sb.from(t).select('id').limit(1);
        console.log(error ? '  [X] ' + t + ': ' + error.message.substring(0, 60) : '  [OK] ' + t);
    }

    // Check what table cashier.js actually writes to
    console.log('\n=== CHECKING cashier.js ACTUAL INSERT TABLE ===');
    const { data: txn, error: txnErr } = await sb.from('commander_transactions').select('id, venue_id, type, amount').limit(1);
    console.log(txnErr ? '  [X] commander_transactions: ' + txnErr.message.substring(0, 60) : '  [OK] commander_transactions: ' + JSON.stringify(txn?.[0] || {}).substring(0, 80));

    process.exit(0);
})();
