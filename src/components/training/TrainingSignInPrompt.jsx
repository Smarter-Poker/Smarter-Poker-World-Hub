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
        background: 'rgba(37,200,255,0.06)',
        border: '1px solid rgba(37,200,255,0.28)',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.5,
        color: 'var(--sp-fg-muted, #c7d2de)',
        ...style,
      }}
    >
      <span>{message || 'Sign In To Save Your Progress.'}</span>
      <Link
        href={trainingSignInHref(returnPath)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: 44,
          padding: '0 16px',
          borderRadius: 6,
          background: '#1877F2',
          color: '#fff',
          fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Sign In
      </Link>
    </div>
  );
}
