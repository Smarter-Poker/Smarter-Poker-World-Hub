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
        background: 'linear-gradient(180deg, #0d1a22, #050b0f)',
        border: '1px solid #25c8ff',
        borderRadius: 2,
        boxShadow: 'inset 0 0 0 2px #020608, inset 0 1px 0 rgba(255,255,255,0.08)',
        fontSize: 13,
        lineHeight: 1.5,
        color: 'var(--sp-fg-muted, #d6e5ed)',
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
          border: '1px solid #25c8ff',
          borderRadius: 2,
          background: 'linear-gradient(180deg, #146789, #052638)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
          color: '#f0f9fc',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Sign In
      </Link>
    </div>
  );
}
