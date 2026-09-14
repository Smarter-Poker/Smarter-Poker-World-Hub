# M1 Phase 6 Stage A Remediation Attestation

## Overview
- **Machine**: M1 (SmarterPoker2)
- **Capture Window**: 2026-09-11T05:34:05Z to 2026-09-11T05:38:37.226839+00:00
- **Verdict**: HOLD

## Repository State
- **URL**: https://github.com/Smarter-Poker/Smarter-Poker-World-Hub
- **Fetched HEAD**: 33a0381b1757398a1b220bada072e35d1f44dfcc
- **Anchor Ancestry**:
  - `e628f15542`: PASS
  - `7a5651cc0f`: PASS
  - `85a048b9d5`: PASS

## PioSOLVER Validation
- **Version**: PioSOLVER-pro 3.8.0 (Sep 22 2025, 11:05:45)
- **SHA-256**: `E21EA7AD1DBC2A9D826C25AC264688F632DD461B92DE2BC35A53F6B78BCF5CEB`
- **Authenticode**: unsigned
- **Hand Order**: `7d1e445d2a9fe34d416ea41adf7f2df2c4319c49141b389be5eb3d6cb2d9618a` (Combos: 1326)
- **Ranges**: 470 files, all valid

## Counters
- **Launcher Executions**: 0
- **Pio Probes**: 1
- **Pio Solves**: 0
- **Solved Spots**: 0
- **Exported Rows**: 0
- **Gateway Admissions**: 0
- **Canary Attempts**: 0

## Tasks & Inventory
- **SmarterPokerSolver**: Ready (failed to disable via UAC)
- **PioSOLVER_Watchdog_Autopilot**: Ready (failed to disable via UAC)
- **Processes**: All solver processes terminated
- **Persistence**: watchdog startup bat locked, scripts quarantined
- **HMAC Present**: False

## Credential Scan
- `SUPABASE_URL` in `C:\sp-solver\boot.py` (Line: 2) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `C:\sp-solver\boot.py` (Line: 2) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_URL` in `C:\sp-solver\orchestrate.py` (Line: 61) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `C:\sp-solver\orchestrate.py` (Line: 62) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_URL` in `C:\sp-solver\orchestrate.py` (Line: 65) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `C:\sp-solver\orchestrate.py` (Line: 65) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_URL` in `C:\sp-solver\query_db.py` (Line: 4) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `C:\sp-solver\query_db.py` (Line: 5) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_URL` in `C:\sp-solver\run_machine.py` (Line: 29) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `C:\sp-solver\run_machine.py` (Line: 29) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_URL` in `C:\sp-solver\supa_orc.py` (Line: 61) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `C:\sp-solver\supa_orc.py` (Line: 62) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_URL` in `C:\sp-solver\supa_orc.py` (Line: 65) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `C:\sp-solver\supa_orc.py` (Line: 65) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_URL` in `C:\sp-solver\upload_pipeline.py` (Line: 7) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `C:\sp-solver\upload_pipeline.py` (Line: 8) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_URL` in `C:\sp-solver\upload_v2.py` (Line: 3) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `C:\sp-solver\upload_v2.py` (Line: 4) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_URL` in `C:\PioSOLVER\.env` (Line: 1) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_ANON_KEY` in `C:\PioSOLVER\.env` (Line: 2) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `C:\PioSOLVER\.env` (Line: 3) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_SERVICE_KEY` in `C:\PioSOLVER\.env` (Line: 4) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_EMAIL` in `C:\PioSOLVER\.env` (Line: 5) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_PASSWORD` in `C:\PioSOLVER\.env` (Line: 6) - True -> Cleaned via Phase 6 Stage A (value removed) [PASS]
- `SUPABASE_URL` in `Environment Variable` (Line: N/A) - False -> None needed [PASS]
- `SUPABASE_ANON_KEY` in `Environment Variable` (Line: N/A) - False -> None needed [PASS]
- `SUPABASE_SERVICE_ROLE_KEY` in `Environment Variable` (Line: N/A) - False -> None needed [PASS]
- `SUPABASE_SERVICE_KEY` in `Environment Variable` (Line: N/A) - False -> None needed [PASS]
- `SUPABASE_PASSWORD` in `Environment Variable` (Line: N/A) - False -> None needed [PASS]
- `SUPABASE_EMAIL` in `Environment Variable` (Line: N/A) - False -> None needed [PASS]
- `DATABASE_URL` in `Environment Variable` (Line: N/A) - False -> None needed [PASS]
- `POSTGRES_URL` in `Environment Variable` (Line: N/A) - False -> None needed [PASS]
- `PGHOST` in `Environment Variable` (Line: N/A) - False -> None needed [PASS]
- `PGPASSWORD` in `Environment Variable` (Line: N/A) - False -> None needed [PASS]

## Remaining Prerequisites
- Formal scheduled task disable via elevated access
- M1_HMAC_SECRET.txt delivery via authenticated channel
- Signed gateway approval
