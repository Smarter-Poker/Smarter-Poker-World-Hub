const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VENUE_ID = '1996';
const TOURN_ID = '93feb3e1-8483-4274-9fb8-aeec078c1d35'; // The LIVE DATA TEST TOURNAMENT under Club JAQK
const PLAYER_ID = 'dca6c345-c2ab-456f-98d9-dfbca3a43f7d';
const PLAYER_NAME = 'Mike Johnson';

// We need to simulate the `buildReceiptHtml` logic that the frontend runs with real data
// We will manually query the exact same data the frontend has access to at the moment of registration

async function proveDataWiring() {
    console.log(`Starting real Registration Proof for ${PLAYER_NAME}...`);

    // 1. Get Tournament + Venue Data (simulates the frontend's selectedTournament)
    const { data: tourn } = await supabase
        .from('commander_tournaments')
        .select('*, poker_venues(name, city, state)')
        .eq('id', TOURN_ID)
        .single();

    // 2. Perform the actual Registration (simulates the POST to /api/commander/tournaments/[id]/register)
    const { data: entryData, error: regError } = await supabase
        .from('commander_tournament_entries')
        .insert({
            tournament_id: TOURN_ID,
            player_id: PLAYER_ID,
            registration_method: 'app',
            status: 'registered'
        })
        .select()
        .single();

    if (regError) {
        if (regError.code === '23505') {
            // Player already registered in DB for this test tournament.
            // 3. Find a test player
            PLAYER_ID = 'dca6c345-c2ab-456f-98d9-dfbca3a43f7d';
            PLAYER_NAME = 'Mike Johnson';

            console.log(`Using live player: ${PLAYER_NAME} (${PLAYER_ID})`);

            // 4. Output the exact IDs so the browser subagent can use them
            console.log(`--- TEST DATA ---`);
            console.log(`VENUE_ID=${tourn.poker_venues.id}`); // Assuming tourn.poker_venues.id exists, otherwise use VENUE_ID
            console.log(`TOURNAMENT_ID=${tourn.id}`);
            console.log(`PLAYER_ID=${PLAYER_ID}`);
            console.log(`PLAYER_NAME=${PLAYER_NAME}`);
        } else {
            return console.error('Registration failed:', regError);
        }
    }

    const entry = entryData || (await supabase.from('commander_tournament_entries').select('*').eq('tournament_id', TOURN_ID).eq('player_id', PLAYER_ID).single()).data;

    // 3. Generate the exact HTML string the frontend generates
    const html = buildReceiptHtml({
        copyLabel: 'CUSTOMER COPY',
        playerName: PLAYER_NAME,
        tournamentName: tourn.name,
        buyinAmount: tourn.buyin_amount,
        buyinFee: tourn.buyin_fee,
        staffName: 'Danny / System Admin', // Simulating localStorage commander_staff
        venueName: tourn.poker_venues.name,
        venueCity: tourn.poker_venues.city,
        venueState: tourn.poker_venues.state,
        scheduledStart: tourn.scheduled_start,
        startingChips: tourn.starting_chips,
        tableNumber: entry.table_number,
        seatNumber: entry.seat_number,
        playerId: PLAYER_ID,
        receiptNum: `TXN-${Date.now().toString().slice(-6)}`
    });

    fs.writeFileSync('/tmp/live_wired_proof.html', html);
    console.log('Successfully wrote real generated receipt to /tmp/live_wired_proof.html');
}

