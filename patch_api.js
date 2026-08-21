const fs = require('fs');

let apiCode = fs.readFileSync('pages/api/club-arena/bbj.js', 'utf8');

const replacement = `
        // Get last 10 winners
        const { data: winners } = await getSupabase()
          .from('bbj_winners')
          .select('*')
          .eq('club_id', clubId)
          .order('awarded_at', { ascending: false })
          .limit(10);

        // Fetch board cards from hand_histories and avatars from profiles
        const enrichedWinners = await Promise.all((winners || []).map(async (w) => {
          let boardCards = null;
          let loserAvatar = null;
          let winnerAvatar = null;

          // Attempt to fetch board cards from the actual hand history
          if (w.hand_number && w.table_id) {
            try {
              const { data: hh } = await getSupabase()
                .from('hand_histories')
                .select('hand_data')
                .eq('hand_number', w.hand_number)
                .eq('table_id', w.table_id)
                .maybeSingle();
              if (hh?.hand_data) {
                boardCards = hh.hand_data.board || hh.hand_data.communityCards || null;
              }
            } catch(e) {}
          }

          // Try to get avatars
          if (w.loser_user_id) {
            try {
              const { data: p } = await getSupabase().from('profiles').select('avatar_url').eq('id', w.loser_user_id).maybeSingle();
              loserAvatar = p?.avatar_url || null;
            } catch(e) {}
          }
          if (w.winner_user_id) {
            try {
              const { data: p } = await getSupabase().from('profiles').select('avatar_url').eq('id', w.winner_user_id).maybeSingle();
              winnerAvatar = p?.avatar_url || null;
            } catch(e) {}
          }

          return {
            id: w.id,
            loserName: w.loser_display_name || 'Player',
            loserHand: w.loser_hand,
            loserCards: w.loser_cards,
            loserAvatar,
            loserPayout: Number(w.loser_payout),
            winnerName: w.winner_display_name || 'Player',
            winnerHand: w.winner_hand,
            winnerCards: w.winner_cards,
            winnerAvatar,
            winnerPayout: Number(w.winner_payout),
            boardCards,
            totalPayout: Number(w.total_payout),
            awardedAt: w.awarded_at,
            stakesTier: w.stakes_tier,
            gameVariant: w.game_variant,
          };
        }));
`;

const oldCode = `
        // Get last 10 winners
        const { data: winners } = await getSupabase()
          .from('bbj_winners')
          .select('*')
          .eq('club_id', clubId)
          .order('awarded_at', { ascending: false })
          .limit(10);
`;

const replaceReturn = `
        return res.json({
          pool: {
            amount: Number(pool?.pool_amount || 0),
            handsContributed: Number(pool?.hands_contributed || 0),
            lastHitAt: pool?.last_hit_at,
            lastHitAmount: Number(pool?.last_hit_amount || 0),
          },
          winners: enrichedWinners,
          tiers: STAKES_TIERS,
          qualifyingHands: QUALIFYING_HANDS,
          rules: GENERAL_RULES,
          hourlyRate,
        });
`;

const oldReturn = `
        return res.json({
          pool: {
            amount: Number(pool?.pool_amount || 0),
            handsContributed: Number(pool?.hands_contributed || 0),
            lastHitAt: pool?.last_hit_at,
            lastHitAmount: Number(pool?.last_hit_amount || 0),
          },
          winners: (winners || []).map(w => ({
            id: w.id,
            loserName: w.loser_display_name || 'Player',
            loserHand: w.loser_hand,
            loserCards: w.loser_cards,
            loserPayout: Number(w.loser_payout),
            winnerName: w.winner_display_name || 'Player',
            winnerHand: w.winner_hand,
            winnerCards: w.winner_cards,
            winnerPayout: Number(w.winner_payout),
            totalPayout: Number(w.total_payout),
            awardedAt: w.awarded_at,
            stakesTier: w.stakes_tier,
            gameVariant: w.game_variant,
          })),
          tiers: STAKES_TIERS,
          qualifyingHands: QUALIFYING_HANDS,
          rules: GENERAL_RULES,
          hourlyRate,
        });
`;

apiCode = apiCode.replace(oldCode, replacement);
apiCode = apiCode.replace(oldReturn, replaceReturn);

fs.writeFileSync('pages/api/club-arena/bbj.js', apiCode);
console.log('patched');
