import re

with open('pages/api/mlb/model-intel.ts', 'r') as f:
    content = f.read()

# Replace .toFixed(...) usages
content = re.sub(r'\(num\(k\.avg_clv\) \?\? 0\)\.toFixed\(2\)', '(num(k.avg_clv) ?? 0)', content)
content = re.sub(r'\(num\(k\.overall_roi\) \?\? 0\)\.toFixed\(1\)', '(num(k.overall_roi) ?? 0)', content)
content = re.sub(r'\(num\(k\.avg_brier\) \?\? 0\)\.toFixed\(3\)', '(num(k.avg_brier) ?? 0)', content)

content = re.sub(r'Number\(g\.profit\.toFixed\([0-9]+\)\)', 'g.profit', content)
content = re.sub(r'Number\(cum\.toFixed\([0-9]+\)\)', 'cum', content)
content = re.sub(r'Number\(\(\(g\.profit / g\.bets\) \* 100\)\.toFixed\([0-9]+\)\)', '((g.profit / g.bets) * 100)', content)

content = re.sub(r'Number\(\(g\.bNum / g\.bDen\)\.toFixed\([0-9]+\)\)', '(g.bNum / g.bDen)', content)
content = re.sub(r'Number\(\(g\.cNum / g\.cDen\)\.toFixed\([0-9]+\)\)', '(g.cNum / g.cDen)', content)

content = re.sub(r'\(bNum2 / bDen2\)\.toFixed\([0-9]+\)', '(bNum2 / bDen2)', content)
content = re.sub(r'\(cNum2 / cDen2\)\.toFixed\([0-9]+\)', '(cNum2 / cDen2)', content)
content = re.sub(r'\(\(totalProfit2 / totalBets2\) \* 100\)\.toFixed\([0-9]+\)', '((totalProfit2 / totalBets2) * 100)', content)
content = re.sub(r"'0\.000'", '0', content)
content = re.sub(r"'0\.00'", '0', content)
content = re.sub(r"'0\.0'", '0', content)

content = re.sub(r'Number\(\(wC / wN\)\.toFixed\([0-9]+\)\)', '(wC / wN)', content)

content = re.sub(r'Number\(\(\(rNum / rBets\) \* 100\)\.toFixed\([0-9]+\)\)', '((rNum / rBets) * 100)', content)
content = re.sub(r'Number\(\(bNum2 / bDen2\)\.toFixed\([0-9]+\)\)', '(bNum2 / bDen2)', content)
content = re.sub(r'Number\(\(cNum2 / cDen2\)\.toFixed\([0-9]+\)\)', '(cNum2 / cDen2)', content)

with open('pages/api/mlb/model-intel.ts', 'w') as f:
    f.write(content)