// Exact copy of the frontend function for this test script
function buildReceiptHtml({
    copyLabel, playerName, tournamentName, buyinAmount, buyinFee,
    staffName, venueName, venueCity, venueState,
    scheduledStart, startingChips, tableNumber, seatNumber, playerId, receiptNum
}) {
    const total = (Number(buyinAmount) || 0) + (Number(buyinFee) || 0);

    const fmtMoney = (val) => {
        if (!val) return '$ 0.00';
        return '$ ' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    let tournDate = '', tournTime = '';
    if (scheduledStart) {
        const d = new Date(scheduledStart);
        tournDate = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        tournTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    }

    const now = new Date();
    const receivedDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const receivedTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

    const displayCopy = copyLabel;

    return `<!DOCTYPE html><html><head><title>${displayCopy}</title>
<style>
body { background: #1a1a2e; padding: 40px; margin: 0; display: flex; justify-content: center; }
.wrapper { background: white; padding: 0; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
* { box-sizing: border-box; margin: 0; padding: 0; }
.receipt-body { font-family: 'Times New Roman', Georgia, serif; margin: 0; padding: 0; color: #000; -webkit-print-color-adjust: exact; width: 340px; padding: 25px 20px; }
.center { text-align: center; }
.venue-name { font-size: 28px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 2px; line-height: 1.2; }
.venue-sub { font-size: 15px; letter-spacing: 3px; text-transform: uppercase; color: #333; }
.receipt-title { font-size: 20px; font-weight: bold; margin: 12px 0 4px; text-transform: uppercase; }
.event-name { font-size: 17px; margin: 4px 0; }
.event-date { font-size: 17px; margin: 8px 0; }
.event-date-label { font-weight: bold; }
.player-name { font-size: 17px; font-weight: bold; margin: 8px 0 0; }
.player-name-label { font-weight: bold; }
.player-id { font-size: 16px; margin: 0 0 8px; padding-left: 8px; }
.fin-row { display: flex; justify-content: flex-end; align-items: baseline; font-size: 16px; line-height: 1.8; }
.fin-label { font-weight: bold; text-align: right; margin-right: 8px; }
.fin-value { min-width: 90px; text-align: right; font-weight: bold; }
.fin-total-row { display: flex; justify-content: flex-end; align-items: baseline; font-size: 18px; line-height: 2; font-weight: bold; }
.fin-total-label { font-weight: bold; text-align: right; margin-right: 8px; }
.fin-total-value { min-width: 90px; text-align: right; font-weight: bold; }
.divider { border-top: 1px solid #000; margin: 10px 0; }
.seat-grid { display: flex; justify-content: center; gap: 30px; margin: 12px 0; }
.seat-box { text-align: center; }
.seat-box-label { font-size: 17px; font-weight: bold; margin-bottom: 4px; }
.seat-box-value { border: 2.5px solid #000; font-size: 42px; font-weight: bold; min-width: 90px; min-height: 64px; display: flex; align-items: center; justify-content: center; padding: 8px 16px; }
.received { font-size: 16px; margin: 8px 0; }
.received-label { font-weight: bold; }
.receipt-num { font-size: 22px; font-weight: bold; margin: 8px 0; }
.legal { font-size: 11px; color: #333; line-height: 1.3; margin: 8px 8px; text-align: center; }
.copy-label { font-size: 15px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; margin-top: 8px; }
</style></head><body>
<div class="wrapper">
<div class="receipt-body">
<div class="center venue-name">${venueName || 'POKER ROOM'}</div>
${venueCity || venueState ? `<div class="center venue-sub">${[venueCity, venueState].filter(Boolean).join(', ')}</div>` : ''}
<div class="center receipt-title">TOURNAMENT BUY-IN RECEIPT</div>
<div class="event-name">${tournamentName || ''}</div>
${scheduledStart ? `<div class="event-date"><span class="event-date-label">Tournament Date:</span>  ${tournDate}    ${tournTime}</div>` : ''}
<div class="player-name"><span class="player-name-label">Name:</span>  ${(playerName || '').toUpperCase()}</div>
${playerId ? `<div class="player-id">${String(playerId).slice(-7)}</div>` : ''}
<div class="divider"></div>
${buyinAmount > 0 ? `<div class="fin-row"><span class="fin-label">Buy In:</span><span class="fin-value">${fmtMoney(buyinAmount)}</span></div>` : ''}
${buyinFee > 0 ? `<div class="fin-row"><span class="fin-label">Entry Fee:</span><span class="fin-value">${fmtMoney(buyinFee)}</span></div>` : ''}
${total > 0 ? `<div class="fin-total-row"><span class="fin-total-label">Total Buy In Amount:</span><span class="fin-total-value">${fmtMoney(total)}</span></div>` : ''}
<div class="divider"></div>
<div class="seat-grid">
  <div class="seat-box">
    <div class="seat-box-label">Table</div>
    <div class="seat-box-value">${tableNumber || '--'}</div>
  </div>
  <div class="seat-box">
    <div class="seat-box-label">Seat</div>
    <div class="seat-box-value">${seatNumber || '--'}</div>
  </div>
</div>
<div class="received"><span class="received-label">Received By:</span>  ${staffName || ''}</div>
<div class="received">${receivedDate}   ${receivedTime}</div>
<div class="divider"></div>
<div class="center receipt-num">${receiptNum || ''}</div>
<div class="legal">Management reserves the right to modify, suspend, or cancel this promotion at its sole discretion and without prior notice.</div>
<div class="center copy-label">${displayCopy}</div>
</div>
</div>
</body></html>`;
}

proveDataWiring();
