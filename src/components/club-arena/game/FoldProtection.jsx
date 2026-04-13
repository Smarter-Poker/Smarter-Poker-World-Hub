/**
 * FoldProtection -- "Check or Fold?" confirmation dialog
 * Triggered when hero taps FOLD but checking is available (no bet to face).
 * Prevents accidental folds on free hands.
 */
import React from 'react';

export default function FoldProtection({ onCheck, onFold, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
        {/* Close X */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600 flex items-center justify-center text-sm transition-colors"
        >
          X
        </button>

        {/* Title */}
        <h3 className="text-white text-lg font-bold text-center mb-2">
          Check or Fold?
        </h3>

        {/* Body */}
        <p className="text-gray-400 text-sm text-center mb-5">
          Notice: You can check this hand instead of folding.
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCheck}
            className="flex-1 h-11 rounded-lg font-bold text-white text-sm
              border-2 border-green-500 bg-transparent
              hover:bg-green-500/20 active:bg-green-500/30
              transition-all duration-150"
          >
            CHECK
          </button>
          <button
            onClick={onFold}
            className="flex-1 h-11 rounded-lg font-bold text-white text-sm
              bg-gradient-to-b from-amber-500 to-amber-700
              active:from-amber-700 active:to-amber-800 active:scale-[0.97]
              transition-all duration-150 shadow-md"
          >
            FOLD
          </button>
        </div>
      </div>
    </div>
  );
}
