# Hetzner "default" Project Audit — 2026-08-16

**Date:** 2026-08-16
**Auditor:** Antigravity Agent
**Scope:** Hetzner `default` project

## 1. Full Inventory (`default` project)

The `default` project was fully audited using the newly generated API token. 

**Result:** The project is entirely empty.
* **Servers:** 0
* **SSH Keys:** 0
* **Firewalls:** 0
* **Volumes:** 0
* **Networks:** 0
* **Floating IPs:** 0
* **Primary IPs:** 0
* **Snapshots:** 0
* **Load Balancers:** 0

## 2. 178.156.160.206 Verdict

**Resolution:** Not found in the project. Escalated to Dan, who confirmed that `178.156.160.206` was successfully deleted from the account and the IP released back to Hetzner's pool. There is no fifth machine.

## 3. Key Classification

**Result:** 0 keys present in the `default` project. No attacker keys exist here.

## 4. Per-Host IOC Findings & Remediation

**Result:** N/A. No hosts exist in this project to sweep.

## 5. Firewalls

**Result:** N/A. No hosts exist to protect.

## 6. Token Hygiene

**Result:** The unused plaintext copies of `HETZNER_API_TOKEN` have been successfully stripped from:
* `~/Documents/Smarter-Poker-World-Hub/.env.local`
* `~/Documents/club-arena/.env`

The macOS keychain (`hetzner-api` and `hetzner-api-default`) remains the single source of truth for these credentials.

## 7. Outstanding Action: Hetzner Support

Dan must send the following email to Hetzner Support to determine the exact entry vector of the compromised keys.

---
**To:** `info@hetzner.com`
**Subject:** Urgent: Account Audit Request for Intrusion Investigation (Customer ID K0397552326)

Hello Hetzner Support,

I am writing regarding my account (Customer ID: K0397552326). We recently discovered and contained a prolonged intrusion across our infrastructure involving unauthorized XMRig miners and VLESS/XRay proxy exit nodes. 

During our forensic audit, we found that the attacker successfully added five unauthorized SSH keys to our Hetzner project's key store between May 9, 2026, and July 18, 2026. This allowed them to persist access to newly provisioned servers.

To complete our investigation and assess the blast radius, we urgently need to know the entry vector used to add these keys. We kindly request the following logs from **May 1, 2026, to present**:

1. **Account Login History:** A full log of all successful console logins (IP addresses, timestamps, and user agents) for `admin@smarter.poker`.
2. **API Audit History:** A full log of all Cloud API actions (specifically SSH key creations and server provisioning), including the IP addresses that made the requests and which API token was used.

We need to definitively establish whether the attacker compromised our account password via the console or solely relied on a stolen API token. 

Thank you for your prompt assistance.

Best regards,
Daniel Bekavac
---
