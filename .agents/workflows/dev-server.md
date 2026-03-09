---
description: How to start, restart, or verify the local dev server
---

# Dev Server Management

> **CRITICAL**: The dev server runs on port 3000 ONLY. Never start on 3001/3002/etc.

## Check if the server is already running

// turbo
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
```

- If you get `200` → server is running, DO NOT start another one
- If you get `000` or connection refused → server is down, start it

## Start the server (if it's down)

// turbo
```bash
npm run dev
```

This automatically:
1. Kills any zombie process on port 3000
2. Starts Next.js on port 3000 (forced, never 3001)
3. Uses 8GB max memory

## Restart the server (if it's broken)

// turbo
```bash
npm run nuke:dev
```

This automatically:
1. Kills port 3000
2. Nukes `.next/` and `node_modules/.cache/`
3. Starts fresh on port 3000

## Rules for agents

1. **NEVER** run `npx next dev` directly — always use `npm run dev`
2. **NEVER** start the server if port 3000 already returns 200
3. **NEVER** use a port other than 3000
4. **ALWAYS** check health first before assuming the server is down
5. If the server is crashing, use `npm run nuke:dev` not manual commands
