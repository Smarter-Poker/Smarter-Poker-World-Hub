import re

with open('src/components/poker-near-me/DailyTournamentsPanel.jsx', 'r') as f:
    content = f.read()

# 1. Imports
if "useTransition" not in content:
    content = content.replace(
        "import React, { useState, useEffect, useMemo } from 'react';",
        "import React, { useState, useEffect, useMemo, useTransition, useRef } from 'react';"
    )

# 2. IANA_TZ map
IANA_MAP = """
const IANA_TZ = {
  'AL': 'America/Chicago', 'AK': 'America/Anchorage', 'AZ': 'America/Phoenix', 
  'AR': 'America/Chicago', 'CA': 'America/Los_Angeles', 'CO': 'America/Denver',
  'CT': 'America/New_York', 'DE': 'America/New_York', 'FL': 'America/New_York', 
  'GA': 'America/New_York', 'HI': 'Pacific/Honolulu', 'ID': 'America/Denver',
  'IL': 'America/Chicago', 'IN': 'America/Indiana/Indianapolis', 'IA': 'America/Chicago', 
  'KS': 'America/Chicago', 'KY': 'America/New_York', 'LA': 'America/Chicago', 
  'ME': 'America/New_York', 'MD': 'America/New_York', 'MA': 'America/New_York', 
  'MI': 'America/Detroit', 'MN': 'America/Chicago', 'MS': 'America/Chicago', 
  'MO': 'America/Chicago', 'MT': 'America/Denver', 'NE': 'America/Chicago', 
  'NV': 'America/Los_Angeles', 'NH': 'America/New_York', 'NJ': 'America/New_York', 
  'NM': 'America/Denver', 'NY': 'America/New_York', 'NC': 'America/New_York', 
  'ND': 'America/Chicago', 'OH': 'America/New_York', 'OK': 'America/Chicago', 
  'OR': 'America/Los_Angeles', 'PA': 'America/New_York', 'RI': 'America/New_York', 
  'SC': 'America/New_York', 'SD': 'America/Chicago', 'TN': 'America/Chicago', 
  'TX': 'America/Chicago', 'UT': 'America/Denver', 'VT': 'America/New_York', 
  'VA': 'America/New_York', 'WA': 'America/Los_Angeles', 'WV': 'America/New_York', 
  'WI': 'America/Chicago', 'WY': 'America/Denver'
};
"""
if "IANA_TZ" not in content:
    content = content.replace("const DAYS =", IANA_MAP + "\nconst DAYS =")

# 3. Add useTransition and Pagination States inside the component
states_replacement = """
  const [groupByState, setGroupByState] = useState(false);
  const [selectedState, setSelectedState] = useState('all');
  const [expandedCards, setExpandedCards] = useState({});

  // Performance hooks
  const [isPending, startTransition] = useTransition();
  const [renderLimit, setRenderLimit] = useState(20);
  const loadMoreRef = useRef(null);

  // Reset pagination on filter changes
  useEffect(() => {
    setRenderLimit(20);
  }, [selectedDay, gameType, sortBy, selectedState, minBuyin, maxBuyin, minGuaranteed, groupByState]);

  // Intersection Observer for DOM Pagination
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setRenderLimit(prev => prev + 20);
      }
    }, { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [selectedDay]); // Keep observer fresh on tab changes
"""
content = re.sub(
    r"const \[groupByState.*?setExpandedCards\(\{\}\);\n",
    states_replacement,
    content,
    flags=re.DOTALL
)

# 4. Modify handleDayChange to useTransition
handle_day_replacement = """  const handleDayChange = (day) => {
    startTransition(() => {
      setSelectedDay(day);
      setSelectedState('all');
    });
    onDayChange?.(day);
  };
"""
content = re.sub(r"const handleDayChange = \(day\) => \{.*?  \};\n", handle_day_replacement, content, flags=re.DOTALL)

