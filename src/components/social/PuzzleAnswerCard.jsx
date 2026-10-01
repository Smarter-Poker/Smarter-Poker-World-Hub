/**
 * PuzzleAnswerCard - the choices under a Phase 7 puzzle post.
 *
 * A puzzle post is an ordinary text post whose body already draws the board
 * through PokerCardText. This card adds what the body cannot: the option
 * buttons, the state of the clock, and after the reveal the correct option
 * with the viewer's own result.
 *
 * Where the truth lives
 *   post.metadata.puzzle        {id, kind, reveal_at, options, rewardable}
 *                               public, written at publish time, never the answer
 *   social_puzzles              read by id, public columns only; correct_option
 *                               and explanation are null until revealed_at is set
 *   social_puzzle_answers       one row per (puzzle, viewer), inserted here with
 *                               user_id = the signed-in profile id under RLS,
 *                               exactly as likes and comments are written
 *
 * What this card never does
 *   - poll or start a timer: the reveal appears on the next feed load, or when
 *     the puzzle author's reveal comment reaches the feed's existing realtime
 *     subscription on social_comments (SOCIAL_COMMENT_UPDATE on the event bus)
 *   - decide in the browser what the database decides: a duplicate (23505) or a
 *     trigger refusal (fn_p7_answer_guard) is shown as a line of text, never a
 *     modal, and the buttons lock
 *   - answer for the puzzle's author or for a signed-out viewer
 *   - show a correct option before social_puzzles.revealed_at is set
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { eventBus } from '../../engine/EventBus';
import { SOCIAL_COLORS as C } from '../../lib/socialHelpers';

export const PUZZLE_PUBLIC_COLUMNS =
  'id, kind, post_id, options, reveal_at, revealed_at, correct_option, explanation, rewardable';
export const ANSWER_COLUMNS = 'puzzle_id, user_id, option, is_correct, reward_result';

const OPTION_KEY = /^[A-D]$/;

/** The options as [{key, label}], or [] when the list is not readable. */
export function puzzleOptions(source) {
  if (!Array.isArray(source)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of source) {
    const key = typeof entry?.key === 'string' ? entry.key : '';
    const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
    if (!OPTION_KEY.test(key) || !label || seen.has(key)) return [];
    seen.add(key);
    out.push({ key, label });
  }
  return out.length >= 2 && out.length <= 4 ? out : [];
}

const parseTime = (value) => {
  if (!value) return NaN;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : NaN;
};

/**
 * 'open' while answers are taken, 'closed' between reveal_at and the reveal,
 * 'revealed' once social_puzzles.revealed_at is set. An unreadable reveal time
 * closes the puzzle: nobody answers against a deadline the card cannot read.
 */
export function puzzlePhase(puzzle, row, nowMs = Date.now()) {
  if (row?.revealed_at) return 'revealed';
  const revealAt = parseTime(row?.reveal_at || puzzle?.reveal_at);
  if (Number.isNaN(revealAt)) return 'closed';
  return nowMs >= revealAt ? 'closed' : 'open';
}

