#!/bin/bash
# resolve-all-conflicts.sh
# Resolves all merge conflict markers in JS/TS/JSX/TSX/JSON files
# Strategy: Keep HEAD (ours) version — remove incoming changes
# This is safe because these conflicts were from auto-merges that broke syntax

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Resolving All Git Merge Conflict Markers ==="
echo "Repository: $REPO_ROOT"
echo ""

# Find all files with conflict markers
CONFLICT_FILES=$(grep -rln "<<<<<<" src/ data/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.json" 2>/dev/null || true)

if [ -z "$CONFLICT_FILES" ]; then
  echo "✅ No conflict markers found. All files are clean!"
  exit 0
fi

COUNT=$(echo "$CONFLICT_FILES" | wc -l | tr -d ' ')
echo "Found $COUNT files with conflict markers. Resolving..."
echo ""

FIXED=0
FAILED=0

for FILE in $CONFLICT_FILES; do
  echo "  Fixing: $FILE"
  
  # Use Python to cleanly resolve conflicts by keeping HEAD (<<<< side)
  python3 - "$FILE" <<'PYEOF'
import sys
import re

filepath = sys.argv[1]

try:
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    # Pattern to match conflict blocks:
    # <<<<<<< HEAD
    # ... our changes ...
    # =======
    # ... their changes ...
    # >>>>>>> branch-name
    
    # Strategy: keep HEAD version (everything between <<<<<<< and =======)
    def resolve_conflict(match):
        ours = match.group(1)
        return ours
    
    # Handle conflicts - keep ours (HEAD side)
    pattern = r'<<<<<<< [^\n]*\n(.*?)=======\n.*?>>>>>>> [^\n]*\n'
    resolved = re.sub(pattern, resolve_conflict, content, flags=re.DOTALL)
    
    # Also handle <<<<<<< HEAD without branch name variant
    pattern2 = r'<<<<<<< HEAD\n(.*?)=======\n.*?>>>>>>>[^\n]*\n'
    resolved = re.sub(pattern2, resolve_conflict, resolved, flags=re.DOTALL)
    
    # Check if there are still any conflict markers
    remaining = re.findall(r'<<<<<<<|=======|>>>>>>>', resolved)
    if remaining:
        print(f"    WARNING: {len(remaining)} markers still remain in {filepath}")
        # Try a more aggressive cleanup
        lines = resolved.split('\n')
        clean_lines = []
        in_conflict = False
        keep_section = True  # True = keep HEAD, False = skip incoming
        
        for line in lines:
            if line.startswith('<<<<<<<'):
                in_conflict = True
                keep_section = True
                continue
            elif line.startswith('=======') and in_conflict:
                keep_section = False
                continue
            elif line.startswith('>>>>>>>') and in_conflict:
                in_conflict = False
                keep_section = True
                continue
            
            if not in_conflict or keep_section:
                clean_lines.append(line)
        
        resolved = '\n'.join(clean_lines)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(resolved)
    
    print(f"    ✅ Fixed")
    sys.exit(0)

except Exception as e:
    print(f"    ❌ Error: {e}")
    sys.exit(1)
PYEOF

  if [ $? -eq 0 ]; then
    FIXED=$((FIXED + 1))
  else
    FAILED=$((FAILED + 1))
    echo "  ❌ Failed to fix: $FILE"
  fi
done

echo ""
echo "=== Results ==="
echo "✅ Fixed: $FIXED files"
echo "❌ Failed: $FAILED files"
echo ""

# Verify no conflict markers remain
REMAINING=$(grep -rln "<<<<<<" src/ data/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.json" 2>/dev/null | wc -l | tr -d ' ')
echo "Remaining conflict files: $REMAINING"

if [ "$REMAINING" -eq 0 ]; then
  echo "✅ ALL CONFLICTS RESOLVED! Repository is clean."
else
  echo "⚠️  Some files may still have issues. Run: grep -rln '<<<<<<' src/ data/ to see them."
fi
