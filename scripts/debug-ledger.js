const { createClient } = require("@supabase/supabase-js");
const e = require("dotenv").config({ path: ".env.local" }).parsed;
const s = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // Get existing entry to see columns
    const { data: sample } = await s.from("bankroll_ledger")
        .select("*")
        .eq("user_id", "47965354-0e56-43ef-931c-ddaab82af765")
        .limit(1)
        .single();

    if (sample) {
        console.log("Actual columns in bankroll_ledger:");
        Object.keys(sample).sort().forEach(k => console.log("  " + k));
    }

    console.log("\n---");

    // Simulate what the form sends for SLOTS category
    const formEntry = {
        category: "slots",
        location_id: null,
        trip_id: null,
        entry_date: "2026-02-05",
        start_time: null,
        end_time: null,
        gross_in: 595,
        gross_out: 2486,
        notes: null,
        media_urls: ["https://example.com/test.png"],
        emotional_tag: null,
        slot_machine: null
    };

    console.log("\nFields sent by form for slots:");
    Object.keys(formEntry).sort().forEach(k => console.log("  " + k));

    if (sample) {
        const tableColumns = new Set(Object.keys(sample));
        const formFields = Object.keys(formEntry);
        console.log("\nFields in form but NOT in table:");
        let mismatches = 0;
        formFields.forEach(f => {
            if (!tableColumns.has(f)) {
                console.log("  *** MISMATCH: " + f);
                mismatches++;
            }
        });
        if (mismatches === 0) console.log("  (none)");
    }

    // Try the actual update to reproduce the error
    console.log("\n--- Attempting test update ---");
    try {
        const { data: existing } = await s.from("bankroll_ledger")
            .select("id")
            .eq("user_id", "47965354-0e56-43ef-931c-ddaab82af765")
            .eq("category", "slots")
            .limit(1)
            .single();

        if (existing) {
            console.log("Found existing slots entry:", existing.id);

            // Try updating with exact same fields as form would send
            const { data: updated, error } = await s.from("bankroll_ledger")
                .update({
                    category: "slots",
                    location_id: null,
                    trip_id: null,
                    entry_date: "2026-02-05",
                    start_time: null,
                    end_time: null,
                    gross_in: 595,
                    gross_out: 2486,
                    notes: null,
                    media_urls: ["https://example.com/test.png"],
                    emotional_tag: null,
                    slot_machine: null
                })
                .eq("id", existing.id)
                .eq("user_id", "47965354-0e56-43ef-931c-ddaab82af765")
                .select()
                .single();

            if (error) {
                console.log("UPDATE ERROR:", JSON.stringify(error, null, 2));
            } else {
                console.log("UPDATE SUCCESS - media_urls:", JSON.stringify(updated.media_urls));
                // Revert the test media_urls
                await s.from("bankroll_ledger")
                    .update({ media_urls: null })
                    .eq("id", existing.id);
                console.log("Reverted media_urls back to null");
            }
        }
    } catch (err) {
        console.log("EXCEPTION:", err.message);
    }
}

run().catch(x => console.error(x));
