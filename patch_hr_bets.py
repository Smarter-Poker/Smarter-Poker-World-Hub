import re

with open('pages/api/mlb/hr-bets.ts', 'r') as f:
    content = f.read()

content = re.sub(r'Math\.round\(Number\(b\.stake\) \* 100\) / 100', 'Number(b.stake)', content)

with open('pages/api/mlb/hr-bets.ts', 'w') as f:
    f.write(content)