# Modify other setters in the JSX to use startTransition
content = content.replace("onClick={() => setGameType(gt)}", "onClick={() => startTransition(() => setGameType(gt))}")
content = content.replace("onChange={e => setMinBuyin(e.target.value)}", "onChange={e => startTransition(() => setMinBuyin(e.target.value))}")
content = content.replace("onChange={e => setMaxBuyin(e.target.value)}", "onChange={e => startTransition(() => setMaxBuyin(e.target.value))}")
content = content.replace("onChange={e => setMinGuaranteed(e.target.value)}", "onChange={e => startTransition(() => setMinGuaranteed(e.target.value))}")
content = content.replace("onChange={e => setSortBy(e.target.value)}", "onChange={e => startTransition(() => setSortBy(e.target.value))}")
content = content.replace("onClick={() => setGroupByState(!groupByState)}", "onClick={() => startTransition(() => setGroupByState(!groupByState))}")
content = content.replace("onClick={() => setSelectedState('all')}", "onClick={() => startTransition(() => setSelectedState('all'))}")
content = content.replace("onClick={() => setSelectedState(st)}", "onClick={() => startTransition(() => setSelectedState(st))}")


# 5. Fix Timezone logic in Countdown Timer
countdown_replacement = """          {/* Countdown timer (if today and soon) */}
          {(() => {
            if (!t.start_time || !isTodayTab) return null;
            const match = (t.start_time || '').match(/(\\d{1,2}:\\d{2})\\s*(AM|PM)?/i);
            const timePart = match ? match[1] : null;
            const ampm = match ? match[2] : null;
            if (!timePart) return null;

            const [h, m] = timePart.split(':').map(Number);
            let hour24 = h;
            if (ampm) { if (ampm.toUpperCase() === 'PM' && h !== 12) hour24 += 12; if (ampm.toUpperCase() === 'AM' && h === 12) hour24 = 0; }

            // Timezone offset math
            const tz = IANA_TZ[t.state || t.venue_state] || 'America/New_York';
            const venueNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
            const target = new Date(venueNow); 
            target.setHours(hour24, m, 0, 0);

            if (target <= venueNow) target.setDate(target.getDate() + 1);
            const diffMin = Math.round((target - venueNow) / 60000);
            
            if (diffMin <= 0 || diffMin > 1440) return null;
            const hrs = Math.floor(diffMin / 60);
            const mins = diffMin % 60;
            const isImminent = diffMin <= 60;
            return (
              <div style={{ float: 'right', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: isImminent ? 'rgba(239,68,68,0.15)' : 'rgba(110,231,239,0.08)', color: isImminent ? '#f87171' : '#6ee7ef', animation: isImminent ? 'lobby-badgePulse 1.5s ease-in-out infinite' : 'none' }}>
                {hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`}
              </div>
            );
          })()}"""
content = re.sub(r"\{\/\* Countdown timer \(if today and soon\) \*\/}.*?\n          \}\)\(\)\}", countdown_replacement, content, flags=re.DOTALL)


# 6. Apply renderLimit to visible arrays
# find groupedByState useMemo
group_replace = """
  // DOM Virtualization slice
  const visibleFiltered = useMemo(() => filtered.slice(0, renderLimit), [filtered, renderLimit]);

  // [DTP5 FIX] Memoize grouped-by-state object — was recomputed on every render
  const groupedByState = useMemo(() => {
    if (!groupByState) return null;
    return visibleFiltered.reduce((acc, t) => {
"""
if "const visibleFiltered" not in content:
    content = content.replace("""  // [DTP5 FIX] Memoize grouped-by-state object — was recomputed on every render
  const groupedByState = useMemo(() => {
    if (!groupByState) return null;
    return filtered.reduce((acc, t) => {""", group_replace)

# Replace filtered map with visibleFiltered map in rendering
render_flat_replace = """        <div style={{ display: 'grid', gap: 10, opacity: isPending ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          {visibleFiltered.map((t, i) => renderTournamentCard(t, i))}
        </div>"""
content = re.sub(
    r"<div style=\{\{ display: 'grid', gap: 10 \}\}>\n\s*\{filtered\.map\(\(t, i\) => renderTournamentCard\(t, i\)\)\}\n\s*<\/div>",
    render_flat_replace,
    content,
    flags=re.DOTALL
)

# Append loadMoreRef div before the last closing div
if "loadMoreRef" in content and "ref={loadMoreRef}" not in content:
    end_div = """      <div ref={loadMoreRef} style={{ height: 2px, opacity: 0 }} />
    </div>
"""
    content = content.replace("    </div>\n", end_div, 1)

with open('src/components/poker-near-me/DailyTournamentsPanel.jsx', 'w') as f:
    f.write(content)
