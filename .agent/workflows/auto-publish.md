---
description: Auto-publish to smarter.poker after any code changes
---
# Auto-Publish Law

**MANDATORY**: After ANY code changes to hub-vanguard, you MUST immediately deploy to production.

## Auto-Publish Steps (After Every Code Change)

// turbo-all
1. Build the project
```bash
npm run build
```

2. Commit all changes
```bash
git add -A && git commit -m "[description of changes]"
```

3. Push to GitHub
```bash
git push origin main
```

4. Deploy to smarter.poker
```bash
vercel --prod
```

5. Verify deployment is live
```bash
curl -s "https://smarter.poker/" | grep -o "buildId[^,]*"
```

## Important Notes
- NEVER claim success without verifying the user can see the changes
- If user reports changes not visible, force hard refresh verification
- Build ID timestamp should be within the last few minutes