/** The reveal time on the viewer's clock: "6:15 PM", or "Sep 30, 2:15 AM" on another day. */
export function closeTimeLabel(revealAt, nowMs = Date.now()) {
  const atMs = parseTime(revealAt);
  if (Number.isNaN(atMs)) return '';
  const at = new Date(atMs);
  const now = new Date(nowMs);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) return time;
  return `${at.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

/**
 * What a refused insert says. The database is the judge: a unique violation is
 * a second answer; a trigger refusal (fn_p7_answer_guard raises, P0001 unless
 * the migration names a code) is a late, foreign or malformed one; a policy
 * refusal (42501) is a viewer who is not signed in. Anything else is a plain
 * failure the viewer may retry.
 */
export function refusalNotice(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  if (code === '23505' || message.includes('social_puzzle_answers_puzzle_id_user_id')) {
    return { text: 'You Already Answered This One', lock: true };
  }
  if (code === '42501') return { text: 'Sign In To Answer', lock: false };
  if (code === 'P0001' || code === '23514' || /puzzle|reveal|closed|answer_guard/.test(message)) {
    if (/author|own puzzle/.test(message)) return { text: 'This Is Your Puzzle', lock: true };
    if (/option/.test(message) && !/closed|reveal/.test(message)) {
      return { text: 'That Option Is Not On This Puzzle', lock: false };
    }
    return { text: 'Answers Are Closed', lock: true };
  }
  return { text: 'Could Not Save Your Answer, Try Again', lock: false };
}

/** The reward line for a correct answer, from award_diamonds_v2's stored result. */
export function rewardLine(answer, rewardable) {
  if (!answer || answer.is_correct !== true || !rewardable) return '';
  const result = answer.reward_result;
  if (result && result.success === true && Number(result.awarded) > 0) {
    return `${Number(result.awarded)} Diamonds Added To Your Balance`;
  }
  return 'Correct, No Diamonds This Time';
}

const KEY_BADGE = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
};

function optionStyle({ enabled, chosen, correct, wrong }) {
  let border = C.border;
  let background = C.card;
  if (chosen) {
    border = C.blue;
    background = '#E7F3FF';
  }
  if (correct) {
    border = C.green;
    background = '#E9F7E6';
  }
  if (wrong) {
    border = C.red;
    background = '#FDECEC';
  }
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minHeight: 44,
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${border}`,
    background,
    color: C.text,
    fontSize: 14,
    fontWeight: 600,
    textAlign: 'left',
    textTransform: 'none',
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled || chosen || correct || wrong ? 1 : 0.75,
  };
}

