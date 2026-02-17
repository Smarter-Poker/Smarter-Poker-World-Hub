#!/usr/bin/env python3
"""
Title Case Capitalization Fixer for Smarter.Poker
Applies Title Case to all display text in JSX files while respecting:
- Poker abbreviations (BTN, SB, BB, UTG, HJ, CO, MP, IP, OOP) → ALL CAPS
- Hyphenated poker terms → Both words capitalized (Big-Blind, Small-Blind)
- Numeric+blind units → 3BB, 2.5BB, etc.
"""

import re
import os
import sys
import glob

# Poker abbreviations that should ALWAYS be ALL CAPS
POKER_CAPS = {
    'btn': 'BTN', 'sb': 'SB', 'bb': 'BB', 'utg': 'UTG',
    'hj': 'HJ', 'co': 'CO', 'mp': 'MP', 'ip': 'IP', 'oop': 'OOP',
    'nlh': 'NLH', 'plo': 'PLO', 'nlo': 'NLO', 'lhe': 'LHE',
    'mtg': 'MTG', 'mtt': 'MTT', 'sng': 'SNG', 'nlt': 'NLT',
    'gto': 'GTO', 'ev': 'EV', 'vpip': 'VPIP', 'pfr': 'PFR',
    'api': 'API', 'sms': 'SMS', 'url': 'URL', 'hdmi': 'HDMI',
    'qr': 'QR', 'tv': 'TV', 'pin': 'PIN', 'id': 'ID',
    'ai': 'AI', 'ui': 'UI', 'ok': 'OK', 'faq': 'FAQ',
    'pos': 'POS', 'w2g': 'W2G',
}

# Hyphenated poker terms that need both words capitalized
POKER_HYPHENATED = {
    'big-blind': 'Big-Blind', 'small-blind': 'Small-Blind',
    'button-straddle': 'Button-Straddle', 'under-the-gun': 'Under-The-Gun',
    'check-in': 'Check-In', 'buy-in': 'Buy-In', 'add-on': 'Add-On',
    'no-limit': 'No-Limit', 'pot-limit': 'Pot-Limit', 'fixed-limit': 'Fixed-Limit',
    're-entry': 'Re-Entry', 'at-risk': 'At-Risk',
}

# Special words to keep as-is
KEEP_AS_IS = {
    'e.g.', 'e.g.,', 'etc.', 'vs', 'vs.', 'am', 'pm', 'iPhone', 'iPad',
    'Smarter.Poker', 'JavaScript', 'TypeScript',
}

# Words that should stay lowercase (prepositions/articles in mid-sentence)
# But user says EVERY word capitalized, so we capitalize everything
# SMALL_WORDS = {'a', 'an', 'the', 'of', 'in', 'on', 'at', 'by', 'for', 'to', 'and', 'or', 'but', 'is', 'it', 'if', 'as', 'no', 'not', 'so'}

def title_case_word(word):
    """Apply Title Case to a single word, respecting poker rules."""
    if not word:
        return word
    
    # Preserve words that are already correct
    if word in KEEP_AS_IS:
        return word
    
    # Check if it's a poker abbreviation (case-insensitive)
    lower = word.lower().rstrip('.,!?;:')
    suffix = word[len(lower):]  # Capture trailing punctuation
    
    if lower in POKER_CAPS:
        return POKER_CAPS[lower] + suffix
    
    # Check if it has a numeric prefix (e.g., 3bb, 2.5bb)
    num_match = re.match(r'^(\d+\.?\d*)(bb|sb)$', word, re.IGNORECASE)
    if num_match:
        return num_match.group(1) + num_match.group(2).upper()
    
    # If the word is ALL CAPS and length > 1, keep it
    if word.isupper() and len(word) > 1:
        return word
    
    # If starts with a digit, keep as-is
    if word[0].isdigit():
        return word
    
    # Special: if it's a contraction, capitalize first letter only
    # e.g., Today's → Today's (not Today'S), Don't → Don't
    if "'" in word:
        idx = word.index("'")
        return word[0].upper() + word[1:idx] + word[idx:]
    
    # Apply Title Case - capitalize first letter
    if word[0].isalpha():
        return word[0].upper() + word[1:]
    
    return word

