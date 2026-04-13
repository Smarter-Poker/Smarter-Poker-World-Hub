import re

with open('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/daily-tournaments.js', 'r') as f:
    code = f.read()

# 1. Remove Left Sidebar
code = re.sub(r'\{/\* Left Sidebar \*/\}.*?</aside>', '', code, flags=re.DOTALL)

# 2. Remove Right Sidebar
code = re.sub(r'\{/\* Right Sidebar - Quick Stats \*/\}.*?</aside>', '', code, flags=re.DOTALL)

# 3. Replace Search Section and Filter Panel with Top Command Bar
search_filter_pattern = r'\{/\* Search Section \*/\}.*?\{/\* Main Layout \*/\}'
new_top_bar = """{/* Top Level Filters Command Bar */}
                <div className="pnm-top-filters" style={{ padding: '0 20px', marginBottom: '20px' }}>
                    <div className="pnm-top-filters-inner">
                        <div className="pnm-search-box" style={{ flex: '1 1 200px', position: 'relative' }}>
                            <svg style={{ position: 'absolute', left: '10px', top: '10px', color: 'rgba(255,255,255,0.4)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                                type="text"
                                className="pnm-filter-select"
                                style={{ width: '100%', paddingLeft: '34px', boxSizing: 'border-box' }}
                                placeholder="Search Venue..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    refreshTournaments(); // instant search
                                }}
                            />
                        </div>
                        
                        <select className="pnm-filter-select" value={selectedState ? selectedState.abbr : ''} onChange={(e) => {
                            const st = POPULAR_STATES.find(s => s.abbr === e.target.value);
                            setSelectedState(st || null);
                        }}>
                            <option value="">All States</option>
                            {POPULAR_STATES.map(state => (
                                <option key={state.abbr} value={state.abbr}>{state.name}</option>
                            ))}
                        </select>
                        
                        <select className="pnm-filter-select" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                            {VENUE_TYPES.map(type => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>

                        <select className="pnm-filter-select" value={selectedBuyin.label} onChange={(e) => {
                            const range = BUYIN_RANGES.find(r => r.label === e.target.value);
                            setSelectedBuyin(range || BUYIN_RANGES[0]);
                        }}>
                            {BUYIN_RANGES.map((range, i) => (
                                <option key={i} value={range.label}>{range.label}</option>
                            ))}
                        </select>

                        {searchQuery || selectedState || selectedType || selectedBuyin.min ? (
                            <button className="pnm-filter-select" style={{ flex: '0 0 auto', padding: '0 16px', background: 'rgba(255,0,0,0.1)', borderColor: 'rgba(255,0,0,0.3)', color: '#ff4444', cursor: 'pointer' }} onClick={clearFilters}>
                                Clear
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* Main Layout */}"""

code = re.sub(search_filter_pattern, new_top_bar, code, flags=re.DOTALL)

# 4. Inject the CSS for pnm-top-filters and remove the grid templates for sidebars
css_patch = """
                    .pnm-top-filters-inner {
                        display: flex;
                        flex-direction: row;
                        flex-wrap: nowrap;
                        align-items: stretch;
                        gap: 8px;
                        max-width: 1400px;
                        margin: 0 auto;
                        overflow-x: auto;
                        padding-bottom: 5px;
                    }
                    .pnm-top-filters-inner::-webkit-scrollbar { display: none; }
                    .pnm-filter-select {
                        flex: 1 1 140px;
                        min-width: 120px;
                        max-width: 200px;
                        height: 36px;
                        padding: 0 10px;
                        background: rgba(12, 22, 40, 0.85);
                        border: 1.5px solid rgba(0,212,255,0.25);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 13px;
                        font-weight: 500;
                        outline: none;
                        appearance: none;
                        transition: all 0.2s;
                        box-sizing: border-box;
                    }
                    .pnm-filter-select:hover, .pnm-filter-select:focus {
                        border-color: rgba(0,212,255,0.55);
                        box-shadow: 0 0 10px rgba(0,212,255,0.1);
                    }
                    select.pnm-filter-select {
                        background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2300D4FF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
                        background-repeat: no-repeat;
                        background-position: right 10px top 50%;
                        background-size: 8px auto;
                    }
"""

# Inject CSS around line 450 (where style jsx starts)
code = code.replace(".dt-page {", css_patch + "\n                    .dt-page {")

# Remove media query grid constraints
code = re.sub(r'@media \(min-width: 1024px\).*?@media \(min-width: 1280px\)', '@media (min-width: 1024px) {\n                        .tournament-list { grid-template-columns: repeat(3, 1fr); }\n                        .dt-layout { padding: 0 40px; }\n                    }', code, flags=re.DOTALL)
code = re.sub(r'@media \(min-width: 1280px\).*?`\}<\/style>', '@media (min-width: 1280px) {\n                        .tournament-list { grid-template-columns: repeat(4, 1fr); }\n                    }\n                `}</style>', code, flags=re.DOTALL)

with open('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/daily-tournaments.js', 'w') as f:
    f.write(code)

print("Flattened Daily Tournaments applied.")
