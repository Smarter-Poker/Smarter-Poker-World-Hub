/**
 * MultiTableTabs -- Tab bar at top of screen for multi-tabling (PokerBros-style)
 * Shows mini hole cards per table, active table highlighted, "+" to add table
 */
import React from 'react';
import { getCardImagePath } from '../../../lib/CardAssets';

function MiniCard({ cardIndex, faceDown = false }) {
  if (faceDown || cardIndex == null) {
    return (
      <div className="w-5 h-7 rounded-sm bg-gradient-to-br from-blue-800 to-blue-600 border border-blue-500/50" />
    );
  }
  return (
    <div className="w-5 h-7 rounded-sm overflow-hidden border border-gray-600/50 shadow-sm">
      <img
        src={getCardImagePath(cardIndex)}
        alt=""
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}

export default function MultiTableTabs({
  tables = [],
  activeTableId = null,
  onSelectTable,
  onAddTable,
}) {
  if (tables.length <= 1 && !onAddTable) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-900/90 border-b border-gray-800 overflow-x-auto">
      {tables.map((table) => {
        const isActive = table.id === activeTableId;
        const { holeCards = [], isFolded = false } = table;

        return (
          <button
            key={table.id}
            onClick={() => onSelectTable?.(table.id)}
            className={`flex items-center gap-0.5 px-2 py-1 rounded-md transition-all flex-shrink-0 ${
              isActive
                ? 'bg-gray-700 border border-amber-500/50 shadow-md'
                : 'bg-gray-800/60 border border-gray-700/50 opacity-70 hover:opacity-100'
            }`}
          >
            {/* Mini hole cards */}
            <div className="flex gap-px">
              {holeCards.length > 0 ? (
                holeCards.map((card, i) => (
                  <MiniCard key={i} cardIndex={card} faceDown={isFolded} />
                ))
              ) : (
                <>
                  <MiniCard faceDown />
                  <MiniCard faceDown />
                </>
              )}
            </div>

            {/* Action indicator */}
            {table.needsAction && !isActive && (
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse ml-1" />
            )}
          </button>
        );
      })}

      {/* Add table button */}
      {onAddTable && (
        <button
          onClick={onAddTable}
          className="flex items-center justify-center w-8 h-8 rounded-md bg-gray-800/60 border border-dashed border-gray-600 text-gray-500 hover:text-white hover:border-gray-400 transition-colors flex-shrink-0"
        >
          +
        </button>
      )}
    </div>
  );
}
