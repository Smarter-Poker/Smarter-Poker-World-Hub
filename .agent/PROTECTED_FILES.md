# 🚨 PROTECTED FILES REGISTRY 🚨

## DO NOT MODIFY THESE FILES WITHOUT READING THE CORRESPONDING SKILL FIRST

This file lists all protected components that have been carefully implemented and tested.
**Before modifying ANY of these files, you MUST:**

1. Read the corresponding SKILL.md file
2. Understand the architecture
3. Run the E2E test BEFORE and AFTER changes
4. If you break it, you fix it

---

## Protected Components

### In-App Article Reader
**Skill:** `.agent/skills/in-app-article-reader/SKILL.md`
**Test:** `node scripts/test-article-reader.js`

| File | Purpose | DO NOT |
|------|---------|--------|
| `pages/api/proxy.js` | Server-side proxy | Change URL rewriting logic |
| `src/components/social/ArticleReaderModal.jsx` | Full-screen modal | Remove iframe proxy URL |
| `src/components/social/ArticleCard.jsx` | Article preview | Remove onClick handler |

---

### Social Feed & Stories
**Skill:** `.agent/skills/social-community/SKILL.md`

| File | Purpose | DO NOT |
|------|---------|--------|
| `pages/hub/social-media.js` | Main feed page | Break articleReader state |
| `src/components/social/Stories.jsx` | Stories components | Break story rendering |

---

### Authentication
**Skill:** `.agent/skills/auth-session/SKILL.md`

| File | Purpose | DO NOT |
|------|---------|--------|
| `src/lib/authUtils.js` | Auth helpers | Break getAuthUser |
| `pages/api/auth/*` | Auth endpoints | Change session logic |

---

## How to Check Before Modifying

1. **Search this file** for the file you want to modify
2. **If listed**, read the skill file first
3. **Run the test** before making changes
4. **Run the test again** after making changes
5. **If test fails**, revert your changes

---

## Adding New Protected Files

When you build something important:
1. Add it to this registry
2. Create a skill file documenting it
3. Create an E2E test
4. Add DO NOT MODIFY comments to the source

---

## Last Updated
- 2026-01-24: Added In-App Article Reader protection
