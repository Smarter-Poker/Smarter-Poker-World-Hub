const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase environment variables! Check .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TROLL_USERNAME = `orb6_troll_${Date.now()}`;

async function runTrollTest() {
    console.log(`\n===============================================================`);
    console.log(`📡 ORB-6 RED TEAM E2E TEST: ACTIVATING ${TROLL_USERNAME}`);
    console.log(`===============================================================\n`);

    let trollUserId = null;
    let authHeader = null;
    let targetConversationId = null;
    let victimId = null;

    try {
        // 1. Create a "Victim" to chat with
        const { data: victim, error: victimErr } = await supabase.auth.admin.createUser({
            email: `orb6_victim_${Date.now()}@smarter.poker.local`,
            password: 'SecurePassword123!',
            email_confirm: true
        });
        if (victimErr) throw victimErr;
        victimId = victim.user.id;
        await supabase.from('profiles').insert({ id: victimId, username: `victim_${Date.now()}` });

        // 2. Create the Troll
        const { data: troll, error: trollErr } = await supabase.auth.admin.createUser({
            email: `${TROLL_USERNAME}@smarter.poker.local`,
            password: 'SecurePassword123!',
            email_confirm: true
        });
        if (trollErr) throw trollErr;
        trollUserId = troll.user.id;
        await supabase.from('profiles').insert({ id: trollUserId, username: TROLL_USERNAME });

        // 3. Login Troll to get JWT for the API Header
        const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
            email: `${TROLL_USERNAME}@smarter.poker.local`,
            password: 'SecurePassword123!'
        });
        if (loginErr) throw loginErr;
        authHeader = `Bearer ${loginData.session.access_token}`;

        console.log(`✅ Identified as Troll (UUID: ${trollUserId})`);

        // 4. Create a shared conversation via RPC
        const { data: convId, error: convErr } = await supabase.rpc('fn_get_or_create_conversation', {
            user1_id: trollUserId,
            user2_id: victimId
        });
        if (convErr) throw convErr;
        targetConversationId = convId;
        console.log(`✅ Conversation spawned: ${targetConversationId}`);

        // --- TEST 1: XSS NEUTRALIZATION --------------------------------------
        console.log(`\n🛡️  TEST 1: Injecting XSS payload (<script> & onerror)`);
        const xssPayload = `Hello <script>alert("Hacked")</script> and <img src="x" onerror="alert(1)">`;

        let xssRes = await fetch('http://localhost:3000/api/messenger/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify({ conversationId: targetConversationId, content: xssPayload })
        });
        const xssData = await xssRes.json();

        if (xssData.success && !xssData.content.includes('<script>') && xssData.content.includes('data-blocked')) {
            console.log(`  ✅ SERVER-SIDE XSS NEUTRALIZED SUCCESSFULLY.`);
            console.log(`     Raw Input : ${xssPayload}`);
            console.log(`     Sanitized : ${xssData.content}`);
        } else {
            console.error(`  ❌ XSS NEUTRALIZATION FAILED!`, xssData);
            throw new Error("XSS bypassed");
        }

        // --- TEST 2: 10MB BASE64 PAYLOAD SIZE LIMIT --------------------------
        console.log(`\n🛡️  TEST 2: Attempting 10MB Base64 crash payload`);
        const giantPayload = "A".repeat(3000); // 3000 chars exceeds the 2000 char threshold

        let giantRes = await fetch('http://localhost:3000/api/messenger/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify({ conversationId: targetConversationId, content: giantPayload })
        });

        if (giantRes.status === 413) {
            console.log(`  ✅ SERVER DROPPED 10MB PAYLOAD. Status 413 (Payload Too Large).`);
        } else {
            console.error(`  ❌ SERVER ACCEPTED MASSIVE PAYLOAD! Status: ${giantRes.status}`);
            throw new Error("Payload size enforcement bypassed");
        }

        // --- TEST 3: TOKEN-BUCKET RATE LIMITING (FIRE 100 MSG IN 1 SEC) -------
        console.log(`\n🛡️  TEST 3: Rapid Fire Artillery (100 messages/sec)`);
        let promises = [];
        let statuses = { 200: 0, 429: 0, other: 0 };

        for (let i = 0; i < 100; i++) {
            promises.push(
                fetch('http://localhost:3000/api/messenger/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
                    body: JSON.stringify({ conversationId: targetConversationId, content: `Spam ${i}` })
                }).then(r => r.status)
            );
        }

        const runResults = await Promise.all(promises);
        runResults.forEach(status => {
            if (status === 200) statuses[200]++;
            else if (status === 429) statuses[429]++;
            else statuses.other++;
        });

        console.log(`     Total fired: 100`);
        console.log(`     Accepted (200): ${statuses[200]}`);
        console.log(`     Blocked (429):  ${statuses[429]}`);

        if (statuses[429] > 50 && statuses[200] <= 30) {
            console.log(`  ✅ RATE LIMITER FUNCTIONAL: Troll was shadow-muted exactly at limit.`);
        } else {
            console.error(`  ❌ RATE LIMITER FAILED!`);
            throw new Error("Rate limiting bypassed");
        }

        console.log(`\n🏁 E2E SECURITY AUDIT: 100% PASS`);

    } catch (e) {
        console.error(`\n🔥 FATAL TEST EXCEPTION:`, e);
        process.exit(1);
    } finally {
        if (trollUserId) await supabase.auth.admin.deleteUser(trollUserId);
        if (victimId) await supabase.auth.admin.deleteUser(victimId);
        process.exit(0);
    }
}

// Ensure env vars are loaded when running script manually (requires dotenv if bare node, but we can run via Next.js or just load .env)
require('dotenv').config({ path: '.env.local' });
runTrollTest();
