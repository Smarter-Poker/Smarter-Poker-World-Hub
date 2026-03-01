#!/usr/bin/env node
/**
 * Generate QR Code Cards — 9 Players + 2 Dealers
 * 
 * Queries Supabase for seeded Club JAQK members/staff,
 * ensures QR codes exist, and generates a printable HTML page.
 * 
 * Usage: node scripts/generate-qr-cards.js
 * Output: test-qr-cards.html (open in browser to print)
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Config ────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996;

(async () => {
    console.log('═══════════════════════════════════════════');
    console.log('  QR CODE CARD GENERATOR — Club JAQK');
    console.log('═══════════════════════════════════════════\n');

    // ── 1. Fetch 9 Players ──────────────────────────
    console.log('── Fetching Players ──\n');
    const { data: players, error: pErr } = await sb
        .from('commander_members')
        .select('id, first_name, last_name, qr_code, membership_tier, member_number')
        .eq('venue_id', VENUE_ID)
        .neq('membership_tier', 'staff')
        .eq('membership_status', 'active')
        .order('member_number', { ascending: true })
        .limit(9);

    if (pErr) {
        console.error('❌ Failed to fetch players:', pErr.message);
        process.exit(1);
    }

    if (players.length === 0) {
        console.error('❌ No players found for venue', VENUE_ID);
        process.exit(1);
    }

    console.log(`  ✅ Found ${players.length} players`);

    // Fix any missing QR codes for players
    for (const p of players) {
        if (!p.qr_code) {
            const newCode = `CMD-${VENUE_ID}-${crypto.randomUUID().split('-')[0]}`;
            await sb.from('commander_members').update({ qr_code: newCode }).eq('id', p.id);
            p.qr_code = newCode;
            console.log(`  🔧 Generated missing QR for ${p.first_name} ${p.last_name}: ${newCode}`);
        }
        console.log(`  👤 ${p.member_number} — ${p.first_name} ${p.last_name} — QR: ${p.qr_code}`);
    }

    // ── 2. Fetch 2 Dealers ──────────────────────────
    console.log('\n── Fetching Dealers ──\n');

    // First try commander_staff with role='dealer'
    const { data: staffDealers, error: sErr } = await sb
        .from('commander_staff')
        .select('id, display_name, qr_code, role, member_id')
        .eq('venue_id', VENUE_ID)
        .eq('role', 'dealer')
        .eq('is_active', true)
        .limit(2);

    if (sErr) {
        console.error('❌ Failed to fetch staff dealers:', sErr.message);
        process.exit(1);
    }

    let dealers = [];

    if (staffDealers && staffDealers.length >= 2) {
        // Fix missing QR codes on staff dealers
        for (const d of staffDealers) {
            if (!d.qr_code) {
                const newCode = `STAFF-${VENUE_ID}-${crypto.randomUUID().split('-')[0]}`;
                await sb.from('commander_staff').update({ qr_code: newCode }).eq('id', d.id);
                d.qr_code = newCode;
                console.log(`  🔧 Generated missing QR for staff ${d.display_name}: ${newCode}`);
            }
        }

        // Also ensure these dealers have a corresponding member record with matching QR
        for (const d of staffDealers) {
            // Check if there's a member record linked
            let memberQr = d.qr_code;
            if (d.member_id) {
                const { data: mem } = await sb
                    .from('commander_members')
                    .select('qr_code')
                    .eq('id', d.member_id)
                    .single();
                if (mem && mem.qr_code) {
                    memberQr = mem.qr_code;
                } else if (mem) {
                    // Update member record with staff QR
                    await sb.from('commander_members').update({ qr_code: d.qr_code }).eq('id', d.member_id);
                }
            }

            const nameParts = (d.display_name || '').split(' ');
            dealers.push({
                first_name: nameParts[0] || '',
                last_name: nameParts.slice(1).join(' ') || '',
                qr_code: memberQr,
                role: 'dealer'
            });
        }
    } else {
        // Fallback: look for member records with tier='staff' 
        console.log('  ⚠️  Not enough staff dealers found, looking in members table...');
        const { data: memberDealers } = await sb
            .from('commander_members')
            .select('id, first_name, last_name, qr_code, membership_tier')
            .eq('venue_id', VENUE_ID)
            .eq('membership_tier', 'staff')
            .limit(2);

        if (memberDealers && memberDealers.length > 0) {
            for (const d of memberDealers) {
                if (!d.qr_code) {
                    const newCode = `STAFF-${VENUE_ID}-${crypto.randomUUID().split('-')[0]}`;
                    await sb.from('commander_members').update({ qr_code: newCode }).eq('id', d.id);
                    d.qr_code = newCode;
                    console.log(`  🔧 Generated missing QR for ${d.first_name} ${d.last_name}: ${newCode}`);
                }
                dealers.push({
                    first_name: d.first_name,
                    last_name: d.last_name,
                    qr_code: d.qr_code,
                    role: 'dealer'
                });
            }
        }

        // If still not enough, create 2 test dealer member records
        if (dealers.length < 2) {
            console.log('  ⚠️  Creating test dealer member records...');
            const testDealers = [
                { first: 'Mike', last: 'Torres' },
                { first: 'Jenny', last: 'Park' },
            ];

            for (const td of testDealers.slice(0, 2 - dealers.length)) {
                const qrCode = `STAFF-${VENUE_ID}-${crypto.randomUUID().split('-')[0]}`;
                const { count } = await sb
                    .from('commander_members')
                    .select('id', { count: 'exact', head: true })
                    .eq('venue_id', VENUE_ID);
                const memberNumber = `JAQK-${String((count || 0) + 1).padStart(5, '0')}`;

                const { data: newMem, error: insertErr } = await sb
                    .from('commander_members')
                    .insert({
                        venue_id: VENUE_ID,
                        member_number: memberNumber,
                        qr_code: qrCode,
                        first_name: td.first,
                        last_name: td.last,
                        membership_tier: 'staff',
                        member_type: 'employee',
                        membership_status: 'active',
                        notes: 'Staff member — dealer (test QR)',
                    })
                    .select('id')
                    .single();

                if (insertErr) {
                    console.error(`  ❌ Failed to create dealer record: ${insertErr.message}`);
                } else {
                    dealers.push({
                        first_name: td.first,
                        last_name: td.last,
                        qr_code: qrCode,
                        role: 'dealer'
                    });
                    console.log(`  ✅ Created dealer: ${td.first} ${td.last} — QR: ${qrCode}`);
                }
            }
        }
    }

    for (const d of dealers) {
        console.log(`  🎰 ${d.first_name} ${d.last_name} (Dealer) — QR: ${d.qr_code}`);
    }

    // ── 3. Generate HTML ────────────────────────────
    console.log('\n── Generating HTML ──\n');

    const allCards = [
        ...players.map(p => ({
            name: `${p.first_name} ${p.last_name}`,
            qr_code: p.qr_code,
            type: 'Player',
            tier: p.membership_tier,
            member_number: p.member_number,
        })),
        ...dealers.map(d => ({
            name: `${d.first_name} ${d.last_name}`,
            qr_code: d.qr_code,
            type: 'Dealer',
            tier: 'staff',
            member_number: '',
        })),
    ];

    function qrImgUrl(code, size = 250) {
        return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(code)}&bgcolor=ffffff&color=000000`;
    }

    const cardsHtml = allCards.map((card, i) => `
        <div class="card">
            <div class="badge ${card.type === 'Dealer' ? 'badge-dealer' : 'badge-player'}">${card.type}</div>
            <div class="qr-wrap">
                <img src="${qrImgUrl(card.qr_code)}" alt="QR Code for ${card.name}" width="250" height="250" />
            </div>
            <div class="name">${card.name}</div>
            <div class="meta">${card.member_number ? card.member_number + ' • ' : ''}${card.tier.toUpperCase()}</div>
            <div class="qr-value">${card.qr_code}</div>
        </div>
    `).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Club JAQK — Test QR Code Cards</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: #fff;
            padding: 32px;
        }

        h1 {
            text-align: center;
            font-size: 28px;
            margin-bottom: 8px;
            color: #FFD700;
            letter-spacing: 1px;
        }

        .subtitle {
            text-align: center;
            color: #888;
            font-size: 14px;
            margin-bottom: 32px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 24px;
            max-width: 1000px;
            margin: 0 auto;
        }

        .card {
            background: #1a1a2e;
            border: 2px solid #333;
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            position: relative;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 32px rgba(255, 215, 0, 0.1);
        }

        .badge {
            position: absolute;
            top: 12px;
            right: 12px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
            padding: 4px 10px;
            border-radius: 20px;
            text-transform: uppercase;
        }

        .badge-player {
            background: #1877F2;
            color: #fff;
        }

        .badge-dealer {
            background: #FFD700;
            color: #000;
        }

        .qr-wrap {
            background: #fff;
            border-radius: 12px;
            padding: 16px;
            display: inline-block;
            margin-bottom: 16px;
        }

        .qr-wrap img {
            display: block;
            width: 200px;
            height: 200px;
        }

        .name {
            font-size: 20px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 4px;
        }

        .meta {
            font-size: 12px;
            color: #888;
            margin-bottom: 4px;
            letter-spacing: 0.5px;
        }

        .qr-value {
            font-size: 10px;
            color: #555;
            font-family: 'Courier New', monospace;
            word-break: break-all;
        }

        /* Print styles */
        @media print {
            body { background: #fff; color: #000; padding: 16px; }
            .card { 
                border: 1px solid #ccc; 
                page-break-inside: avoid;
                background: #fff;
            }
            .card:hover { transform: none; box-shadow: none; }
            .name { color: #000; }
            .meta { color: #666; }
            .qr-value { color: #999; }
            .badge-player { background: #1877F2; }
            .badge-dealer { background: #FFD700; }
            h1 { color: #000; }
            .subtitle { color: #666; }
        }
    </style>
</head>
<body>
    <h1>♠ CLUB JAQK — Test QR Cards ♠</h1>
    <p class="subtitle">9 Players + 2 Dealers — Generated ${new Date().toLocaleString()}</p>
    <div class="grid">
${cardsHtml}
    </div>
</body>
</html>`;

    const outputPath = path.join(__dirname, '..', 'test-qr-cards.html');
    fs.writeFileSync(outputPath, html);
    console.log(`  ✅ HTML file written: ${outputPath}`);
    console.log(`  📄 ${allCards.length} cards total (${players.length} players + ${dealers.length} dealers)`);
    console.log('\n═══════════════════════════════════════════');
    console.log('  DONE — Open test-qr-cards.html in browser');
    console.log('═══════════════════════════════════════════\n');
})();