export default function PuzzleAnswerCard({ puzzle, postId, authorId, viewerId }) {
  const puzzleId = typeof puzzle?.id === 'string' ? puzzle.id : null;
  const [row, setRow] = useState(null);
  const [myAnswer, setMyAnswer] = useState(null);
  const [notice, setNotice] = useState('');
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const rowRef = useRef(null);
  rowRef.current = row;

  const loadPuzzle = useCallback(async () => {
    if (!puzzleId) return;
    try {
      const { data, error } = await supabase
        .from('social_puzzles')
        .select(PUZZLE_PUBLIC_COLUMNS)
        .eq('id', puzzleId)
        .maybeSingle();
      if (!error && data) setRow(data);
    } catch (e) {
      console.warn('[PuzzleAnswerCard] puzzle read failed:', e?.message || e);
    }
  }, [puzzleId]);

  const loadMyAnswer = useCallback(async () => {
    if (!puzzleId || !viewerId) return;
    try {
      const { data, error } = await supabase
        .from('social_puzzle_answers')
        .select(ANSWER_COLUMNS)
        .eq('puzzle_id', puzzleId)
        .eq('user_id', viewerId)
        .maybeSingle();
      if (!error && data) setMyAnswer(data);
    } catch (e) {
      console.warn('[PuzzleAnswerCard] answer read failed:', e?.message || e);
    }
  }, [puzzleId, viewerId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !puzzleId) return;
    loadPuzzle();
    loadMyAnswer();
  }, [puzzleId, loadPuzzle, loadMyAnswer]);

  // The reveal is a comment by the puzzle author on this post. The feed's
  // realtime channel on social_comments turns every new comment into a
  // SOCIAL_COMMENT_UPDATE, so a comment on an unrevealed puzzle is the one
  // moment worth re-reading the row. No timer, no polling.
  useEffect(() => {
    if (typeof window === 'undefined' || !puzzleId || !postId) return undefined;
    return eventBus.on('SOCIAL_COMMENT_UPDATE', (payload) => {
      if (!payload || payload.postId !== postId || payload.removed) return;
      if (rowRef.current?.revealed_at) return;
      loadPuzzle();
      loadMyAnswer();
    });
  }, [puzzleId, postId, loadPuzzle, loadMyAnswer]);

  const options = puzzleOptions(row?.options || puzzle?.options);
  if (!puzzleId || options.length === 0) return null;

  const phase = puzzlePhase(puzzle, row);
  const isAuthor = Boolean(viewerId) && viewerId === authorId;
  const mine = typeof myAnswer?.option === 'string' ? myAnswer.option : null;
  const canAnswer = phase === 'open' && Boolean(viewerId) && !isAuthor && !mine && !locked && !submitting;
  const correct = phase === 'revealed' && typeof row?.correct_option === 'string' ? row.correct_option : null;
  const correctLabel = correct ? options.find((option) => option.key === correct)?.label || '' : '';
  const rewardable = row?.rewardable === true || puzzle?.rewardable === true;
  const closeTime = closeTimeLabel(row?.reveal_at || puzzle?.reveal_at);

  const answer = async (key) => {
    if (!canAnswer) return;
    setSubmitting(true);
    setNotice('');
    try {
      const { error } = await supabase
        .from('social_puzzle_answers')
        .insert({ puzzle_id: puzzleId, user_id: viewerId, option: key });
      if (error) {
        const refusal = refusalNotice(error);
        setNotice(refusal.text);
        if (refusal.lock) setLocked(true);
        if (error.code === '23505') loadMyAnswer();
        return;
      }
      setMyAnswer({ puzzle_id: puzzleId, user_id: viewerId, option: key, is_correct: null, reward_result: null });
    } catch (e) {
      setNotice(refusalNotice(e).text);
    } finally {
      setSubmitting(false);
    }
  };

  let status = null;
  let result = '';
  if (phase === 'revealed') {
    status = (
      <span>
        The Answer: <strong>{correctLabel || correct}</strong>
      </span>
    );
    if (mine) result = mine === correct ? 'You Got It' : 'Not This Time';
    else if (viewerId && !isAuthor) result = 'You Did Not Answer This One';
  } else if (phase === 'closed') {
    status = <span>Answers Are Closed, The Answer Is Coming</span>;
  } else if (!viewerId) {
    status = (
      <Link prefetch={false} href="/auth/login" style={{ color: C.blue, fontWeight: 600, textDecoration: 'none' }}>
        Sign In To Answer
      </Link>
    );
  } else if (isAuthor) {
    status = <span>This Is Your Puzzle</span>;
  } else if (mine) {
    status = <span>Your Answer Is In. Answers Close At {closeTime}</span>;
  } else {
    status = <span>Answers Close At {closeTime}</span>;
  }
  const reward = rewardLine(myAnswer, rewardable);
  const explanation = phase === 'revealed' && typeof row?.explanation === 'string' ? row.explanation.trim() : '';

  return (
    <div
      className="no-capitalize"
      data-preserve-case="true"
      data-puzzle-card={puzzleId}
      data-puzzle-phase={phase}
      style={{
        margin: '0 12px 12px',
        padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid ${C.border}`,
        background: '#F7F8FA',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        textTransform: 'none',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textSec, letterSpacing: 0.3 }}>
        {rewardable ? 'Pick One, A Correct Answer Can Earn Diamonds' : 'Pick One'}
      </div>
      {options.map((option) => {
        const chosen = mine === option.key;
        const isCorrect = correct === option.key;
        const wrong = Boolean(correct) && chosen && !isCorrect;
        return (
          <button
            key={option.key}
            type="button"
            disabled={!canAnswer}
            aria-pressed={chosen}
            data-option={option.key}
            onClick={() => answer(option.key)}
            style={optionStyle({ enabled: canAnswer, chosen, correct: isCorrect, wrong })}
          >
            <span
              style={{
                ...KEY_BADGE,
                background: isCorrect ? C.green : chosen ? C.blue : C.border,
                color: isCorrect || chosen ? '#FFFFFF' : C.text,
              }}
            >
              {option.key}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>{option.label}</span>
            {isCorrect && <span style={{ fontSize: 12, color: C.green }}>Correct</span>}
            {wrong && <span style={{ fontSize: 12, color: C.red }}>Your Pick</span>}
            {chosen && !correct && <span style={{ fontSize: 12, color: C.blue }}>Your Pick</span>}
          </button>
        );
      })}
      <div data-puzzle-status="true" style={{ fontSize: 13, color: C.textSec, lineHeight: 1.4 }}>
        {status}
        {result && (
          <span style={{ marginLeft: 6, fontWeight: 700, color: result === 'You Got It' ? C.green : C.text }}>
            {result}
          </span>
        )}
      </div>
      {reward && <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{reward}</div>}
      {explanation && (
        <div data-puzzle-explanation="true" style={{ fontSize: 14, color: C.text, lineHeight: 1.4 }}>
          {explanation}
        </div>
      )}
      {notice && (
        <div role="status" style={{ fontSize: 13, fontWeight: 600, color: C.red }}>
          {notice}
        </div>
      )}
    </div>
  );
}
