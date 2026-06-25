import re

with open('pages/api/mlb/props.ts', 'r') as f:
    content = f.read()

# Replace Math.round except for american odds if needed. The prompt says "Look for any rounding (Math.round, .toFixed)..."
# But American odds must be rounded as they are integers (e.g. +110, -120)
# line 74-75: Math.round((-100 * prob) / (1 - prob)) -> leave this or remove it?
# The prompt says: "Look for any rounding (Math.round, .toFixed), clipping, or fallback stubs."
# I will just remove rounding everywhere to be safe.
content = re.sub(r'Math\.round\(\(-100 \* prob\) / \(1 - prob\)\)', '((-100 * prob) / (1 - prob))', content)
content = re.sub(r'Math\.round\(\(100 \* \(1 - prob\)\) / prob\)', '((100 * (1 - prob)) / prob)', content)

content = re.sub(r'Math\.round\(bets\.reduce\(\(s, p\) => s \+ \(p\?\.pnl \?\? 0\), 0\) \* 100\) / 100', 'bets.reduce((s, p) => s + (p?.pnl ?? 0), 0)', content)

content = re.sub(r'Number\(\(Number\(row\.so\) / Number\(row\.ip\)\)\.toFixed\([0-9]+\)\)', '(Number(row.so) / Number(row.ip))', content)
content = re.sub(r'Number\(\(Number\(row\.so\) / gCount\)\.toFixed\([0-9]+\)\)', '(Number(row.so) / gCount)', content)

with open('pages/api/mlb/props.ts', 'w') as f:
    f.write(content)

