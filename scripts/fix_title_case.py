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

def is_display_text(text):
    """Check if text looks like display text (not code, URLs, CSS, etc.)."""
    if not text or not text.strip() or len(text.strip()) < 2:
        return False
    t = text.strip()
    # Skip code-like content
    if '{' in t or '@' in t or 'http' in t:
        return False
    # Skip CSS/code values
    if '_' in t and ' ' not in t:
        return False
    # Skip camelCase identifiers
    if re.match(r'^[a-z]+[A-Z]', t):
        return False
    # Skip pure numbers
    if re.match(r'^[\d.%]+$', t):
        return False
    # Skip file paths
    if '/' in t and ' ' not in t:
        return False
    return True

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
        if not is_display_text(text):
            return match.group(0)
        fixed = title_case_text(text)
        return '>' + fixed + '<'
    
    # Only apply to lines that look like JSX (contain HTML-like content)
    # Avoid matching JS comparison operators by requiring the > and < to be part of tags
    if re.search(r'<\w+[\s>]', line) or re.search(r'</\w+>', line):
        line = re.sub(r'>([^<>{}\\n]+)<', fix_tag_text, line)
    
    # Pattern 2: JSX attribute values
    def fix_attr(match):
        prefix = match.group(1)
        quote = match.group(2)
        text = match.group(3)
        if not is_display_text(text):
            return match.group(0)
        fixed = title_case_text(text)
        return prefix + quote + fixed + quote
    
    # Standard JSX display attributes
    for attr in ['placeholder', 'title', 'aria-label', 'alt', 'label', 'header', 'helperText']:
        line = re.sub(rf'({attr}=)(["\'])([^"\']+)\2', fix_attr, line)
    
    # description= attribute
    line = re.sub(r'(description=)(["\'])([^"\']+)\2', fix_attr, line)
    
    # content= attribute (skip viewport/robots/meta directives)
    def fix_content_attr(match):
        prefix = match.group(1)
        quote = match.group(2)
        text = match.group(3)
        # Skip viewport, robots, and other meta config values
        if any(x in text for x in ['width=', 'device-width', 'index,', 'follow', 'max-', 'viewport', 'charset', 'http', 'text/', 'application/']):
            return match.group(0)
        return fix_attr(match)
    
    line = re.sub(r'(content=)(["\'])([^"\']+)\2', fix_content_attr, line)
    
    # message= attribute
    line = re.sub(r'(message=)(["\'])([^"\']+)\2', fix_attr, line)
    
    # Pattern 3: JS object property strings for common display-text keys
    # e.g., label: 'All tables closed', message: 'No pending requests', text: 'some text'
    def fix_js_string(match):
        prefix = match.group(1)
        quote = match.group(2)
        text = match.group(3)
        if not is_display_text(text):
            return match.group(0)
        # Only fix if it contains spaces (it's a phrase, not a single word identifier)
        if ' ' not in text:
            return match.group(0)
        fixed = title_case_text(text)
        return prefix + quote + fixed + quote
    
    for prop in ['text', 'label', 'message', 'tip', 'hint', 'heading', 'subtitle',
                 'emptyText', 'emptyMessage', 'errorMessage', 'successMessage',
                 'confirmText', 'cancelText', 'buttonText']:
        line = re.sub(rf'({prop}:\s*)(["\'])([^"\']+)\2', fix_js_string, line)
    
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
    # Also include .jsx and .tsx files
    files += sorted(set(glob.glob(f'{target_dir}/**/*.jsx', recursive=True)))
    files += sorted(set(glob.glob(f'{target_dir}/**/*.tsx', recursive=True)))
    files = sorted(set(files))
    
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
