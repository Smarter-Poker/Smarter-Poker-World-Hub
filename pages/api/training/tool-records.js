import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { verifyTrainingDuelToken } from '../../../src/lib/training/gradingReceipt.mjs';

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

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const SAFE_KEY = /^[a-z0-9][a-z0-9_.:-]{0,159}$/i;

function validObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export default async function handler(req, res) {
  withTiming(res);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  const limitGroup = req.method === 'GET' ? LIMITS.read : LIMITS.write;
  if (!applyRateLimit(req, res, limitGroup)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
  const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
  if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  try {
    if (req.method === 'GET') {
      const toolId = String(req.query.toolId || '');
      const recordType = req.query.recordType ? String(req.query.recordType) : '';
      const duelToken = typeof req.query.duelToken === 'string' ? req.query.duelToken.trim() : '';
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
      if (!SAFE_ID.test(toolId) || (recordType && !SAFE_ID.test(recordType))) {
        return res.status(400).json({ success: false, error: 'Invalid tool or record type' });
      }

      if (toolId === 'async-duel' && duelToken) {
        const duelPayload = verifyTrainingDuelToken(duelToken);
        if (!duelPayload) {
          return res.status(400).json({
            success: false,
            error: 'Invalid or expired duel challenge token.',
            code: 'TRAINING_DUEL_TOKEN_INVALID',
          });
        }
        const { data: duelRows, error: duelErr } = await getSupabase()
          .from('training_tool_records')
          .select('id, user_id, record_key, data, created_at, updated_at')
          .eq('tool_id', 'async-duel')
          .ilike('record_key', `${duelPayload.duelId}%`)
          .order('created_at', { ascending: true })
          .limit(20);
        if (duelErr) throw duelErr;

        const participants = Array.isArray(duelRows) ? duelRows : [];
        const allParticipantAttemptIds = Array.from(
          new Set(
            [
              duelPayload.challengerAttemptId,
              ...participants.map((r) => r?.data?.attemptId),
            ]
              .map((x) => String(x || '').trim())
              .filter(Boolean)
          )
        );

        let answerRows = [];
        if (allParticipantAttemptIds.length > 0) {
          const { data: answers, error: ansErr } = await getSupabase()
            .from('training_answers')
            .select('attempt_id, user_id, question_id, hand_ordinal, answer_id, is_correct, ev_loss, classification, selected_frequency, optimal_frequency, solver_verified')
            .in('attempt_id', allParticipantAttemptIds.slice(0, 10))
            .order('hand_ordinal', { ascending: true });
          if (ansErr) throw ansErr;
          answerRows = Array.isArray(answers) ? answers : [];
        }

        const countAnswersForAttempt = (attId) =>
          attId ? answerRows.filter((row) => String(row.attempt_id) === String(attId)).length : 0;

        const challengerUserId = String(duelPayload.challengerId || duelPayload.challengerUserId || '');
        const challengerCandidates = participants.filter(
          (r) =>
            (challengerUserId && String(r?.user_id || '') === challengerUserId) ||
            String(r?.data?.role || '') === 'challenger' ||
            String(r?.data?.attemptId || '') === String(duelPayload.challengerAttemptId || '')
        );
        // Prefer the challenger attempt that actually has recorded answers (in case minting created a seed attempt first)
        const challengerRecord =
          challengerCandidates.find((r) => countAnswersForAttempt(r?.data?.attemptId) > 0) ||
          challengerCandidates[0] ||
          participants[0] ||
          null;

        const challengerAttemptId = String(
          challengerRecord?.data?.attemptId || duelPayload.challengerAttemptId || ''
        );

        const opponentCandidates = participants.filter(
          (r) =>
            r?.data?.attemptId &&
            String(r.data.attemptId) !== challengerAttemptId &&
            String(r.data.attemptId) !== String(duelPayload.challengerAttemptId || '') &&
            (String(r?.data?.role || '') === 'opponent' ||
              (challengerUserId && String(r?.user_id || '') !== challengerUserId))
        );
        const opponentRecord =
          opponentCandidates.find(
            (r) => challengerUserId && String(r?.user_id || '') !== challengerUserId && countAnswersForAttempt(r?.data?.attemptId) > 0
          ) ||
          opponentCandidates.find((r) => countAnswersForAttempt(r?.data?.attemptId) > 0) ||
          opponentCandidates.find((r) => challengerUserId && String(r?.user_id || '') !== challengerUserId) ||
          opponentCandidates[0] ||
          null;

        const opponentAttemptId = String(opponentRecord?.data?.attemptId || '');

        const requiredHands = Math.max(
          1,
          Number(duelPayload.targetHands || (Array.isArray(duelPayload.questionIds) && duelPayload.questionIds.length) || 10)
        );
        const lockedQuestionSet = new Set(
          (Array.isArray(duelPayload.questionIds) ? duelPayload.questionIds : []).map(String)
        );

        const buildPlayerSummary = (attemptId, fallbackName, roleLabel) => {
          const rowsForAttempt = attemptId
            ? answerRows.filter((row) => String(row.attempt_id) === String(attemptId))
            : [];
          const byQuestion = new Map();
          for (const row of rowsForAttempt) {
            const qId = String(row.question_id || '');
            if (lockedQuestionSet.size > 0 && qId && !lockedQuestionSet.has(qId)) {
              continue;
            }
            const key = String(row.question_id || row.hand_ordinal);
            if (!byQuestion.has(key)) byQuestion.set(key, row);
          }
          const uniqueAnswers = Array.from(byQuestion.values()).slice(0, requiredHands);
          const handsAnswered = uniqueAnswers.length;
          const correctCount = uniqueAnswers.filter((r) => Boolean(r.is_correct)).length;
          const totalEvLoss = Number(
            uniqueAnswers.reduce((sum, r) => sum + (Number(r.ev_loss) || 0), 0).toFixed(2)
          );
          const accuracyPct = handsAnswered > 0
            ? Math.round((correctCount / handsAnswered) * 100)
            : 0;
          return {
            role: roleLabel,
            name: fallbackName,
            attemptId: attemptId || null,
            handsAnswered,
            correctCount,
            accuracyPct,
            totalEvLoss,
            avgEvLoss: handsAnswered > 0 ? Number((totalEvLoss / handsAnswered).toFixed(2)) : 0,
            grades: uniqueAnswers.map((r) => ({
              questionId: r.question_id,
              handOrdinal: r.hand_ordinal,
              answerId: r.answer_id,
              isCorrect: Boolean(r.is_correct),
              evLoss: Number(r.ev_loss) || 0,
              classification: r.classification || (r.is_correct ? 'best' : 'mistake'),
              solverVerified: Boolean(r.solver_verified),
            })),
          };
        };

        const challengerSummary = buildPlayerSummary(
          challengerAttemptId,
          challengerRecord?.data?.participantName || duelPayload.challengerName || 'Challenger',
          'Challenger'
        );
        const opponentSummary = buildPlayerSummary(
          opponentAttemptId,
          opponentRecord?.data?.participantName || (opponentAttemptId ? 'Opponent' : 'Awaiting Opponent'),
          'Opponent'
        );

        let status = 'awaiting_opponent';
        let winner = null;
        if (challengerSummary.handsAnswered >= requiredHands && opponentSummary.handsAnswered >= requiredHands) {
          status = 'completed';
          if (challengerSummary.accuracyPct > opponentSummary.accuracyPct) {
            winner = 'Challenger';
          } else if (opponentSummary.accuracyPct > challengerSummary.accuracyPct) {
            winner = 'Opponent';
          } else if (challengerSummary.totalEvLoss < opponentSummary.totalEvLoss) {
            winner = 'Challenger';
          } else if (opponentSummary.totalEvLoss < challengerSummary.totalEvLoss) {
            winner = 'Opponent';
          } else {
            winner = 'Tie';
          }
        } else if (challengerSummary.handsAnswered > 0 || opponentSummary.handsAnswered > 0 || opponentAttemptId) {
          status = 'in_progress';
        }

        return res.status(200).json({
          success: true,
          duelScoreboard: {
            duelId: duelPayload.duelId,
            gameId: duelPayload.gameId,
            level: duelPayload.level,
            variant: duelPayload.variant || 'nlh',
            targetHands: requiredHands,
            questionIds: duelPayload.questionIds,
            status,
            winner,
            challenger: challengerSummary,
            opponent: opponentSummary,
          },
          records: participants,
        });
      }

      let query = getSupabase()
        .from('training_tool_records')
        .select('id, tool_id, record_type, record_key, data, created_at, updated_at')
        .eq('user_id', user.id)
        .eq('tool_id', toolId)
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (recordType) query = query.eq('record_type', recordType);
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ success: true, records: data || [] });
    }

    if (req.method === 'POST') {
      const toolId = String(req.body?.toolId || '');
      const recordType = String(req.body?.recordType || 'state');
      const recordKey = String(req.body?.recordKey || '');
      const data = req.body?.data;
      if (!SAFE_ID.test(toolId) || !SAFE_ID.test(recordType) || !SAFE_KEY.test(recordKey)) {
        return res.status(400).json({ success: false, error: 'Invalid tool record identifiers' });
      }
      if (!validObject(data)) {
        return res.status(400).json({ success: false, error: 'data must be an object' });
      }
      if (JSON.stringify(data).length > 65536) {
        return res.status(413).json({ success: false, error: 'Tool record is too large' });
      }

      const now = new Date().toISOString();
      const { data: saved, error } = await getSupabase()
        .from('training_tool_records')
        .upsert({
          user_id: user.id,
          tool_id: toolId,
          record_type: recordType,
          record_key: recordKey,
          data,
          updated_at: now,
        }, { onConflict: 'user_id,tool_id,record_key' })
        .select('id, tool_id, record_type, record_key, data, created_at, updated_at')
        .maybeSingle();
      if (error) throw error;
      if (!saved) throw new Error('Tool record write returned no row');
      return res.status(200).json({ success: true, record: saved });
    }

    if (req.method === 'DELETE') {
      const toolId = String(req.body?.toolId || '');
      const recordKey = String(req.body?.recordKey || '');
      if (!SAFE_ID.test(toolId) || !SAFE_KEY.test(recordKey)) {
        return res.status(400).json({ success: false, error: 'Invalid tool record identifiers' });
      }
      const { error } = await getSupabase()
        .from('training_tool_records')
        .delete()
        .eq('user_id', user.id)
        .eq('tool_id', toolId)
        .eq('record_key', recordKey);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.warn('[TrainingToolRecords]', error?.message || error);
    return res.status(500).json({ success: false, error: 'Training tool record request failed' });
  }
}
