with open('/Users/smarter.poker/.gemini/antigravity/brain/4831898d-3eca-45e9-bda8-00c324ae89f8/task.md', 'r') as f:
    text = f.read()

text = text.replace('- [ ] Fix Data Layer', '- [x] Fix Data Layer')
text = text.replace('- [ ] Optimize Over', '- [x] Optimize Over')
text = text.replace('- [ ] Stale Props', '- [x] Stale Props')
text = text.replace('- [ ] Null Coercion', '- [x] Null Coercion')
text = text.replace('- [ ] Supabase Error', '- [x] Supabase Error')
text = text.replace('- [ ] Array Slicing', '- [x] Array Slicing')

text = text.replace('- [ ] Fix Backend API', '- [x] Fix Backend API')
text = text.replace('- [ ] Add `MLBStatusPayload`', '- [x] Add `MLBStatusPayload`')
text = text.replace('- [ ] Add CORS', '- [x] Add CORS')
text = text.replace('- [ ] Fix NaN', '- [x] Fix NaN')

text = text.replace('- [ ] Fix Frontend UI', '- [x] Fix Frontend UI')
text = text.replace('- [ ] SSR Hydration', '- [x] SSR Hydration')
text = text.replace('- [ ] Error Boundary', '- [x] Error Boundary')
text = text.replace('- [ ] Clean up', '- [x] Clean up')
text = text.replace('- [ ] Accessibility', '- [x] Accessibility')
text = text.replace('- [ ] Proper Skeleton', '- [x] Proper Skeleton')
text = text.replace('- [ ] React Key', '- [x] React Key')

with open('/Users/smarter.poker/.gemini/antigravity/brain/4831898d-3eca-45e9-bda8-00c324ae89f8/task.md', 'w') as f:
    f.write(text)
