import re

with open('pages/api/mlb/pitchers.ts', 'r') as f:
    content = f.read()

content = re.sub(r'Number\(\(so / ip\)\.toFixed\([0-9]+\)\)', '(so / ip)', content)
content = re.sub(r'Number\(\(so / gCount\)\.toFixed\([0-9]+\)\)', '(so / gCount)', content)

with open('pages/api/mlb/pitchers.ts', 'w') as f:
    f.write(content)

