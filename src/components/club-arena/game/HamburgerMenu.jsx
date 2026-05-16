/**
 * HamburgerMenu -- Slide-out sidebar menu (premium-style)
 * Contains: Top Up, Table Settings, Auto Top-Up, Stand Up, Stand Up Next BB,
 * Sounds, Vibrations, Share, VIP, Exit
 */
import React, { useState } from 'react';
import ReportBugWidget from '../../ui/ReportBugWidget';

const MENU_ITEMS = [
  { key: 'topup', label: 'Top Up', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6', hasArrow: true },
  { key: 'settings', label: 'Table Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', hasArrow: true },
  { key: 'autotopup', label: 'Auto Top-Up', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', hasArrow: true },
  { key: 'standup', label: 'Stand Up', icon: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1', hasArrow: true },
  { key: 'standupbb', label: 'Stand Up Next Big Blind', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', hasArrow: true },
  { key: 'sounds', label: 'Sounds', icon: 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z', hasArrow: true },
  { key: 'vibrations', label: 'Vibrations', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z', isToggle: true },
  { key: 'share', label: 'Share', icon: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z', hasArrow: true },
  { key: 'vip', label: 'VIP', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z', hasArrow: true },
  { key: 'exit', label: 'Exit', icon: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1', hasArrow: true, danger: true },
];

export default function HamburgerMenu({ isOpen, onClose, onAction }) {
  const [vibrations, setVibrations] = useState(true);

  const handleItem = (key) => {
    if (key === 'vibrations') {
      setVibrations(!vibrations);
      return;
    }
    onAction?.(key);
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-[75%] max-w-[320px] bg-gray-900 border-r border-gray-700 shadow-2xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
          <span className="text-white text-base font-bold">Menu</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center"
          >
            X
          </button>
        </div>

        {/* Menu items */}
        <div className="py-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 60px)' }}>
          {MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => handleItem(item.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                item.danger
                  ? 'text-red-400 hover:bg-red-900/20'
                  : 'text-white hover:bg-gray-800'
              }`}
            >
              {/* Icon */}
              <svg
                width="20" height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`flex-shrink-0 ${item.danger ? 'text-red-400' : 'text-amber-400'}`}
              >
                <path d={item.icon} />
              </svg>

              {/* Label */}
              <span className="flex-1 text-sm font-medium">{item.label}</span>

              {/* Toggle or arrow */}
              {item.isToggle ? (
                <div className={`w-10 h-5 rounded-full transition-colors ${
                  vibrations ? 'bg-green-500' : 'bg-gray-600'
                }`}>
                  <div className={`w-4 h-4 mt-0.5 rounded-full bg-white shadow transition-transform ${
                    vibrations ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </div>
              ) : item.hasArrow ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              ) : null}
            </button>
          ))}
          <div className="px-4 py-4 mt-2 border-t border-gray-700">
            <ReportBugWidget />
          </div>
        </div>
      </div>
    </>
  );
}
