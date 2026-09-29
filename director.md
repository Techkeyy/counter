# COUNTER — DIRECTOR STATE & IMPLEMENTATION LEDGER

**Project:** Counter (Mobile Social Network for 1v1 Duels, Backer Pools, Authoritative Settlement, and Permanent Receipts on Solana Mobile)  
**Location:** `C:\Users\HomePC\Desktop\Counter`  
**Role:** BUILDER  
**Current Authoritative Status:** `UAT READY`  
**Isolation Policy:** `STRICT VPS ISOLATION ACTIVE` (Zero shared mutations)  
**Repository State:** On branch `master`  
**Last Updated:** 2026-09-29T07:14:00+01:00  

---

## 1. Executive Summary & Operational State

Counter is **`UAT READY`** under the **Strict Isolation / No-Surprises Operations Policy**.

- **VPS Workload Isolation:** The Counter backend operates entirely inside `/opt/counter/`, listening on isolated loopback port `127.0.0.1:8795`, managed by `counter-backend.service` (PID 885834, 38.1 MB RAM).
- **Shared Infrastructure Untouched:** Caddy and shared configuration files (`/etc/caddy/Caddyfile`, systemd units, firewall, Docker, apt) are untouched. No services were reloaded or restarted.
- **Stable Remote HTTPS API:** `https://counter.103-195-188-198.sslip.io` is 100% operational with valid Let's Encrypt TLS.
- **Standalone Android APK:** Compiled standalone debug binary (`app-debug.apk`, 126,558,056 bytes, SHA-256: `48B4799CB2C6DF177938B45302E70BA933E5E06FDA428393B1354B3DC1EDCA01`) hardcoded with the stable VPS endpoint and autoVerify App Links.
- **Keypair Security:** Restricted file permissions `0600` (`-rw-------`) applied to `/opt/counter/server/config/authority-keypair.json`.

---

## 2. VPS Resource & Coexistence Safety Diagnostics

Conducted via non-destructive read-only inspection:

| Resource Metric | Measured Value | Coexistence Safety Assessment |
|---|---|---|
| **RAM (Available / Total)** | `859 MiB / 1.9 GiB` (Free: `303 MiB`, Buff/Cache: `749 MiB`) | **HEALTHY** (Counter backend consumes only 38.1 MiB) |
| **Disk Storage (Root FS)** | `2.7 GiB Available / 24 GiB Total` (89% used) | **STABLE** (SQLite DB is < 1 MB; no run-away logs) |
| **CPU Load Average** | `0.02, 0.04, 0.00` | **IDLE / HEALTHY** |
| **Active Listening Ports** | `8782`, `8787`, `8788`, `8789`, `8790`, `8791`, `8792`, `8793`, `8794` | **UNTOUCHED** (Other user workloads completely undisturbed) |
| **Counter Dedicated Port** | `127.0.0.1:8795` (bound by `node` PID 885834) | **ISOLATED** (No port collisions) |
| **Counter Service Status** | `counter-backend.service` (`active (running)`) | **HEALTHY** (Up 8+ hours continuously) |
| **Shared Caddy Status** | Running (PID 186408), `/etc/caddy/Caddyfile` unmodified | **ZERO MUTATIONS / NO RELOAD PERFORMED** |
| **Secret Hygiene** | `/opt/counter/server/config/authority-keypair.json` (`-rw-------`, 600) | **SECURE / RESTRICTED** |

---

## 3. Truthful Hardware / UAT Classification Table

| Subsystem | Verified Level | Status | Notes |
|---|---|---|---|
| **SIWS Server Verification** | Cryptographic Ed25519 nacl detached signature validation with replay-protected random nonces | **PROVEN** | 100% Pass across automated suites and bridge harness |
| **Android MWA / SIWS Roundtrip** | Native MWA 2.0 protocol client bundled in APK, connecting to Solana Mobile wallet | **PENDING OWNER UAT** | Requires physical Saga/Seeker or Android device with Seed Vault |
| **App Link Configuration** | `/.well-known/assetlinks.json` deployed on VPS returning 200 OK with correct fingerprints | **DEPLOYED** | Verified via public HTTPS endpoint |
| **Deep Link App Launch** | Intent filters configured in AndroidManifest for `counter://` and `https://` schemes | **PENDING DEVICE UAT** | Requires physical Android device or external browser redirect |
| **Remote Backend Hosting** | Isolated VPS deployment (`https://counter.103-195-188-198.sslip.io`) | **PROVEN & RUNNING** | Zero dependency on local development laptop |

---

## 4. Preserved On-Chain Devnet Economic Proof (Integration Accepted)

- **Program ID:** `52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT`
- **Duel PDA:** `BmbhSEGAPfuZASzjx2Xibp4AWM2z7gsZtkTrq3Z7tNWz`
- **Vault Token ATA:** `2Xpm9gdyzZSqFBCEcCuUuXknjdxE9ceWRMoTs3SY8pU1`
- **Devnet cUSD Mint:** `AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC`
- **Accepted On-Chain Transactions:**
  - Initialize: `2wEPDVpPQ9YdfSKEqh6h4N45UHnJDFRTREQAxRppWdnQr5gjxNBkJZxvrGqEjCWBMhxEQKvsscHjeN86i2MkVfZW`
  - Stake A ($50): `42UU2V6mTySEsXd2dSRTk43zkiVksANDWh4aSFhkqQwUzvhiuMoN6rjoRHbkwncVsVikxc7PeYP5iHJmzCsVxNYv`
  - Stake B ($50): `3CCE1v9eeapwbGjaNCRoBAkpaigwiqaHFW1rWBSD7inF93eVDLpZoZVmwJYfGfyV4ddtTG7Cfv1Dianfc8E5o7Zb`
  - Backer C ($25): `TSSbgu9gwTtdCMx4Vn15QRYCQMonJ4hypdLTZvfRvBuqjV7yAXdH57VoANPyuBK44KZE1BB6f4waV9YsAUKATjq`
  - Resolution: `8Yjzcm66aQ22MRB1Mk1uyykcweKqEbNhkbkbRN8F1ReE4gFaWZF9sz1v7chMLMMgQSStbXr7cwMZgsUzUCuNPnN`
  - Claims A & C (1.67x Multiplier): Executed and verified
  - Devnet Faucet Mint Tx: `Q1RnAJM5SbLYess5viZCUyTwFVziPs6kR2UcjznfcRorqrik9Szop4Lu49s6GSnZs8pLfNafqJDecgdq4uqwPFQ`
- **16-Invariant Compliance:** All 16 audit invariants verified.

---

## 5. Owner UAT Testing Instructions

### Step 1: Install Standalone APK on Android Device
```bash
adb install -r C:\Users\HomePC\Desktop\Counter\app\android\app\build\outputs\apk\debug\app-debug.apk
```

### Step 2: Open Counter and Connect Wallet
1. Launch Counter on device.
2. Connect wallet (Seed Vault / Phantom / Solflare).
3. Request 250 Devnet cUSD from Wallet tab.
4. Create/Accept Duels and Back Positions.
