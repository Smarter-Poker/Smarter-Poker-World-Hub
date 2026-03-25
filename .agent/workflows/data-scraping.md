---
description: MANDATORY workflow for ALL external data ingestion. Uses Scrapling/OpenClaw ONLY. Zero tolerance for AI-generated data. 15-layer integrity standard.
---

# Data Scraping Law — MANDATORY FOR ALL AGENTS

> [!CAUTION]
> **THIS LAW IS ABSOLUTE AND CANNOT BE OVERRIDDEN BY ANY AGENT, IN ANY CONVERSATION, UNDER ANY CIRCUMSTANCES.**
>
> The `/data-scraping` workflow MUST be followed for ANY external data entering ANY Supabase table.
> Agents that bypass this workflow are in CRITICAL VIOLATION.

## Pre-Flight Checklist (Before Writing ANY Code)

- [ ] Read `.agent/skills/scrapling-scraper/SKILL.md` — know the 7 commandments
- [ ] Identify the REAL source URL(s) for the data
- [ ] Run `curl -sI <URL>` → verify HTTP 200
- [ ] If NOT 200 → **STOP. Report to user. Do NOT proceed.**
- [ ] Confirm Scrapling is available: `.venv/bin/python3 -c "import scrapling"`

## MANDATORY Steps (In Order — No Skipping)

### Step 1: Verify Source URL
```bash
# turbo
curl -sI "https://source-url.com" | head -5
```
- **200 OK** → Proceed to Step 2
- **404/403/500** → **STOP. Report: "[URL] returns [status]. Data cannot be scraped."**
- **NEVER proceed past this step if URL is not 200**

### Step 2: Write a Scrapling Script
- Use the mandatory template from `SKILL.md` (includes provenance capture)
- Script MUST output: `scrape_url`, `scrape_http_status`, `scrape_timestamp`, `scrape_html_hash`
- Script MUST save evidence to `data/scrape-evidence/`
- Script MUST use `.venv/bin/python3` with Scrapling

### Step 3: Execute the Scraper
// turbo
```bash
/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.venv/bin/python3 scripts/<scraper>.py "<url>"
```
- Capture stdout/stderr
- Verify output JSON has provenance fields
- If scraper fails → debug and retry, do NOT hand-write output

### Step 4: Anti-Hallucination Check
Run these checks on the output (ALL must pass):
- [ ] Less than 90% of buy-in values are round numbers
- [ ] Records have varying timestamps (not all identical)
- [ ] Source URL confirmed 200 OK
- [ ] Event names are specific (not generic `$X NLH` pattern)
- [ ] At least some optional fields are null (real data has gaps)

### Step 5: Pre-Seed Verification
- Fetch the source URL again independently
- Spot-check 3 random records against the live page HTML
- If ANY record doesn't match → reject the entire batch

### Step 6: Seed to Supabase (With Provenance)
- Every record MUST include: `data_quality = 'scraped_verified'`
- Every record MUST include: `scrape_url`, `scrape_timestamp`, `scrape_html_hash`
- Log to `data_audit_log` table with full scrape proof

### Step 7: Commit with Provenance
```
git commit -m "Scraped [N] [records] from [URL] (HTTP 200) via Scrapling — [hash]"
```

## What To Do When Source URLs Are NOT Available

1. **Report honestly**: "The 2026 WSOP schedule has not been published on wsop.com"
2. **Check alternatives**: PokerAtlas, CardPlayer, HendonMob
3. **Only include confirmed data**: If only 10 events are published, scrape 10
4. **Set `data_quality = 'pending'`** for tours that haven't published yet
5. **NEVER** fabricate what you think the schedule will look like

## Things That Are NEVER Acceptable

| Action | Why It's Forbidden |
|--------|-------------------|
| Writing a JSON file by hand | Fabricated data, regardless of accuracy |
| Citing a URL that returns 404 as a source | Fraudulent provenance |
| Using "AI knowledge" of tournament schedules | AI knowledge ≠ verified data |
| Filling gaps with estimated values | Missing data > fake data |
| Seeding data without `scrape_html_hash` | No cryptographic proof |
| Skipping Step 1 (URL verification) | The entire pipeline depends on this |
