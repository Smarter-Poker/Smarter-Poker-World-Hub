---
description: No emojis allowed anywhere in Club Commander — use Lucide icons only
---

# No Emojis in Club Commander

## Rule
**ZERO emojis are allowed in any Club Commander file.** This applies to:
- All pages in `pages/commander/`
- All components in `src/components/commander/`
- All API routes in `pages/api/commander/`
- All stores, hooks, and utilities related to Commander

## What Counts as an Emoji
Any Unicode character in the emoji ranges (U+1F300–U+1FAFF, U+2600–U+27BF, etc.), including but not limited to:
- Emoticons (😀, 😎, etc.)
- Symbols (✓, ✨, ⭐, ❌, ✅, etc.)
- Pictographs (🎲, 🎯, 💎, 🏆, 🔥, etc.)
- Variation selectors combining with symbols

## What to Use Instead
- **Lucide React icons** (`lucide-react`) for all visual indicators
- Examples: `<Check />`, `<X />`, `<Star />`, `<AlertTriangle />`, `<CheckCircle />`
- Plain text labels for buttons and UI elements

## Verification
Before committing any Commander changes, run this check:
```bash
cd /path/to/project && python3 -c "
import os, re
emoji_pattern = re.compile('['
    '\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF'
    '\U0001F900-\U0001F9FF\U0001FA00-\U0001FAFF'
    '\U00002702-\U000027B0\U00002600-\U000026FF\U00002700-\U000027BF'
    '\U00002714\U00002716\U00002728\U0000274C\U0000274E'
    '\U00002753-\U00002757\U00002795-\U00002797'
    '\U00002B50\U00002B55'
    ']+', re.UNICODE)
for d in ['pages/commander', 'src/components/commander', 'pages/api/commander']:
    for root, _, files in os.walk(d):
        for f in files:
            if f.endswith(('.js', '.jsx', '.ts', '.tsx')):
                path = os.path.join(root, f)
                with open(path, 'r') as fh:
                    for i, line in enumerate(fh, 1):
                        if emoji_pattern.search(line):
                            print(f'VIOLATION: {path}:{i}: {line.rstrip()[:120]}')
print('Scan complete')
"
```

// turbo-all
