/**
 * Poker Brain -- First-Time Onboarding Flow
 * Walks new users through setup: capture source selection, auto-detect test,
 * variant selection, and a quick tutorial of what each HUD element means.
 */
import React, { useState, useCallback } from 'react';

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Poker Brain',
    body: 'Poker Brain is a real-time HUD that detects your cards from PokerBros and gives you equity calculations, position awareness, and decision recommendations as you play.',
  },
  {
    id: 'capture',
    title: 'Step 1: Choose Capture Source',
    body: 'Point your camera at your phone running PokerBros, or share your screen if playing on desktop. The HUD reads the cards directly from the video feed.',
    action: 'camera',
  },
  {
    id: 'variant',
    title: 'Step 2: Select Your Game',
    body: 'Choose the poker variant you are playing. Poker Brain supports No-Limit Hold\'em, PLO (4-card), PLO5, PLO6, and PLO Hi-Lo. The variant determines how many hole cards to look for and which equity engine to use.',
    action: 'variant',
  },
  {
    id: 'autodetect',
    title: 'Step 3: Card Detection',
    body: 'Poker Brain uses template matching to identify your cards. If detection seems off, try the Auto-Detect mode or use the Calibration tool to fine-tune card region positions. Cards are always in the same location on PokerBros, so calibration is typically one-time.',
  },
  {
    id: 'hud',
    title: 'Step 4: Reading the HUD',
    body: 'The HUD shows: your detected hole cards and board cards, your real-time equity percentage, the recommended action (Fold/Call/Raise) with confidence level, your position at the table, and pot/stack sizes read via OCR. Green means the engine is confident, yellow means marginal, red means low confidence.',
  },
  {
    id: 'done',
    title: 'You are all set',
    body: 'Start playing and Poker Brain will analyze every hand in real-time. Your session data is saved automatically so you can review it later on the Poker Brain dashboard at smarter.poker/pokerbrain.',
  },
];

export default function Onboarding({ onComplete, onSelectCapture, onSelectVariant }) {
  const [step, setStep] = useState(0);
  const [captureMode, setCaptureMode] = useState(null);
  const [variant, setVariant] = useState(null);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      // Mark onboarding complete in localStorage
      try { localStorage.setItem('pokerBrain.onboarded', 'true'); } catch (_e) {}
      if (onComplete) onComplete({ captureMode, variant });
      return;
    }
    setStep(s => s + 1);
  }, [step, isLast, onComplete, captureMode, variant]);

  const handleBack = useCallback(() => {
    setStep(s => Math.max(0, s - 1));
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-800">
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full transition-colors"
              style={{ backgroundColor: i <= step ? '#3b82f6' : '#334155' }}
            />
          ))}
        </div>

        {/* Title */}
        <h2 className="text-lg font-black text-white text-center">{current.title}</h2>

        {/* Body */}
        <p className="text-sm text-slate-300 leading-relaxed">{current.body}</p>

        {/* Action areas */}
        {current.action === 'camera' && (
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={() => {
                setCaptureMode('camera');
                if (onSelectCapture) onSelectCapture('camera');
              }}
              className={
                'px-4 py-2 rounded-lg text-sm font-bold transition-colors ' +
                (captureMode === 'camera' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')
              }
            >
              Camera
            </button>
            <button
              onClick={() => {
                setCaptureMode('screen');
                if (onSelectCapture) onSelectCapture('screen');
              }}
              className={
                'px-4 py-2 rounded-lg text-sm font-bold transition-colors ' +
                (captureMode === 'screen' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')
              }
            >
              Screen Share
            </button>
          </div>
        )}

        {current.action === 'variant' && (
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            {['nlhe', 'plo', 'plo5', 'plo6', 'plo_hilo'].map(v => (
              <button
                key={v}
                onClick={() => {
                  setVariant(v);
                  if (onSelectVariant) onSelectVariant(v);
                }}
                className={
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors uppercase ' +
                  (variant === v ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')
                }
              >
                {v.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          {step > 0 ? (
            <button
              onClick={handleBack}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Back
            </button>
          ) : (
            <button
              onClick={() => {
                try { localStorage.setItem('pokerBrain.onboarded', 'true'); } catch (_e) {}
                if (onComplete) onComplete({});
              }}
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Skip
            </button>
          )}
          <button
            onClick={handleNext}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-6 py-2 rounded-lg transition-colors"
          >
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
