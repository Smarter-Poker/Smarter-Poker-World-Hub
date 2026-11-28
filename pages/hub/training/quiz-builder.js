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
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { encodeSharedDrillPack } from '../../../src/lib/training/trainingPresets.mjs';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
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
    <motion.section
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={`sd-panel ${st.panel}`}
      aria-label={`Question ${index + 1}`}
    >
      <div className={st.panelHead}>
        <h3 className={st.title}>Question {index + 1}</h3>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => onRemove(index)}
          aria-label={`Remove Question ${index + 1}`}
          className={`sd-button ${st.close}`}
        >
          ✕
        </motion.button>
      </div>

      {/* Position Row */}
      <div className={st.grid3}>
        <label className={st.field}>
          <span className={st.label}>Your Position</span>
          <select
            aria-label={`Question ${index + 1} Game Type`}
            value={question.position}
            onChange={(e) => update('position', e.target.value)}
            className={st.input}
          >
            {POSITION_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className={st.field}>
          <span className={st.label}>Villain</span>
          <select
            aria-label={`Question ${index + 1} Difficulty`}
            value={question.vilPosition}
            onChange={(e) => update('vilPosition', e.target.value)}
            className={st.input}
          >
            {POSITION_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className={st.field}>
          <span className={st.label}>Street</span>
          <select
            aria-label={`Question ${index + 1} Position`}
            value={question.street}
            onChange={(e) => update('street', e.target.value)}
            className={st.input}
          >
            {STREET_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Scenario */}
      <label className={st.field}>
        <span className={st.label}>Scenario</span>
        <textarea
          value={question.scenario}
          onChange={(e) => update('scenario', e.target.value)}
          placeholder="e.g. Hero opens BTN to 2.5x, BB 3-bets to 8x. Hero holds AKo. What is the best action?"
          rows={2}
          className={st.input}
        />
      </label>

      {/* Correct Action */}
      <label className={st.field}>
        <span className={st.label}>Correct Action</span>
        <select
          aria-label={`Question ${index + 1} Correct Answer`}
          value={question.correctAction}
          onChange={(e) => update('correctAction', e.target.value)}
          className={st.input}
        >
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>

      {/* Explanation */}
      <label className={st.field}>
        <span className={st.label}>Explanation (Optional)</span>
        <textarea
          value={question.explanation}
          onChange={(e) => update('explanation', e.target.value)}
          placeholder="Why is this the correct play?"
          rows={2}
          className={st.input}
        />
      </label>
    </motion.section>
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
  const [sharedPackCopied, setSharedPackCopied] = useState(false);
  const sharedQuizPackToken = useMemo(() => {
    const firstQ = questions[0] || DEFAULT_QUESTION;
    return encodeSharedDrillPack({
      title: quizName.trim() || `${brainVariant.toUpperCase()} Custom Study Pack`,
      format: 'cash',
      variant: brainVariant,
      heroPosition: firstQ.position || 'BTN',
      targetStreet: String(firstQ.street || 'flop').toLowerCase(),
      stackDepthBb: 100,
      questionsCount: Math.max(5, questions.length || 10),
    });
  }, [quizName, brainVariant, questions]);

  const copySharedQuizPackLink = useCallback(async () => {
    const firstQ = questions[0] || DEFAULT_QUESTION;
    const baseHref = buildCustomTrainingArenaHref(
      {
        format: 'cash',
        variant: brainVariant,
        streets: [String(firstQ.street || 'flop').toLowerCase()],
        positions: [firstQ.position || 'BTN'],
        stackDepth: 100,
      },
      'shared-drill-pack',
    );
    const sep = baseHref.includes('?') ? '&' : '?';
    const relativeUrl = `${baseHref}${sep}pack=${encodeURIComponent(sharedQuizPackToken)}`;
    const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${relativeUrl}` : relativeUrl;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
      }
    } catch (_) {
      /* ignore clipboard restrictions */
    }
    setSharedPackCopied(true);
    setTimeout(() => setSharedPackCopied(false), 2600);
  }, [questions, brainVariant, sharedQuizPackToken]);

  // Load saved quizzes from localStorage and server tool-records
  useEffect(() => {
    try {
      const saved = localStorage.getItem('custom-quizzes');
      if (saved) setSavedQuizzes(JSON.parse(saved));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    if (!getAuthUser()?.id) return;
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
      <div className={st.shell}>
        <TrainingPageHead slug="training-quiz-builder" note="Create Custom GTO Scenarios" />

        <div className={st.page}>
        {/* Tabs */}
        <div className={`sd-tabs ${st.grid2}`} role="tablist" aria-label="Quiz Builder Views">
          {[
            { id: 'build', label: 'Build Quiz' },
            { id: 'saved', label: `My Quizzes (${savedQuizzes.length})` },
          ].map((t) => (
            <motion.button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setTab(t.id)}
              className="sd-button"
            >
              {t.label}
            </motion.button>
          ))}
        </div>

          {/* BUILD TAB */}
          {tab === 'build' && (
            <>
              {/* Quiz Name */}
              <section className={`sd-panel ${st.panel}`} aria-label="Quiz Details">
                <label className={st.field}>
                  <span className={st.label}>Quiz Name</span>
                  <input
                    value={quizName}
                    onChange={(e) => setQuizName(e.target.value)}
                    placeholder="e.g. BTN vs BB 3-Bet Defense"
                    className={st.input}
                  />
                </label>
                <p className={st.eyebrow}>Questions ({questions.length})</p>
              </section>

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

              {/* Add + Save + Share Study Group Pack */}
              <div className={st.actions}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={addQuestion}
                  className="sd-button"
                >
                  + Add Question
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  data-copy-shared-drill-pack="true"
                  data-shared-pack-token={sharedQuizPackToken}
                  onClick={copySharedQuizPackLink}
                  className="sd-button"
                >
                  {sharedPackCopied ? 'Shared Pack Link Copied!' : 'Copy Shared Drill Pack Link'}
                </motion.button>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={saveQuiz}
                disabled={!quizName.trim()}
                className={`sd-button sd-primary ${st.block}`}
              >
                Save Quiz
              </motion.button>
              {!quizName.trim() && <p className={st.small}>Name The Quiz To Save It.</p>}
            </>
          )}

          {/* SAVED QUIZZES TAB */}
          {tab === 'saved' && (
            <>
              {savedQuizzes.length === 0 && (
                <TrainerEmptyState
                  variant="no-data"
                  title="No Quizzes Yet"
                  message="Switch To The Build Tab To Create Your First Quiz."
                  compact
                />
              )}
              <div className={st.list}>
              {savedQuizzes.map((quiz) => (
                <motion.div
                  key={quiz.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`${st.item} ${st.rowItem}`}
                >
                  <div>
                    <div className={st.itemTitle}>
                      {quiz.name}
                    </div>
                    <div className={st.small}>
                      {quiz.questions.length} Questions · Created{' '}
                      {new Date(quiz.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => deleteQuiz(quiz.id)}
                    aria-label={`Delete ${quiz.name}`}
                    className="sd-button"
                  >
                    Delete
                  </motion.button>
                </motion.div>
              ))}
              </div>
            </>
          )}

          <details
            className="sp-mtt-disclosure"
            data-quiz-builder-advanced="true"
          >
            <summary>
              <span>Horse Brain Spot Reference &amp; 1:1 Club Arena Launcher</span>
            </summary>
            <div className="sp-mtt-disclosure__body">
            </div>
          </details>
        </div>
      </div>
      <div style={{ maxWidth: 1120, margin: '24px auto', padding: '0 16px' }}>
        <SmarterAccountUnlockGate
          variant="study-deck"
          context="training-quiz-builder"
          redirectPath="/hub/training/quiz-builder"
        />
      </div>
      <HubPageSummary page="training-quiz-builder" />
    </>
  );
}
