# Smarter.Poker — Session Memory Summary

**Last Updated:** 2026-03-29
**Platform:** smarter.poker
**Owner:** Dan / Antigravity Agents

---

## Platform Overview

Smarter.poker is a comprehensive poker ecosystem featuring AI training, live venue tracking, social features, virtual currency (diamonds), trivia games, horse racing simulations, and club-based real-money poker. The platform serves recreational and serious poker players through a progressive web app.

## Architecture

- **World Hub** (Next.js 14, Pages Router): 952 pages, 716+ API endpoints, 45 cron jobs, PWA
- **Club Arena** (React 19, Vite 6): Real-money poker client, V8 Bible engine compliance at ~40%
- **Club Engine** (React, Vite): Poker engine UI components
- **Diamond Arena** (React, Vite): Virtual currency poker
- **Identity DNA Engine** (Node.js): Player identity and profiling
- **AI Content GTO Engine** (Node.js): AI-generated poker training content
- **10 Orb Repos**: Embedded micro-apps (Arcade, Assistant, Bankroll, Marketplace, Memory, Memory-Games, Near-Me, Social, Training, Trivia)

## Hosting

- **Vercel**: 22 projects under Smarter-Poker team (team_SVD8r7AOPH065G3usBxVvrBc)
- **CRITICAL**: smarter.poker domain is on `hub-vanguard` (prj_op66GkZyZcygXQKm76iyycfVFAQx), NOT `smarter-poker`
- **Hetzner Cloud**: engine.smarter.poker (Club Arena game server)
- **Supabase**: Primary database and auth (kuklfnapbkmacvwxktbh.supabase.co)

## Tech Stack

Next.js 14, React 19, Vite 6, Supabase (Postgres + Auth + Storage), PostHog (analytics), Sentry (errors), Vercel (hosting + cron), Workbox (PWA service worker)

## Key Infrastructure

- **Middleware**: Protects /api/admin/*, /api/debug/*, /api/emergency/*, 7 destructive poker routes via x-admin-secret header
- **supabaseServerClient.js**: Patched createClient with local JWT decode fallback for GoTrue failures
- **getSupabase() pattern**: Lazy singleton init prevents module-scope env var crashes
- **Build Safety Gate**: CI workflow gates all deploys

## Build Status

- **Phases 1-4**: COMPLETE (toolkit plugin, E2E tests, live audit, cron fix cascade)
- **Phase 5**: SKIPPED (Commander SSR Auth — high risk of admin lockout)
- **Phases 6-10**: COMPLETE (cron monitoring, session memory, cross-project dashboard, performance baseline, infra hardening)
- **Phases 11-21**: COMPLETE (GTO Wizard Parity — training arena overhaul, smart training engine, analytics, leaderboards, range grid, blocker analysis, ghost replay, study streak)
- **Phase 22**: COMPLETE (Poker Brain Integration — 7s matchmaking timeout, horse AI opponents as invisible "real players", personality-modulated GTO decisions, human-like think time)

## Hetzner Game Server (Added 2026-04-13)

- **SSH:** `root@178.156.160.206` (key-based auth)
- **Hetzner Server ID:** 125093929 | API Token stored in `.memory/context/hetzner-server-credentials.md`
- **Docker Container:** `club-arena-engine` on port 8080
- **Repo on server:** `/opt/club-arena` (structure differs from World Hub — verify paths)
- **Deploy:** `ssh root@178.156.160.206 "cd /opt/club-arena && git pull origin main && docker restart club-arena-engine"`

## Dan's Workflow Preferences (Added 2026-04-16, Updated 2026-04-20)

- **BINDING**: Dan NEVER runs terminal commands himself. YOU execute pushes, deploys, builds, git ops, SQL, migrations directly from bash.
- **NO HANDOFFS (2026-04-20 override)**: The old "AntiGravity prompt handoff" pattern is DEAD. Acquire credentials yourself from `.memory/`, env files, and prior session transcripts. Execute the push/deploy/SQL yourself.
- **BOSS MODE (2026-04-20)**: Do not ask "what's next?" or present options. Decide based on the implementation plan + execution state, then EXECUTE.
- Sandbox constraints are facts to work around (use bash mounts, chunk edits, pipe around disk limits), not reasons to hand off.
- See: `.memory/preferences/dan-workflow-preferences.md`

## Automated Deploy Pipeline (Added 2026-04-16)

- **Self-healing deploy monitor**: Vercel webhook → `/api/deploy-monitor` → `/api/deploy-autofix` → Claude API → GitHub API → auto-rebuild
- **git-safe-push.sh v4.1**: 6-phase autonomous push script with build gate + post-deploy verification
- **verify-deploy.js**: Polls /api/health until SHA matches production
- **Circuit breaker**: Max 3 attempts per SHA + refuses to fix [autofix] commits
- **Webhook**: `account_hook_w0zgWqS05otiaAR4mYQe1UYo` fires `deployment.error` to deploy-monitor

## Key Metrics

- ~300 daily cron failures eliminated in Phase 4
- 6 bugs found and fixed in Phase 1 E2E audit
- 7 distinct failing endpoints traced and resolved
