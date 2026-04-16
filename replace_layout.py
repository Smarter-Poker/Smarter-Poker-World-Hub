import re

file_path = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/poker-tours.js'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Remove sidebar
pattern_sidebar = r"\{\/\*\s*─── LEFT SIDEBAR ───\s*\*\/.*?<\/aside>"
content = re.sub(pattern_sidebar, "", content, flags=re.DOTALL)

# 2. Insert filters
pattern_actions = r'(<div className="tours-results-sort">\s*<span>Sort:<\/span>)'
replacement = r'''<div className="tours-results-sort">
                                    <span>Buy-In:</span>
                                    <select value={buyinFilter} onChange={e => setBuyinFilter(e.target.value)}>
                                        <option value="all">All</option>
                                        <option value="low">Low ($0 - $400)</option>
                                        <option value="mid">Mid ($400 - $1.5K)</option>
                                        <option value="high">High ($1.5K - $10K)</option>
                                        <option value="super">Super ($10K+)</option>
                                    </select>
                                </div>
                                <div className="tours-results-sort">
                                    <span>Region:</span>
                                    <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)}>
                                        <option value="all">All</option>
                                        {availableRegions.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>
                                \1'''
content = re.sub(pattern_actions, replacement, content)

with open(file_path, 'w') as f:
    f.write(content)

print("Layout updated.")
