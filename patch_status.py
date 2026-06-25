import re

with open('pages/api/mlb/status.ts', 'r') as f:
    content = f.read()

content = re.sub(r'Math\.round\(rawHealth\.hours_stale \* 60\)', '(rawHealth.hours_stale * 60)', content)

with open('pages/api/mlb/status.ts', 'w') as f:
    f.write(content)

