/**
 * Daily Challenges Generator
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates daily training challenges for all users
 * 
 * Cron: Runs daily at midnight UTC
 * 
 * Creates a new challenge entry with:
 * - Random game from the 100 game library
 * - Level scaling (1-10 based on day of month)
 * - Accuracy requirements and diamond rewards
 */

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { reportApiError } from '../../../src/lib/sentryWrap';

const getSupabase = getSupabaseAdmin;


const TRAINING_GAMES = [
    'raise-first-in',
    '3bet-defense',
    'board-texture-analysis',
    'cbet-strategy',
    'pot-odds-math',
    'position-awareness',
    'range-construction',
    'bluff-catching',
    'value-betting',
    'tournament-icm'
];

export const config = {
    maxDuration: 30
};

export default async function handler(req, res) {
  try {
      // Verify cron secret
      if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
          return res.status(401).json({ error: 'Unauthorized' });
      }

      

      try {
          const today = new Date();
          const challengeDate = today.toISOString().split('T')[0];

          // Check if challenge already exists for today
          const { data: existing } = await getSupabase()
              .from('training_daily_challenges')
              .select('id')
              .eq('challenge_date', challengeDate)
              .maybeSingle();

          if (existing) {
              return res.status(200).json({
                  message: 'Daily challenge already exists for today',
                  challengeDate
              });
          }

          // Generate today's challenge
          const dayOfMonth = today.getDate();
          const dayOfWeek = today.getDay();

          // Rotate through games based on day of year
          const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
          const gameIndex = dayOfYear % TRAINING_GAMES.length;
          const gameId = TRAINING_GAMES[gameIndex];

          // Scale level based on day of month (creates variety)
          const level = Math.min(((dayOfMonth % 10) || 10), 10);

          // Weekend challenges are harder but more rewarding
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const requiredAccuracy = isWeekend ? 90 : 85;
          const bonusDiamonds = isWeekend ? 100 : 50;

          // Insert the daily challenge
          const { data: challenge, error } = await getSupabase()
              .from('training_daily_challenges')
              .insert({
                  challenge_date: challengeDate,
                  game_id: gameId,
                  level: level,
                  required_accuracy: requiredAccuracy,
                  bonus_xp_multiplier: isWeekend ? 3.0 : 2.0,
                  bonus_diamonds: bonusDiamonds
              })
              .select()
              .maybeSingle();

          if (error) {
              console.error('Error creating daily challenge:', error);
              return res.status(500).json({ error: error.message });
          }

          // ── SEND NOTIFICATION BATCH ──
          try {
              const { data: profiles } = await getSupabase().from('profiles').select('id');
              if (profiles && profiles.length > 0) {
                  const targetUserIds = profiles.map(p => p.id);
                  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smarter.poker';
                  await fetch(`${baseUrl}/api/notifications/send`, {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                      },
                      body: JSON.stringify({
                          title: 'New Daily Challenge! 🏆',
                          message: `Today's Challenge is Live! Test your skills in ${gameId.replace(/-/g, ' ')} for extra diamonds.`,
                          url: `${baseUrl}/hub/training/arena`,
                          externalUserIds: targetUserIds,
                          category: 'daily_challenges'
                      })
                  });
              }
          } catch(e) {
              console.error('Push broadcast error:', e);
          }

          return res.status(200).json({
              success: true,
              challenge: {
                  date: challengeDate,
                  game: gameId,
                  level,
                  requiredAccuracy,
                  bonusDiamonds
              }
          });

      } catch (error) {
          console.error('Daily challenges cron error:', error);
          return res.status(500).json({ error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
