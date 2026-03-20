---
description: How to start, restart, or verify the local dev server
---

# Dev Server Workflow

// turbo-all

## Check If Server Is Already Running

1. Check if port 3000 is responding:
```bash
/usr/bin/curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/hub
```

- If **200** → Server is running. DO NOT restart. Proceed with your task.
- If **000** or timeout → Server is not running. Go to Step 2.
- If **500** → Server is running but crashing. Go to Step 3.

## Start Dev Server (Only If Not Running)

2. Start the dev server:
```bash
npm run dev
```
Wait for "Ready in Xs" message. Takes 5-15 seconds.

## Fix Crashed Server (500 Errors)

3. Only if you see `Cannot find module 'vendor-chunks'` or `MODULE_NOT_FOUND`:
```bash
npx kill-port 3000 2>/dev/null; rm -rf .next && npm run dev
```

**CRITICAL:** Do NOT nuke `.next` for any other reason. Do NOT nuke `.next` if other agents are active.

## Rules

- NEVER run `npm run build` during dev work — it blocks the server for minutes
- NEVER restart the server unless it's actually crashing
- If the server is on port 3001 or 3002, kill port 3000 first: `npx kill-port 3000`
- The dev script already kills port 3000 and sets `--max-old-space-size=16384`
