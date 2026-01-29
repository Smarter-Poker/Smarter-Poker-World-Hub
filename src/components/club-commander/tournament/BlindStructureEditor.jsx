/**
 * BlindStructureEditor Component - Create/edit tournament blind structures
 * Reference: SCOPE_LOCK.md - Phase 3 Components
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState } from 'react';
import { Plus, Trash2, Clock, Coffee, GripVertical } from 'lucide-react';

// Common tournament structures
const PRESET_STRUCTURES = {
  turbo: {
    name: 'Turbo (10 min levels)',
    levels: [
      { small_blind: 25, big_blind: 50, ante: 0, duration: 10 },
      { small_blind: 50, big_blind: 100, ante: 0, duration: 10 },
      { small_blind: 75, big_blind: 150, ante: 0, duration: 10 },
      { small_blind: 100, big_blind: 200, ante: 25, duration: 10 },
      { small_blind: 150, big_blind: 300, ante: 25, duration: 10 },
      { small_blind: 200, big_blind: 400, ante: 50, duration: 10 },
      { is_break: true, duration: 5 },
      { small_blind: 300, big_blind: 600, ante: 75, duration: 10 },
      { small_blind: 400, big_blind: 800, ante: 100, duration: 10 },
      { small_blind: 500, big_blind: 1000, ante: 100, duration: 10 },
      { small_blind: 700, big_blind: 1400, ante: 200, duration: 10 },
      { small_blind: 1000, big_blind: 2000, ante: 300, duration: 10 },
      { is_break: true, duration: 5 },
      { small_blind: 1500, big_blind: 3000, ante: 400, duration: 10 },
      { small_blind: 2000, big_blind: 4000, ante: 500, duration: 10 },
      { small_blind: 3000, big_blind: 6000, ante: 1000, duration: 10 }
    ]
  },
  standard: {
    name: 'Standard (20 min levels)',
    levels: [
      { small_blind: 25, big_blind: 50, ante: 0, duration: 20 },
      { small_blind: 50, big_blind: 100, ante: 0, duration: 20 },
      { small_blind: 75, big_blind: 150, ante: 0, duration: 20 },
      { small_blind: 100, big_blind: 200, ante: 25, duration: 20 },
      { is_break: true, duration: 10 },
      { small_blind: 150, big_blind: 300, ante: 25, duration: 20 },
      { small_blind: 200, big_blind: 400, ante: 50, duration: 20 },
      { small_blind: 250, big_blind: 500, ante: 50, duration: 20 },
      { small_blind: 300, big_blind: 600, ante: 75, duration: 20 },
      { is_break: true, duration: 10 },
      { small_blind: 400, big_blind: 800, ante: 100, duration: 20 },
      { small_blind: 500, big_blind: 1000, ante: 100, duration: 20 },
      { small_blind: 600, big_blind: 1200, ante: 200, duration: 20 },
      { small_blind: 800, big_blind: 1600, ante: 200, duration: 20 },
      { is_break: true, duration: 15 },
      { small_blind: 1000, big_blind: 2000, ante: 300, duration: 20 },
      { small_blind: 1500, big_blind: 3000, ante: 400, duration: 20 },
      { small_blind: 2000, big_blind: 4000, ante: 500, duration: 20 }
    ]
  },
  deepstack: {
    name: 'Deep Stack (30 min levels)',
    levels: [
      { small_blind: 25, big_blind: 50, ante: 0, duration: 30 },
      { small_blind: 50, big_blind: 100, ante: 0, duration: 30 },
      { small_blind: 75, big_blind: 150, ante: 0, duration: 30 },
      { is_break: true, duration: 15 },
      { small_blind: 100, big_blind: 200, ante: 25, duration: 30 },
      { small_blind: 125, big_blind: 250, ante: 25, duration: 30 },
      { small_blind: 150, big_blind: 300, ante: 50, duration: 30 },
      { is_break: true, duration: 15 },
      { small_blind: 200, big_blind: 400, ante: 50, duration: 30 },
      { small_blind: 250, big_blind: 500, ante: 75, duration: 30 },
      { small_blind: 300, big_blind: 600, ante: 100, duration: 30 },
      { is_break: true, duration: 20 },
      { small_blind: 400, big_blind: 800, ante: 100, duration: 30 },
      { small_blind: 500, big_blind: 1000, ante: 150, duration: 30 },
      { small_blind: 600, big_blind: 1200, ante: 200, duration: 30 }
    ]
  }
};

export default function BlindStructureEditor({
  value = [],
  onChange,
  disabled = false
}) {
  const [levels, setLevels] = useState(value.length > 0 ? value : []);

  const updateLevels = (newLevels) => {
    setLevels(newLevels);
    onChange?.(newLevels);
  };

  const addLevel = (isBreak = false) => {
    const lastLevel = levels.filter(l => !l.is_break).pop();
    const newLevel = isBreak
      ? { is_break: true, duration: 10 }
      : {
          small_blind: lastLevel ? lastLevel.big_blind : 25,
          big_blind: lastLevel ? lastLevel.big_blind * 2 : 50,
          ante: lastLevel?.ante || 0,
          duration: lastLevel?.duration || 20
        };
    updateLevels([...levels, newLevel]);
  };

  const updateLevel = (index, field, value) => {
    const newLevels = [...levels];
    newLevels[index] = { ...newLevels[index], [field]: value };
    updateLevels(newLevels);
  };

  const removeLevel = (index) => {
    updateLevels(levels.filter((_, i) => i !== index));
  };

  const loadPreset = (presetKey) => {
    const preset = PRESET_STRUCTURES[presetKey];
    if (preset) {
      updateLevels([...preset.levels]);
    }
  };

  const moveLevel = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= levels.length) return;

    const newLevels = [...levels];
    [newLevels[index], newLevels[newIndex]] = [newLevels[newIndex], newLevels[index]];
    updateLevels(newLevels);
  };

  // Calculate level numbers (excluding breaks)
  let levelNumber = 0;

  return (
    <div className="space-y-4">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-[#6B7280] py-2">Load preset:</span>
        {Object.entries(PRESET_STRUCTURES).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            onClick={() => loadPreset(key)}
            disabled={disabled}
            className="px-3 py-1 text-sm rounded-lg border border-[#E5E7EB] text-[#1F2937] hover:border-[#1877F2] hover:text-[#1877F2] transition-colors disabled:opacity-50"
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Level list */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
        <div className="bg-[#F9FAFB] px-4 py-2 grid grid-cols-12 gap-2 text-sm font-medium text-[#6B7280]">
          <div className="col-span-1">Lvl</div>
          <div className="col-span-2">Small</div>
          <div className="col-span-2">Big</div>
          <div className="col-span-2">Ante</div>
          <div className="col-span-2">Minutes</div>
          <div className="col-span-3">Actions</div>
        </div>

        <div className="divide-y divide-[#E5E7EB] max-h-[400px] overflow-y-auto">
          {levels.map((level, index) => {
            if (!level.is_break) levelNumber++;

            return (
              <div
                key={index}
                className={`px-4 py-2 grid grid-cols-12 gap-2 items-center ${
                  level.is_break ? 'bg-[#FEF3C7]' : ''
                }`}
              >
                <div className="col-span-1 flex items-center gap-1">
                  <GripVertical className="w-4 h-4 text-[#9CA3AF] cursor-move" />
                  {level.is_break ? (
                    <Coffee className="w-4 h-4 text-[#D97706]" />
                  ) : (
                    <span className="font-medium text-[#1F2937]">{levelNumber}</span>
                  )}
                </div>

                {level.is_break ? (
                  <>
                    <div className="col-span-6 text-[#D97706] font-medium">
                      Break
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={level.duration}
                        onChange={(e) => updateLevel(index, 'duration', parseInt(e.target.value) || 0)}
                        disabled={disabled}
                        className="w-full px-2 py-1 rounded border border-[#E5E7EB] text-sm"
                        min="1"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={level.small_blind}
                        onChange={(e) => updateLevel(index, 'small_blind', parseInt(e.target.value) || 0)}
                        disabled={disabled}
                        className="w-full px-2 py-1 rounded border border-[#E5E7EB] text-sm"
                        min="1"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={level.big_blind}
                        onChange={(e) => updateLevel(index, 'big_blind', parseInt(e.target.value) || 0)}
                        disabled={disabled}
                        className="w-full px-2 py-1 rounded border border-[#E5E7EB] text-sm"
                        min="1"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={level.ante || 0}
                        onChange={(e) => updateLevel(index, 'ante', parseInt(e.target.value) || 0)}
                        disabled={disabled}
                        className="w-full px-2 py-1 rounded border border-[#E5E7EB] text-sm"
                        min="0"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={level.duration}
                        onChange={(e) => updateLevel(index, 'duration', parseInt(e.target.value) || 0)}
                        disabled={disabled}
                        className="w-full px-2 py-1 rounded border border-[#E5E7EB] text-sm"
                        min="1"
                      />
                    </div>
                  </>
                )}

                <div className="col-span-3 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveLevel(index, -1)}
                    disabled={disabled || index === 0}
                    className="p-1 text-[#6B7280] hover:text-[#1877F2] disabled:opacity-30"
                    title="Move up"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveLevel(index, 1)}
                    disabled={disabled || index === levels.length - 1}
                    className="p-1 text-[#6B7280] hover:text-[#1877F2] disabled:opacity-30"
                    title="Move down"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLevel(index)}
                    disabled={disabled}
                    className="p-1 text-[#6B7280] hover:text-[#EF4444] disabled:opacity-30"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => addLevel(false)}
          disabled={disabled}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1877F2] text-[#1877F2] hover:bg-[#1877F2] hover:text-white transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Add Level
        </button>
        <button
          type="button"
          onClick={() => addLevel(true)}
          disabled={disabled}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#D97706] text-[#D97706] hover:bg-[#D97706] hover:text-white transition-colors disabled:opacity-50"
        >
          <Coffee className="w-4 h-4" />
          Add Break
        </button>
      </div>

      {/* Summary */}
      {levels.length > 0 && (
        <div className="bg-[#F9FAFB] rounded-lg p-4">
          <h4 className="font-medium text-[#1F2937] mb-2">Structure Summary</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-[#6B7280]">Total Levels:</span>
              <span className="ml-2 font-medium">{levels.filter(l => !l.is_break).length}</span>
            </div>
            <div>
              <span className="text-[#6B7280]">Breaks:</span>
              <span className="ml-2 font-medium">{levels.filter(l => l.is_break).length}</span>
            </div>
            <div>
              <span className="text-[#6B7280]">Total Time:</span>
              <span className="ml-2 font-medium">
                {Math.floor(levels.reduce((sum, l) => sum + l.duration, 0) / 60)}h{' '}
                {levels.reduce((sum, l) => sum + l.duration, 0) % 60}m
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
