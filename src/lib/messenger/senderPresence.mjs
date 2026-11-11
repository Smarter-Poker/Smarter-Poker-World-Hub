/**
 * SENDING A MESSAGE IS ACTIVITY (owner definition, 2026-11-11).
 *
 * "A user who sent a message or was active in the app within the online
 * window is Online." /api/messenger/send-message is the one door a person
 * sends a direct message through (the messenger page, the dock and calls all
 * use it), and it has already proved who the person is from their own token.
 * So when it confirms a NEW message it stamps that person's heartbeat
 * (profiles.last_seen), the same column fn_profile_presence reads.
 *
 * Why here and not a trigger on social_messages: the platform also inserts
 * messages on a person's behalf with nobody at the keyboard (club welcomes,
 * invoices, Reliability Controller notices from the platform account). A
 * trigger cannot tell those from a person typing; this route can.
 *
 * Only a person whose presence flag is on is stamped. profiles.is_online is
 * false while the Messenger "Active Status" toggle is off (the heartbeat
 * writes it), and a message must not reveal someone who chose to hide.
 *
 * Never fails the send: a refused stamp is logged and the message stands.
 */
export async function stampSenderPresence(supabase, userId, now = new Date()) {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ last_seen: now.toISOString() })
            .eq('id', userId)
            .eq('is_online', true);
        if (error) throw error;
        return true;
    } catch (err) {
        console.warn('[send-message] sender presence was not stamped:', err?.message || err);
        return false;
    }
}
