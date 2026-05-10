import React, { useState } from 'react';

export default function HostHomeGameButton({ className }) {
  const [checking, setChecking] = useState(false);

  const handleStart = async () => {
    console.log('BUTTON CLICKED'); setChecking(true);
    const WIZARD_PATH = '/commander/register?tier=home_game&from=poker_near_me&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate';
    try {
      let authBlob = {};
      try {
        authBlob = JSON.parse(window.localStorage.getItem('smarter-poker-auth') || '{}');
      } catch { /* corrupted blob */ }

      const user = authBlob?.user || null;
      const accessToken =
        authBlob?.session?.access_token ||
        authBlob?.access_token ||
        authBlob?.currentSession?.access_token ||
        null;

      if (!user || !accessToken) {
        window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
        return;
      }

      const res = await fetch('/api/commander/check-access', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data?.hasAccess) {
          window.location.href = '/hub/commander/home-games/create';
          return;
        }
      }
      
      // Needs to register
      window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
    } catch (e) {
      console.warn('Commander access check failed:', e);
      window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
    }
  };

  return (
    <button
      className={className || "hg-host-btn relative overflow-hidden"}
      onClick={handleStart}
      disabled={checking}
    >
      {checking ? (
        <div className="absolute inset-0 bg-[#242526]/95 flex items-center justify-center z-10">
          <div className="w-4 h-4 border-2 border-[#1877F2]/30 border-t-[#1877F2] rounded-full animate-spin mr-2" />
          <span className="text-xs font-semibold text-[#E4E6EB]">Checking...</span>
        </div>
      ) : null}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      Host A Home Game
    </button>
  );
}
