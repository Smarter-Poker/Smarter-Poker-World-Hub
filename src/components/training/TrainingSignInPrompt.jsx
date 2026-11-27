/**
 * TrainingSignInPrompt
 *
 * Training reference pages are open to everyone (Dan, 2026-10-12: "THEY
 * SHOULD OPEN TO EVERYONE"). When a signed-out visitor reaches an action that
 * belongs to an account (submitting a graded answer, creating or joining a
 * study group, registering), the page shows this prompt instead of failing.
 * It links to the app's existing sign-in route with a return path, the same
 * `/auth/login?redirect=` contract every other hub page uses; the login page
 * only honours internal paths.
 */
import React from 'react';
import Link from 'next/link';

export function trainingSignInHref(returnPath) {
  const path = typeof returnPath === 'string'
    && returnPath.startsWith('/')
    && !returnPath.startsWith('//')
    ? returnPath
    : '/hub/training';
  return `/auth/login?redirect=${encodeURIComponent(path)}`;
}

export default function TrainingSignInPrompt({ returnPath, message, style }) {
  return (
    <div
      role="note"
      data-training-sign-in-prompt="true"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '12px 14px',
        marginBottom: 14,
        background: 'linear-gradient(165deg, #0c2031 0%, #040d18 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box',
        border: '2px solid transparent',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.2)',
        fontSize: 14,
        lineHeight: 1.5,
        color: '#f3f7fb',
        ...style,
      }}
    >
      <span>{message || 'Sign In To Save Your Progress.'}</span>
      <Link
        href={trainingSignInHref(returnPath)}
        className="sd-button sd-primary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: 44,
          padding: '0 18px',
          border: '2px solid transparent',
          borderRadius: 10,
          background: 'linear-gradient(180deg, #51c9ff 0%, #0873ff 10%, #0648e2 38%, #022695 82%, #0b71c4 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box',
          boxShadow: 'inset 0 1px 2px #b9efff, 0 4px 12px rgba(6,115,199,0.32)',
          color: '#ffffff',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Sign In
      </Link>
    </div>
  );
}
