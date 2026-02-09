const { createClient } = require("@supabase/supabase-js");
const env = require("dotenv").config({ path: ".env.local" }).parsed;

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const userId = "47965354-0e56-43ef-931c-ddaab82af765";

async function run() {
    // 1. Check if RLS is enabled on bankroll_ledger
    const { data: rlsData } = await service.from("pg_class")
        .select("relname, relrowsecurity, relforcerowsecurity")
        .eq("relname", "bankroll_ledger")
        .single();

    // Can't query pg_class via Supabase API. Try raw SQL instead.
    // Actually, let's just test the anon client directly.

    console.log("=== Test 1: Anon key SELECT ===");
    const { data: selectData, error: selectErr } = await anon
        .from("bankroll_ledger")
        .select("id, category, media_urls")
        .eq("user_id", userId)
        .limit(1);

    if (selectErr) {
        console.log("ANON SELECT ERROR:", selectErr.message, selectErr.code, selectErr.hint);
    } else {
        console.log("ANON SELECT OK:", selectData.length, "rows");
        if (selectData.length > 0) {
            console.log("  Entry:", selectData[0].id, selectData[0].category);
        }
    }

    console.log("\n=== Test 2: Anon key UPDATE ===");
    // Get the entry id first via service role
    const { data: entry } = await service.from("bankroll_ledger")
        .select("id, notes")
        .eq("user_id", userId)
        .eq("category", "slots")
        .limit(1)
        .single();

    if (entry) {
        const originalNotes = entry.notes;
        const { data: updateResult, error: updateErr } = await anon
            .from("bankroll_ledger")
            .update({ notes: "anon-test" })
            .eq("id", entry.id)
            .eq("user_id", userId)
            .select()
            .single();

        if (updateErr) {
            console.log("ANON UPDATE ERROR:", updateErr.message, updateErr.code, updateErr.hint);
            console.log("Full error:", JSON.stringify(updateErr));
        } else {
            console.log("ANON UPDATE OK:", updateResult ? "returned data" : "no data returned");
            // Revert
            await service.from("bankroll_ledger")
                .update({ notes: originalNotes })
                .eq("id", entry.id);
            console.log("  (reverted)");
        }

        console.log("\n=== Test 3: Anon key INSERT ===");
        const { data: insertResult, error: insertErr } = await anon
            .from("bankroll_ledger")
            .insert({
                user_id: userId,
                category: "poker_cash",
                entry_date: "2026-02-09",
                gross_in: 100,
                gross_out: 200,
                media_urls: ["https://example.com/test.png"]
            })
            .select()
            .single();

        if (insertErr) {
            console.log("ANON INSERT ERROR:", insertErr.message, insertErr.code, insertErr.hint);
            console.log("Full error:", JSON.stringify(insertErr));
        } else {
            console.log("ANON INSERT OK:", insertResult.id);
            // Clean up
            await service.from("bankroll_ledger").delete().eq("id", insertResult.id);
            console.log("  (cleaned up)");
        }
    }

    console.log("\n=== Test 4: checkRuleViolations simulation ===");
    // The handleSubmit calls checkRuleViolations first, which queries bankroll_rules
    const { data: rules, error: rulesErr } = await anon
        .from("bankroll_rules")
        .select("*")
        .eq("user_id", userId);

    if (rulesErr) {
        console.log("RULES QUERY ERROR:", rulesErr.message, rulesErr.code);
        console.log("THIS COULD BE THE PROBLEM - checkRuleViolations may throw!");
    } else {
        console.log("Rules query OK:", rules?.length, "rules found");
    }

    console.log("\n=== Test 5: bankroll_segments check (409 source) ===");
    const { data: segments, error: segErr } = await anon
        .from("bankroll_segments")
        .select("*")
        .eq("user_id", userId);

    if (segErr) {
        console.log("SEGMENTS QUERY ERROR:", segErr.message, segErr.code);
    } else {
        console.log("Segments query OK:", segments?.length, "segments found");
    }
}

run().catch(x => console.error("FATAL:", x.message));
