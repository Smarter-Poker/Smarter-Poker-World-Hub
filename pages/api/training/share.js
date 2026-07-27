/**
 * TRAINING SOCIAL SHARE API
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Share achievements, milestones, and accomplishments to the social feed
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}

// Share type templates
const SHARE_TEMPLATES = {
    achievement: {
        generateContent: (data) =>
            `★ I just unlocked the "${data.name}" achievement in GTO Training! ${data.description || ''}`,
        postType: 'achievement'
    },
    challenge: {
        generateContent: (data) =>
            `◆ I completed the ${data.challengeType} challenge: "${data.name}"! +${data.diamonds}◆`,
        postType: 'challenge'
    },
    streak: {
        generateContent: (data) =>
            `▲ ${data.days}-day GTO Training streak! I'm on fire! ${data.days >= 30 ? '★' : data.days >= 14 ? '⌁' : '▲'}`,
        postType: 'milestone'
    },
    perfect_round: {
        generateContent: (data) =>
            `◆ Perfect Round! 100% accuracy on "${data.gameName}"! That's ${data.totalPerfect} perfect rounds total!`,
        postType: 'accomplishment'
    },
    leaderboard: {
        generateContent: (data) =>
            `★ I reached #${data.rank} on the ${data.period} GTO Training leaderboard!`,
        postType: 'milestone'
    },
    session_complete: {
        generateContent: (data) =>
            `□ Just completed a training session on "${data.gameName}" with ${data.accuracy}% accuracy!`,
        postType: 'update'
    },
    autopilot: {
        generateContent: (data) =>
            `■ Autopilot session complete! Trained ${data.spotsTrailed || 0} weak spots with ${data.accuracy || 0}% accuracy. ${(data.spots || []).slice(0, 3).join(', ')}`,
        postType: 'accomplishment'
    },
    'gto-score': {
        generateContent: (data) =>
            `■ My GTO Proximity Score: ${data.score}/100 (${data.tier}) — based on ${(data.hands || 0).toLocaleString()} hands analyzed!`,
        postType: 'milestone'
    }
};

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      // Require JWT auth for write operations
      const supabase = getSupabase();
      if (req.method !== 'GET') {
          const { user: _authUser, error: _authErr } = await getServerUserWithFallback(req, supabase);
          if (!_authUser) {
              if (_authErr === 'No token') return res.status(401).json({ success: false, error: 'Authentication required' });
              return res.status(401).json({ success: false, error: 'Invalid token' });
          }
          if (req.body) req.body.userId = _authUser.id;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Body size guard — share data is bounded
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 10240) {
          return res.status(413).json({ success: false, error: 'Request body too large' });
      }

      const {
          userId,
          shareType,  // 'achievement', 'challenge', 'streak', 'perfect_round', 'leaderboard', 'session_complete'
          data,       // Relevant data for the share type
          customMessage // Optional user override
      } = req.body;

      if (!userId || !shareType) {
          return res.status(400).json({ success: false, error: 'userId and shareType required' });
      }

      const template = SHARE_TEMPLATES[shareType];
      if (!template) {
          return res.status(400).json({ success: false, error: 'Invalid shareType' });
      }

      try {
          // Generate content from template or use custom message
          const content = customMessage || template.generateContent(data);

          // Create unique ID for the post
          const postId = `training-${shareType}-${userId}-${Date.now()}`;

          // Get user profile for the post
          const { data: profile } = await supabase
              .from('profiles')
              .select('username, avatar_url, display_name')
              .eq('id', userId)
              .maybeSingle();

          // Create the social post
          const { data: post, error } = await supabase
              .from('social_posts')
              .insert({
                  id: postId,
                  user_id: userId,
                  content,
                  type: 'training_share',
                  metadata: {
                      shareType,
                      postType: template.postType,
                      trainingData: data,
                      autoGenerated: !customMessage
                  }
              })
              .select()
              .maybeSingle();

          if (error) {
              console.warn('[TrainingShare] Insert error:', error);

              // If social_posts doesn't exist, just log success
              if (error.code === '42P01') {
                  return res.status(200).json({
                      success: true,
                      message: 'Share logged (social feed table not available)',
                      content
                  });
              }

              throw error;
          }

          return res.status(200).json({
              success: true,
              postId: post?.id || postId,
              content,
              shareType,
              message: 'Successfully shared to your feed!'
          });

      } catch (error) {
          console.warn('[TrainingShare] Error:', error.message);
          return res.status(500).json({ success: false, error: 'Failed to share' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
