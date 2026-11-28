/* The Sign In Required sheet shown when a signed-out visitor opens Log Session.

   Moved verbatim out of pages/hub/bankroll-manager.js in the 2026-11-28 page
   split. The page still owns every piece of state and every handler and
   passes in exactly the ones this view reads, so its behaviour, text,
   accessible names and test ids are unchanged. */

import { motion } from 'framer-motion';
import { openQuickSignup } from '../../seo/SmarterQuickSignupSheet';

export default function LogSignInPrompt({
  closeLogModal, router, signInScrim
}) {
  return (
    <motion.div
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Above the header (100) and bottom nav (90): fixed overlays
        // render at z >= 900 (mobile standard).
        zIndex: 1000,
      }}
      {...signInScrim}
    >
      <motion.div
        className="sd-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bankroll-sign-in-title"
        aria-describedby="bankroll-sign-in-description"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        style={{
          borderRadius: 16,
          padding: 'clamp(16px, 5vw, 28px)',
          textAlign: 'center',
          width: 'min(400px, calc(100% - 24px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="bankroll-sign-in-title" className="sd-section-title">Sign In Required</h2>
        <p id="bankroll-sign-in-description" style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.6)', margin: '0 0 24px' }}>
          Create A Free Account Or Sign In To Log Your Poker Sessions And Track Your Bankroll.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              closeLogModal();
              openQuickSignup({
                unlockKey: 'calculator-pro-bankroll-manager',
                source: 'bankroll-manager-log-modal',
                redirectPath: '/hub/bankroll-manager',
                eyebrow: 'Free Poker Bankroll Ledger',
                title: 'Log Sessions & Track Your Bankroll Free',
                subtitle: 'Create Your Free Smarter.Poker Account In 10 Seconds To Save Sessions, W-2G Tax Logs & Risk Of Ruin Across Devices.',
              });
            }}
            className="sd-button sd-primary"
          >
            Create Free Account
          </button>
          <button
            type="button"
            onClick={() => router.push('/auth/login?redirect=/hub/bankroll-manager')}
            className="sd-button"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={closeLogModal}
            className="sd-button"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
