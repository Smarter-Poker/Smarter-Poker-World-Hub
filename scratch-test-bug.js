const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    // 1. Get a random user to be the sender
    const { data: users } = await supabase.from('profiles').select('id, username').limit(2);
    const sender = users.find(u => u.username !== 'support');
    
    if (!sender) {
        console.log("No sender found");
        return;
    }
    
    console.log("Sending from:", sender.username, sender.id);
    
    const { data, error } = await supabase.rpc('fn_submit_bug_report_to_admin', {
        p_sender_id: sender.id,
        p_subject: "Test Bug from Auto-Test",
        p_description: "Checking if wiring works perfectly to the support identity.",
        p_priority: "high",
        p_current_page: "/test-page",
        p_user_agent: "Mozilla/5.0 Auto"
    });
    
    console.log("RPC Result:", data, error);
}
run();
