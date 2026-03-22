/**
 * 📬 GET CONVERSATIONS API - Service Role Fallback
 * Bypasses RLS using service_role to ensure user always sees their conversations
 * This is a workaround for when client-side auth tokens don't match RLS policies
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

// Use service role to bypass RLS
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // ── HARDENED Auth: local JWT decode (no GoTrue network call) + fallback ──
      const localUser = getServerUser(req);
      let userId;
      if (localUser) {
          userId = localUser.id;
      } else {
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
          const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
          userId = user.id;
      }


      try {
          // Step 1: Get all conversation IDs where user is a participant
          const { data: participations, error: partError } = await getSupabase()
              .from('social_conversation_participants')
              .select('conversation_id, last_read_at')
              .eq('user_id', userId)
              .limit(100);

          if (partError) {
              console.error('[GET-CONVERSATIONS] Participation query error:', partError);
              return res.status(500).json({ success: false, error: partError.message });
          }


          if (!participations || participations.length === 0) {
              return res.json({ success: true, conversations: [] });
          }

          // Step 2: Get conversation details
          const conversationIds = participations.map(p => p.conversation_id);
          const { data: conversations, error: convError } = await getSupabase()
              .from('social_conversations')
              .select('id, last_message_at, last_message_preview, is_group')
              .in('id', conversationIds)
              .order('last_message_at', { ascending: false })
              .limit(100);

          if (convError) {
              console.error('[GET-CONVERSATIONS] Conversation query error:', convError);
              return res.status(500).json({ success: false, error: convError.message });
          }

          // Steps 3-5: PARALLELIZED — run all 3 queries at once since they only need conversationIds
          const earliestRead = participations.reduce((earliest, p) => {
              const ts = p.last_read_at || '1970-01-01';
              return ts < earliest ? ts : earliest;
          }, participations[0].last_read_at || '1970-01-01');

          const participationMap = {};
          participations.forEach(p => { participationMap[p.conversation_id] = p; });

          const [otherParticipantsResult, candidateMsgsResult] = await Promise.all([
              // Step 3: Get ALL other participants
              getSupabase()
                  .from('social_conversation_participants')
                  .select('conversation_id, user_id')
                  .in('conversation_id', conversationIds)
                  .neq('user_id', userId),
              // Step 5: Get unread candidate messages
              getSupabase()
                  .from('social_messages')
                  .select('conversation_id, created_at')
                  .in('conversation_id', conversationIds)
                  .neq('sender_id', userId)
                  .eq('is_deleted', false)
                  .gt('created_at', earliestRead)
                  .limit(5000),
          ]);

          const allOtherParticipants = otherParticipantsResult.data;

          // Build a map: conversation_id → other user_id
          const convToOtherUser = {};
          const otherUserIds = new Set();
          (allOtherParticipants || []).forEach(p => {
              if (!convToOtherUser[p.conversation_id]) {
                  convToOtherUser[p.conversation_id] = p.user_id;
                  otherUserIds.add(p.user_id);
              }
          });

          // Step 4: Get ALL profiles in ONE query (depends on step 3's otherUserIds)
          let profilesMap = {};
          if (otherUserIds.size > 0) {
              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, username, display_name, avatar_url')
                  .in('id', [...otherUserIds]);
              (profiles || []).forEach(p => { profilesMap[p.id] = p; });
          }

          // Count unread per-conversation using each conversation's own last_read_at
          const unreadCounts = {};
          (candidateMsgsResult.data || []).forEach(msg => {
              const participation = participationMap[msg.conversation_id];
              const lastRead = participation?.last_read_at || '1970-01-01';
              if (msg.created_at > lastRead) {
                  unreadCounts[msg.conversation_id] = (unreadCounts[msg.conversation_id] || 0) + 1;
              }
          });

          // Step 6: Assemble enriched conversations (no extra queries)
          const validConversations = conversations
              .map(conv => {
                  const otherUserId = convToOtherUser[conv.id];
                  const otherUser = otherUserId ? profilesMap[otherUserId] : null;
                  if (!otherUser) return null;
                  return {
                      id: conv.id,
                      last_message_at: conv.last_message_at,
                      last_message_preview: conv.last_message_preview,
                      is_group: conv.is_group,
                      otherUser,
                      unreadCount: unreadCounts[conv.id] || 0,
                      last_read_at: participationMap[conv.id]?.last_read_at,
                  };
              })
              .filter(Boolean)
              .sort((a, b) => {
                  const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                  const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                  return timeB - timeA;
              });


          return res.json({ success: true, conversations: validConversations });

      } catch (error) {
          console.error('[GET-CONVERSATIONS] Error:', error);
          return res.status(500).json({ success: false, error: error.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
