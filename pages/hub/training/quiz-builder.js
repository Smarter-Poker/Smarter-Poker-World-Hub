/**
 * CUSTOM QUIZ BUILDER — User-Generated GTO Scenarios
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Build custom multi-choice quizzes from GTO concepts.
 * Set scenarios, save, share, and challenge friends.
 *
 * Route: /hub/training/quiz-builder
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-43 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-35 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { evaluateTrainingSpotWithHorseBrain, buildCustomTrainingArenaHref } from '../../../src/lib/training/horseBrainTrainingAdapter';
// TRAIN-WIRE-EMPTY-8b — adoption: shared empty-state primitive

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// QUIZ TEMPLATES
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const POSITION_OPTIONS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STREET_OPTIONS = ['Preflop', 'Flop', 'Turn', 'River'];
const ACTION_OPTIONS = [
  'Fold',
  'Call',
  'Raise 2.5x',
  'Raise 3x',
  'Check',
  'Bet 33%',
  'Bet 50%',
  'Bet 75%',
  'Bet 100%',
  'All-In',
];
const BOARD_TEXTURES = ['Dry', 'Wet', 'Monotone', 'Paired', 'Connected', 'Rainbow'];

const DEFAULT_QUESTION = {
  position: 'BTN',
  vilPosition: 'BB',
  street: 'Preflop',
  boardTexture: 'Dry',
  scenario: '',
  correctAction: 'Raise 3x',
  options: ['Fold', 'Call', 'Raise 3x', 'All-In'],
  explanation: '',
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// QUESTION EDITOR COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function QuestionEditor({ question, index, onChange, onRemove }) {
  const update = (field, value) => {
    onChange(index, { ...question, [field]: value });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      style={{
        padding: '16px',
        borderRadius: 14,
        marginBottom: 10,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-cyan)' }}>Q{index + 1}</div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => onRemove(index)}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: 'rgba(239,68,68,0.1)',
            border: 'none',
            color: 'var(--sp-accent-red)',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </motion.button>
      </div>

      {/* Position Row */}
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--sp-fg-dim)',
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            YOUR POS
          </div>
          <select
            aria-label={`Question ${index + 1} Game Type`}
            value={question.position}
            onChange={(e) => update('position', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--sp-fg)',
              fontSize: 12,
            }}
          >
            {POSITION_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--sp-fg-dim)',
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            VILLAIN
          </div>
          <select
            aria-label={`Question ${index + 1} Difficulty`}
            value={question.vilPosition}
            onChange={(e) => update('vilPosition', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--sp-fg)',
              fontSize: 12,
            }}
          >
            {POSITION_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--sp-fg-dim)',
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            STREET
          </div>
          <select
            aria-label={`Question ${index + 1} Position`}
            value={question.street}
            onChange={(e) => update('street', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--sp-fg)',
              fontSize: 12,
            }}
          >
            {STREET_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scenario */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--sp-fg-dim)',
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          SCENARIO
        </div>
        <textarea
          value={question.scenario}
          onChange={(e) => update('scenario', e.target.value)}
          placeholder="e.g. Hero opens BTN to 2.5x, BB 3-bets to 8x. Hero holds AKo. What is the best action?"
          rows={2}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--sp-fg)',
            fontSize: 12,
            resize: 'vertical',
            fontFamily: 'Inter, sans-serif',
          }}
        />
      </div>

      {/* Correct Action */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--sp-fg-dim)',
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          CORRECT ACTION
        </div>
        <select
          aria-label={`Question ${index + 1} Correct Answer`}
          value={question.correctAction}
          onChange={(e) => update('correctAction', e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--sp-accent-green)',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* Explanation */}
      <div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--sp-fg-dim)',
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          EXPLANATION (OPTIONAL)
        </div>
        <textarea
          value={question.explanation}
          onChange={(e) => update('explanation', e.target.value)}
          placeholder="Why is this the correct play?"
          rows={2}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--sp-fg)',
            fontSize: 12,
            resize: 'vertical',
            fontFamily: 'Inter, sans-serif',
          }}
        />
      </div>
    </motion.div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function QuizBuilderPage() {
  const router = useRouter();
  useTrainingBus('quiz-builder');
  const [quizName, setQuizName] = useState('');
  const [questions, setQuestions] = useState([{ ...DEFAULT_QUESTION }]);
  const [savedQuizzes, setSavedQuizzes] = useState([]);
  const [tab, setTab] = useState('build');
  const [brainVariant, setBrainVariant] = useState('nlh');
  const brainPreview = useMemo(
    () =>
      evaluateTrainingSpotWithHorseBrain({
        variant: brainVariant,
        street: 'flop',
        heroPosition: 'BTN',
        villainPosition: 'BB',
        heroCards:
          brainVariant === 'plo6'
            ? ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d']
            : brainVariant === 'plo5'
              ? ['As', 'Ks', 'Qh', 'Jh', 'Td']
              : brainVariant === 'plo4'
                ? ['As', 'Ks', 'Qh', 'Jh']
                : ['As', 'Kd'],
        boardCards: ['Qs', '7d', '2c'],
        potSizeBb: 12,
        facingBetBb: 4,
        effectiveStackBb: 100,
      }),
    [brainVariant]
  );

  // Load saved quizzes from localStorage and server tool-records
  useEffect(() => {
    try {
      const saved = localStorage.getItem('custom-quizzes');
      if (saved) setSavedQuizzes(JSON.parse(saved));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    authedFetch('/api/training/tool-records?tool_id=quiz-builder&limit=20')
      .then((res) => (res && res.ok ? res.json() : null))
      .then((json) => {
        const rows = Array.isArray(json?.records) ? json.records : Array.isArray(json?.data) ? json.data : [];
        const remoteQuizzes = [];
        rows.forEach((r) => {
          const single = r?.payload?.quiz || r?.data?.quiz;
          if (single && single.id && single.name && Array.isArray(single.questions)) {
            remoteQuizzes.push(single);
          }
          const snap = r?.payload?.savedQuizzes || r?.data?.savedQuizzes;
          if (Array.isArray(snap)) {
            snap.forEach((q) => {
              if (q && q.id && q.name && Array.isArray(q.questions)) {
                remoteQuizzes.push(q);
              }
            });
          }
        });
        if (remoteQuizzes.length > 0) {
          setSavedQuizzes((prev) => {
            const byId = new Map();
            [...remoteQuizzes, ...prev].forEach((q) => byId.set(q.id, q));
            const merged = Array.from(byId.values());
            try {
              localStorage.setItem('custom-quizzes', JSON.stringify(merged));
            } catch (_e) {}
            return merged;
          });
        }
      })
      .catch(() => {});
  }, []);

  // Bus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => {});
    return unsub;
  }, []);

  const addQuestion = () => {
    setQuestions([...questions, { ...DEFAULT_QUESTION }]);
  };

  const removeQuestion = (idx) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx, updated) => {
    const newQuestions = [...questions];
    newQuestions[idx] = updated;
    setQuestions(newQuestions);
  };

  const saveQuiz = () => {
    if (!quizName.trim() || questions.length === 0) return;
    const quiz = {
      id: `quiz-${Date.now()}`,
      name: quizName,
      questions,
      createdAt: Date.now(),
      plays: 0,
    };
    const updated = [...savedQuizzes, quiz];
    setSavedQuizzes(updated);
    try {
      localStorage.setItem('custom-quizzes', JSON.stringify(updated));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    authedFetch('/api/training/tool-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_id: 'quiz-builder',
        record_key: String(quiz.id),
        record_type: 'custom_quiz',
        title: quiz.name,
        summary: `${quiz.questions.length} question(s)`,
        payload: { quiz },
      }),
    }).catch(() => {});
    setQuizName('');
    setQuestions([{ ...DEFAULT_QUESTION }]);
    setTab('saved');
  };

  const deleteQuiz = (quizId) => {
    const updated = savedQuizzes.filter((q) => q.id !== quizId);
    setSavedQuizzes(updated);
    try {
      localStorage.setItem('custom-quizzes', JSON.stringify(updated));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    authedFetch('/api/training/tool-records', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_id: 'quiz-builder', record_key: String(quizId) }),
    }).catch(() => {});
  };

  return (
    <>
      <SEOHead
        title="Custom GTO Poker Quiz Builder"
        description="Create, Save, And Practice Custom Multi-Question GTO Poker Strategy Quizzes With Custom Board Textures, Stack Sizes, And Explanations On Smarter.Poker."
        canonical="/hub/training/quiz-builder"
      />
      <div
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ←
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Quiz Builder</div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>Create Custom GTO Scenarios</div>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(0,0,0,0.15)',
          }}
        >
          {[
            { id: 'build', label: 'Build Quiz' },
            { id: 'saved', label: `My Quizzes (${savedQuizzes.length})` },
          ].map((t) => (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: 6,
                border: `1px solid ${tab === t.id ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                background: tab === t.id ? 'rgba(0,212,255,0.06)' : 'transparent',
                color: tab === t.id ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </motion.button>
          ))}
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* BUILD TAB */}
          {tab === 'build' && (
            <>
              {/* Quiz Name */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sp-fg-dim)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  QUIZ NAME
                </div>
                <input
                  value={quizName}
                  onChange={(e) => setQuizName(e.target.value)}
                  placeholder="e.g. BTN vs BB 3-Bet Defense"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--sp-fg)',
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: 'Inter, sans-serif',
                  }}
                />
              </div>

              {/* Questions */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                QUESTIONS ({questions.length})
              </div>

              <AnimatePresence>
                {questions.map((q, i) => (
                  <QuestionEditor
                    key={i}
                    question={q}
                    index={i}
                    onChange={updateQuestion}
                    onRemove={removeQuestion}
                  />
                ))}
              </AnimatePresence>

              {/* Add + Save */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={addQuestion}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--sp-fg-muted)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + Add Question
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={saveQuiz}
                  disabled={!quizName.trim()}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 10,
                    border: 'none',
                    background: quizName.trim()
                      ? 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-blue-rgb), 1))'
                      : 'rgba(255,255,255,0.05)',
                    color: quizName.trim() ? '#fff' : 'var(--sp-fg-faint)',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: quizName.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Save Quiz
                </motion.button>
              </div>
            </>
          )}

          {/* SAVED QUIZZES TAB */}
          {tab === 'saved' && (
            <>
              {savedQuizzes.length === 0 && (
                <TrainerEmptyState
                  variant="no-data"
                  title="No quizzes yet"
                  message="Switch to the Build tab to create your first quiz."
                  compact
                />
              )}
              {savedQuizzes.map((quiz) => (
                <motion.div
                  key={quiz.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    marginBottom: 8,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sp-fg)' }}>
                      {quiz.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
                      {quiz.questions.length} Questions · Created{' '}
                      {new Date(quiz.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => deleteQuiz(quiz.id)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.15)',
                        color: 'var(--sp-accent-red)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </>
          )}

          {/* Horse Brain Spot Preview & 1:1 Club Arena Launcher */}
          <div
            data-specialty-brain-panel="true"
            data-brain-engine={brainPreview?.engineModule || 'holdem-brain.js'}
            data-recommended-action={brainPreview?.recommendedAction || 'Call'}
            style={{
              marginTop: 18,
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid rgba(0,212,255,0.22)',
              background: 'rgba(10,15,30,0.65)',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 800, color: 'var(--sp-accent-cyan)' }}>Horse Brain Spot Preview</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['nlh', 'plo4', 'plo5', 'plo6'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-brain-variant-tab={v}
                    onClick={() => setBrainVariant(v)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: brainVariant === v ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,0.14)',
                      background: brainVariant === v ? 'rgba(0,212,255,0.16)' : 'rgba(255,255,255,0.04)',
                      color: brainVariant === v ? '#67e8f9' : '#cbd5e1',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: '#cbd5e1', marginBottom: 12 }}>
              <span>Engine: <strong style={{ color: '#67e8f9' }}>{brainPreview?.engineModule}</strong></span>
              <span data-brain-action={brainPreview?.recommendedAction}>Action: <strong style={{ color: '#4ade80' }}>{brainPreview?.recommendedAction}</strong></span>
              <span data-brain-made-hand={brainPreview?.madeHandCategory}>Hand: <strong>{brainPreview?.madeHandCategory}</strong></span>
              <span data-brain-pot-limit-max={brainPreview?.potLimitSizing?.maxPotBetOrRaise || 100}>Max: <strong>{brainPreview?.potLimitSizing?.maxPotBetOrRaise || 100} BB</strong></span>
            </div>
            <button
              type="button"
              data-launch-club-arena-cta="true"
              onClick={() => router.push(buildCustomTrainingArenaHref({ format: 'cash', variant: brainVariant, streets: ['flop'], positions: ['BTN'], stackDepth: 100 }, 'quiz-builder'))}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid rgba(0,212,255,0.35)',
                background: 'rgba(0,212,255,0.12)',
                color: '#67e8f9',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Launch 1:1 Club Arena Drill
            </button>
          </div>
        </div>
      </div>
      <HubPageSummary page="training-quiz-builder" />
    </>
  );
}
