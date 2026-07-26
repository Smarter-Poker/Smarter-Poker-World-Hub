import os
import re

files = [
    "pages/hub/poker-near-me/[pnmTab].js",
    "pages/hub/social-media/index.js",
    "pages/hub/video-library.js",
    "pages/hub/diamond-store.js",
    "pages/hub/personal-assistant/index.js",
    "pages/hub/news.js",
    "pages/hub/bankroll-manager.js"
]

for filepath in files:
    if not os.path.exists(filepath):
        print(f"Not found: {filepath}")
        continue
        
    with open(filepath, "r") as f:
        content = f.read()

    # 1. Remove useState for showIntro
    content = re.sub(r'const\s+\[showIntro,\s*setShowIntro\]\s*=\s*useState\([^;]+;\n?', '', content)
    
    # 2. Remove introVideoRef
    content = re.sub(r'const\s+introVideoRef\s*=\s*useRef\([^;]*\);\n?', '', content)
    
    # 3. Remove handleIntroPlay and handleIntroEnd and handleIntroUnmute functions
    # Because these can span multiple lines, we can try to remove them if we find them.
    # We will use a more generic approach: match the function declarations and their bodies.
    def remove_function(func_name, text):
        # Matches: const handleIntroEnd = useCallback(() => { ... }, []);
        # Or: const handleIntroEnd = () => { ... };
        pattern = re.compile(rf'const\s+{func_name}\s*=\s*(?:useCallback\()?.*?=>\s*{{', re.DOTALL)
        match = pattern.search(text)
        while match:
            start_idx = match.start()
            # Find matching brace for the {
            brace_count = 1
            idx = match.end()
            while idx < len(text) and brace_count > 0:
                if text[idx] == '{': brace_count += 1
                elif text[idx] == '}': brace_count -= 1
                idx += 1
            # now we are past the }, we need to consume up to the semicolon
            while idx < len(text) and text[idx] in [')', ']', ',', ' ', '\n', ';']:
                if text[idx] == ';':
                    idx += 1
                    break
                idx += 1
            text = text[:start_idx] + text[idx:]
            match = pattern.search(text)
        return text

    content = remove_function('handleIntroEnd', content)
    content = remove_function('handleIntroPlay', content)
    content = remove_function('handleIntroUnmute', content)
    
    # 4. Remove {showIntro && ( ... )}
    def remove_showIntro_block(text):
        idx = text.find('{showIntro && (')
        while idx != -1:
            # find matching parenthesis for the '('
            paren_count = 1
            curr = idx + len('{showIntro && (')
            while curr < len(text) and paren_count > 0:
                if text[curr] == '(': paren_count += 1
                elif text[curr] == ')': paren_count -= 1
                curr += 1
            # now we are past the ), we need to consume up to the }
            while curr < len(text) and text[curr] != '}':
                curr += 1
            if curr < len(text) and text[curr] == '}':
                curr += 1
            
            # also remove any preceding comments like {/* Intro Video Overlay */}
            start_idx = idx
            # go backwards to check if there is a comment
            prefix = text[:start_idx]
            if '{/* Intro Video Overlay */}' in prefix[-100:]:
                start_idx = prefix.rfind('{/* Intro Video Overlay */}')
            elif '{/*  INTRO VIDEO OVERLAY - Plays while page loads behind it */}' in prefix[-100:]:
                start_idx = prefix.rfind('{/*  INTRO VIDEO OVERLAY')
            elif '{/* Intro Video Overlay - similar to HUB */}' in prefix[-100:]:
                start_idx = prefix.rfind('{/* Intro Video Overlay')
                
            text = text[:start_idx] + text[curr:]
            idx = text.find('{showIntro && (')
        return text

    content = remove_showIntro_block(content)
    
    # 5. Clean up any leftover setShowIntro(true); or setShowIntro(false); calls
    content = re.sub(r'setShowIntro\([^)]+\);?\n?', '', content)

    # 6. Clean up introSoundOn state
    content = re.sub(r'const\s+\[introSoundOn,\s*setIntroSoundOn\]\s*=\s*useState\([^;]+;\n?', '', content)

    # 7. Also remove `!showIntro` references in logic, such as `if (loading && !showIntro)` -> `if (loading)`
    content = content.replace('&& !showIntro', '')
    content = content.replace('!showIntro &&', '')
    
    # 8. And `|| showIntro` references
    content = content.replace('|| showIntro', '')
    content = content.replace('showIntro ||', '')

    with open(filepath, "w") as f:
        f.write(content)
    
    print(f"Cleaned {filepath}")
