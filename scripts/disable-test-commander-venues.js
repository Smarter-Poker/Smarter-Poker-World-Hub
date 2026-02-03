/**
 * Disable Test/Demo Venues in Commander
 * 
 * This script disables commander_enabled for all test/demo venues.
 * 
 * Usage: node scripts/disable-test-commander-venues.js
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing environment variables');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Test/Demo venues to disable
const TEST_VENUE_NAMES = [
    'Lodge Poker Club',
    'Bellagio',
    'Wynn Las Vegas',
    'ARIA Resort & Casino',
    'Venetian Las Vegas',
    'MGM Grand Poker Room',
    'Commerce Casino',
    'The Bicycle Casino',
    'Hustler Casino',
    'Bay 101 Casino',
    'Thunder Valley Casino',
    'Seminole Hard Rock Hollywood',
    'Seminole Hard Rock Tampa',
    'bestbet Jacksonville',
    'TGT Poker & Racebook',
    'Borgata Hotel Casino & Spa',
    'Harrahs Pompano Beach',
    'Parx Casino',
    'Live! Casino Philadelphia',
    'WinStar World Casino',
    'MGM National Harbor',
    'The Venetian Resort'
  ];

async function disableTestVenues() {
    console.log('Disabling test/demo venues...');

  const { data, error } = await supabase
      .from('poker_venues')
      .update({ commander_enabled: false })
      .in('name', TEST_VENUE_NAMES)
      .select('id, name');

  if (error) {
        console.error('Error:', error);
        process.exit(1);
  }

  console.log('Disabled', data?.length || 0, 'venues');
    data?.forEach(v => console.log(' -', v.name));
}

disableTestVenues();