def title_case_text(text):
    """Apply Title Case to a full text string."""
    if not text or not text.strip():
        return text
    
    # Handle hyphenated poker terms first
    result = text
    for term_lower, term_fixed in POKER_HYPHENATED.items():
        pattern = re.compile(re.escape(term_lower), re.IGNORECASE)
        result = pattern.sub(term_fixed, result)
    
    # Split into words, capitalize each
    words = result.split(' ')
    fixed_words = [title_case_word(w) for w in words]
    return ' '.join(fixed_words)

def process_line(line):
    """Process a single line to fix Title Case in display text."""
    original = line
    
    # Skip non-display lines
    stripped = line.strip()
    if any(x in stripped for x in ['console.', 'import ', 'require(', '// ', '/* ', '.then(', '.catch(', 'module.exports']):
        return line
    
    # Pattern 1: Text between JSX tags >text<
    def fix_tag_text(match):
        text = match.group(1)
        if not text.strip() or len(text.strip()) < 2:
            return match.group(0)
        # Skip if it's code/variable-like
        if '{' in text or text.strip().startswith('{'):
            return match.group(0)
        # Skip email addresses and URLs
        if '@' in text or 'http' in text:
            return match.group(0)
        fixed = title_case_text(text)
        return '>' + fixed + '<'
    
    line = re.sub(r'>([^<>{}\n]+)<', fix_tag_text, line)
    
    # Pattern 2: placeholder="text"
    def fix_attr(match):
        prefix = match.group(1)
        quote = match.group(2)
        text = match.group(3)
        if not text.strip() or len(text.strip()) < 2:
            return match.group(0)
        if '{' in text or '@' in text or 'http' in text:
            return match.group(0)
        fixed = title_case_text(text)
        return prefix + quote + fixed + quote
    
    for attr in ['placeholder', 'title', 'aria-label']:
        line = re.sub(rf'({attr}=)(["\'])([^"\']+)\2', fix_attr, line)
    
    # Pattern 3: description="text"  
    line = re.sub(r'(description=)(["\'])([^"\']+)\2', fix_attr, line)
    
    return line

def process_file(filepath, dry_run=False):
    """Process a single file and apply Title Case fixes."""
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    modified = False
    new_lines = []
    changes = []
    
    for i, line in enumerate(lines):
        fixed = process_line(line)
        if fixed != line:
            modified = True
            changes.append((i + 1, line.strip(), fixed.strip()))
        new_lines.append(fixed)
    
    if modified and not dry_run:
        with open(filepath, 'w') as f:
            f.writelines(new_lines)
    
    return changes

def main():
    dry_run = '--dry-run' in sys.argv
    target_dir = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'pages/commander'
    
    files = sorted(set(glob.glob(f'{target_dir}/**/*.js', recursive=True)))
    
    total_changes = 0
    files_changed = 0
    
    for filepath in files:
        changes = process_file(filepath, dry_run=dry_run)
        if changes:
            files_changed += 1
            total_changes += len(changes)
            print(f'\n{"[DRY RUN] " if dry_run else ""}Fixed {filepath} ({len(changes)} changes):')
            for linenum, old, new in changes[:5]:
                print(f'  L{linenum}:')
                print(f'    - {old[:80]}')
                print(f'    + {new[:80]}')
            if len(changes) > 5:
                print(f'  ... +{len(changes)-5} more')
    
    print(f'\n{"[DRY RUN] " if dry_run else ""}Total: {total_changes} changes in {files_changed}/{len(files)} files')

if __name__ == '__main__':
    main()
