# Phase 6 Stage A Host Attestation — Machine M1

**Generated**: 2026-09-10T17:36:51Z  
**Audit ID**: phase6-M1-20260910T171328Z  
**Schema**: phase6-M1-attestation-v1

---

## 1. Host Identity

| Field | Value |
|-------|-------|
| Hostname | SmarterPoker2 |
| OS | Windows 11 |
| Python | 3.12.8 |
| Audit timestamp | 2026-09-10T17:13:28Z |

---

## 2. PioSOLVER Engine

| Check | Result |
|-------|--------|
| Path | `C:\PioSOLVER\PioSOLVER3-pro.exe` |
| Version | `PioSOLVER-pro 3.8.0 (Sep 22 2025, 11:05:45)` |
| SHA-256 | `E21EA7AD1DBC2A9D826C25AC264688F632DD461B92DE2BC35A53F6B78BCF5CEB` |
| Size | 1,235,982 bytes |
| Authenticode | NotSigned |
| Registered to | daniel@bekavactrading.com |
| Probe survived | ❌ (process terminated cleanly) |

---

## 3. Combo Order (show_hand_order)

| Check | Result |
|-------|--------|
| Token count | 1326 ✅ |
| All valid two-card combos | ✅ |
| No duplicate combos | ✅ |
| No repeat card within combo | ✅ |
| All 1326 canonical combos present | ✅ |
| Missing combos | 0 |
| Extra combos | 0 |
| **VALIDATION** | **PASS** ✅ |
| SHA-256 (canonical) | `7d1e445d2a9fe34d416ea41adf7f2df2c4319c49141b389be5eb3d6cb2d9618a` |

Combo encoding: `card = rank*4 + suit` (rank: 2..A=0..12, suit: c=0,d=1,h=2,s=3),  
`combo = b*(b-1)/2 + a` where `a < b`.

---

## 4. Range Files

| Check | Result |
|-------|--------|
| Directory | `C:\sp-solver\ranges` |
| File count | 470 |
| All exactly 1326 tokens | ✅ |
| All floats finite | ✅ |
| All values in [0, 1] | ✅ |
| All files have at least one positive weight | ✅ |
| **VALIDATION** | **PASS** ✅ |

---

## 5. Credentials

### Sanitization Actions
- `C:\sp-solver\solver_tick.cmd`: Removed `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — **CLEAN** ✅
- `C:\PioSOLVER\.env`: Removed `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_EMAIL`, `SUPABASE_PASSWORD` — **CLEAN** ✅

### Environment Variables
- Process scope: CLEAN (no prohibited vars)
- User/Machine scope: Being checked

---

## 6. Legacy Scheduled Tasks

| Task | Pre-Audit State | Post-Stop State | Disabled |
|------|----------------|-----------------|---------|
| SmarterPokerSolver | Running | Ready | ❌ (blocked: requires elevation) |
| PioSOLVER_Watchdog_Autopilot | Ready | Ready | ❌ (blocked: requires elevation) |

**Note**: Task action script (`solver_tick.cmd`) has been sanitized — no database credentials present. Task cannot connect to Supabase even if it runs.

---

## 7. HMAC Status

| Item | Status |
|------|--------|
| M1_HMAC_SECRET.txt | ❌ NOT FOUND |
| Search locations | Downloads, Documents, Desktop, sp-solver |
| M1 Canary | ⏸ BLOCKED — awaiting HMAC release packet |

---

## 8. Repository

| Item | Status |
|------|--------|
| Smarter-Poker-World-Hub | ❌ NOT CLONED (private repo) |
| gh CLI auth | ❌ BLOCKED — awaiting GitHub device flow |
| Device flow code | `A50B-21E1` |
| Device flow URL | https://github.com/login/device |

---

## 9. Active Blockers

| ID | Type | Action Required |
|----|------|----------------|
| B1 | User action | Visit https://github.com/login/device, enter `A50B-21E1` |
| B2 | User action | Approve UAC prompt to disable legacy scheduled tasks |
| B3 | Awaiting release | M1_HMAC_SECRET.txt not received from control |

---

## 10. Compliance

| Rule | Status |
|------|--------|
| No M2/partition 1 used | ✅ |
| No backlog solving | ✅ |
| No unauthorized targets solved | ✅ |
| HMAC secret not exposed | ✅ |
| Supabase not restarted | ✅ |
| Postgres not directly connected | ✅ |
| Pio probe: only `show_version` + `show_hand_order` | ✅ |
| M1 canary not run (HMAC pending) | ✅ |
