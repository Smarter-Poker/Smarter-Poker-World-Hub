---
description: Mandatory rule — all live testing and verification must use smarter.poker production, never localhost
---

# Live Testing & Verification Standard

> **🚨 ABSOLUTE RULE: All Antigravity agents MUST use `https://smarter.poker` for ALL live testing, verification, audits, and browser-based checks. NEVER use localhost.**

## Base URLs

| Purpose | URL |
|---------|-----|
| **All Testing & Verification** | `https://smarter.poker` |
| **Club Arena** | `https://smarter.poker/club-arena` |
| **World Hub** | `https://smarter.poker/hub` |
| **Any page** | `https://smarter.poker/<path>` |

## What This Means

1. When verifying a fix — navigate to `https://smarter.poker/<page>`
2. When running an E2E audit — use `https://smarter.poker`
3. When testing UI changes — screenshot from `https://smarter.poker`
4. When checking API responses — hit `https://smarter.poker/api/<endpoint>`

## Prohibited Actions

- ❌ `npm run dev` for testing/verification
- ❌ `next dev` for testing/verification
- ❌ `http://localhost:3000` or any localhost URL for verification
- ❌ Starting any local server to verify changes

## Test Account

- **Email:** `daniel@bekavactrading.com`
- **Password:** `Bek454545!!`

## Rationale

All code is deployed to Vercel production via git push. The production environment at `smarter.poker` is the single source of truth for verification. Testing against localhost introduces environment parity issues and wastes time on server management.
