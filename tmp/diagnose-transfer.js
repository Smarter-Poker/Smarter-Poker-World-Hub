const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  // The real Daniel (logged in user with 500k diamonds)
  const danielId = '47965354-0e56-43ef-931c-ddaab82af765';
  const chaseId = '90efbc2c-8ee2-445b-9ac3-d71f0106c602';

  console.log('=== Real Daniel ID:', danielId);
  console.log('=== Chase ID:', chaseId);

  // 1. Check friendship between real Daniel and Chase
  const apiFilter = 'and(user_id.eq.' + danielId + ',friend_id.eq.' + chaseId + '),and(user_id.eq.' + chaseId + ',friend_id.eq.' + danielId + ')';
  
  // Without status filter first
  const { data: anyFriendship } = await sb.from('friendships')
    .select('id, user_id, friend_id, status, created_at')
    .or(apiFilter);
  
  console.log('\nFriendship (no status filter):', JSON.stringify(anyFriendship, null, 2));

  // With status filter (what the API does)
  const { data: acceptedFriendship, error: err } = await sb.from('friendships')
    .select('id, user_id, friend_id, status, created_at')
    .or(apiFilter)
    .eq('status', 'accepted')
    .maybeSingle();
  
  console.log('Friendship (accepted only):', JSON.stringify(acceptedFriendship, null, 2));
  console.log('Error:', JSON.stringify(err, null, 2));

  // 2. Check ALL accepted friendships for real Daniel
  const { data: allDaniel } = await sb.from('friendships')
    .select('id, user_id, friend_id, status')
    .or('user_id.eq.' + danielId + ',friend_id.eq.' + danielId)
    .eq('status', 'accepted');
  
  console.log('\n=== ALL accepted friendships for Daniel (' + (allDaniel?.length || 0) + ') ===');
  allDaniel?.forEach(f => {
    const otherId = f.user_id === danielId ? f.friend_id : f.user_id;
    console.log('  other=' + otherId);
  });

  // 3. Now check how the friends API loads friends — look at the /api/friends endpoint
  // The friends list SHOWED Chase, so how?
  // Check if there's a followers table or some other relationship
  const { data: followers } = await sb.from('followers')
    .select('id, follower_id, following_id, created_at')
    .or('follower_id.eq.' + danielId + ',following_id.eq.' + danielId)
    .limit(30);
  
  console.log('\n=== Followers for Daniel (' + (followers?.length || 0) + ') ===');
  followers?.forEach(f => {
    const isChase = f.follower_id === chaseId || f.following_id === chaseId;
    console.log('  follower=' + f.follower_id.slice(0,8) + ' -> following=' + f.following_id.slice(0,8) + (isChase ? ' <<< CHASE' : ''));
  });

  // 4. Check if the friends API uses a different query
  console.log('\n=== Checking friends API source ===');
  // The wallet fetches from /api/friends?action=list — let me check that API
}

diagnose().catch(console.error);
