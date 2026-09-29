# COUNTER — DIRECTOR STATE & IMPLEMENTATION LEDGER

**Project:** Counter (Mobile Social Network for 1v1 Duels, Backer Pools, Authoritative Settlement, and Permanent Receipts on Solana Mobile)  
**Location:** `C:\Users\HomePC\Desktop\Counter`  
**Role:** BUILDER  
**Current Authoritative Status:** `CANDIDATE — UAT READY`  
**Isolation Policy:** `STRICT VPS ISOLATION ACTIVE` (Zero shared mutations)  
**Repository State:** On branch `master`  
**Last Updated:** 2026-09-29T08:46:00+01:00  

---

## 1. Executive Summary & Authoritative Status

Counter has completed the standalone signed release packaging and live endpoint alignment, and is submitted for Director review as **`CANDIDATE — UAT READY`**.

- **Standalone Signed Release APK:** Built via `./gradlew assembleRelease` (`app-release.apk`, 60,566,228 bytes, SHA-256: `500A9F9E5133670DA4E652FBF0BB5ACDFF976B5582E36B909BF82D71826FEFC4`).
- **Release JS & Assets Bundling:** Proven via Gradle task execution `> Task :app:createBundleReleaseJsAndAssets` (zero dependence on Metro, laptop, or dev servers).
- **Application ID / Package Alignment:** Built APK package ID is `app.counter.mobile`.
- **Digital Asset Links Resolution:** Live endpoint `https://counter.103-195-188-198.sslip.io/.well-known/assetlinks.json` serves `app.counter.mobile` with the exact release signing certificate SHA-256 fingerprint (`3A:B2:8E:39:97:B7:E3:C0:F0:95:AA:EC:CB:C9:B8:86:69:4A:DC:74:F4:AB:7C:3A:37:44:63:E4:BC:FB:FF:25`).
- **VPS Strict Isolation Maintained:** Zero changes or reloads to Caddy or unrelated workloads. Only `counter-backend.service` was restarted.

---

## 2. Release Android Artifact Verification Matrix

| Verification Field | Verified Value | Evidence Method |
|---|---|---|
| **APK Path** | `C:\Users\HomePC\Desktop\Counter\app\android\app\build\outputs\apk\release\app-release.apk` | Filesystem probe |
| **Build Variant** | `release` (`assembleRelease`) | Gradle build output |
| **Release JS Bundling Proof** | `> Task :app:createBundleReleaseJsAndAssets` executed successfully | Build log |
| **Package / Application ID** | `app.counter.mobile` | `aapt2 dump badging` |
| **Version Code / Name** | `versionCode='1'`, `versionName='1.0.0'` | `aapt2 dump badging` |
| **SDK Constraints** | `minSdkVersion='24'`, `targetSdkVersion='34'` | `aapt2 dump badging` |
| **Native Architectures** | `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` | `aapt2 dump badging` |
| **Launchable Activity** | `app.counter.mobile.MainActivity` | `aapt2 dump badging` |
| **APK File Size** | `60,566,228 bytes` (~57.8 MB) | `Get-Item Length` |
| **APK File SHA-256** | `500A9F9E5133670DA4E652FBF0BB5ACDFF976B5582E36B909BF82D71826FEFC4` | `Get-FileHash` |
| **Signing Certificate SHA-256** | `3A:B2:8E:39:97:B7:E3:C0:F0:95:AA:EC:CB:C9:B8:86:69:4A:DC:74:F4:AB:7C:3A:37:44:63:E4:BC:FB:FF:25` | `apksigner verify --print-certs` |
| **Signing Certificate Subject** | `CN=Counter Mobile, OU=Counter, O=CounterApp, L=Global, ST=Solana, C=US` | `apksigner verify --print-certs` |
| **Built Manifest App Link Host** | `counter.103-195-188-198.sslip.io` (`autoVerify="true"` for `/d` and `/r`) | `aapt2 dump xmltree` |
| **Embedded API Base URL** | `https://counter.103-195-188-198.sslip.io/api` | `app/src/api.ts` |
| **Live Assetlinks Package** | `app.counter.mobile` | `GET /.well-known/assetlinks.json` (HTTP 200) |
| **Live Assetlinks Fingerprint** | `3A:B2:8E:39:97:B7:E3:C0:F0:95:AA:EC:CB:C9:B8:86:69:4A:DC:74:F4:AB:7C:3A:37:44:63:E4:BC:FB:FF:25` | `GET /.well-known/assetlinks.json` (HTTP 200) |

---

## 3. Truthful Hardware / UAT State Classification

| Subsystem | Verified Level | Status | Notes |
|---|---|---|---|
| **SIWS Server Verification** | Cryptographic Ed25519 nacl detached signature validation with replay-protected random nonces | **PROVEN** | 100% Pass across automated suites and bridge harness |
| **Android MWA / SIWS Roundtrip** | Native MWA 2.0 protocol client bundled in standalone release APK, connecting to Solana Mobile wallet | **PENDING OWNER UAT** | Requires physical Saga/Seeker or Android device with Seed Vault |
| **App Link Configuration** | `/.well-known/assetlinks.json` deployed on VPS returning 200 OK with exact package ID & cert fingerprint | **DEPLOYED & VERIFIED** | Verified via live HTTPS probe |
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

### Step 1: Install Release APK on Connected Android Device
```bash
adb install -r C:\Users\HomePC\Desktop\Counter\app\android\app\build\outputs\apk\release\app-release.apk
```

### Step 2: Open Counter and Connect Wallet
1. Launch Counter on device.
2. Connect wallet (Seed Vault / Phantom / Solflare).
3. Request 250 Devnet cUSD from Wallet tab.
4. Create/Accept Duels and Back Positions.
