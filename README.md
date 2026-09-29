# ⚔️ Counter — Mobile Social Duel Network for Solana Mobile

[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet%20Deployed-14F195?style=for-the-badge&logo=solana)](https://explorer.solana.com/address/52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT?cluster=devnet)
[![Solana Mobile](https://img.shields.io/badge/Solana%20Mobile-MWA%202.0%20%2B%20Seeker-9945FF?style=for-the-badge&logo=android)](https://solanamobile.com)
[![SKR Staking Gated](https://img.shields.io/badge/SKR%20Staking-Mainnet%20Qualified-FFD60A?style=for-the-badge)](https://solanamobile.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

> **Put your money where your mouth is.**  
> Counter turns hot takes, crypto debates, and sports banter into **high-stakes 1v1 on-chain duels**, parimutuel backer pools, authoritative oracle resolutions, and viral NFT-styled settlement receipts on Solana Mobile.

---

## 🌟 Key Product Features

- 🗡️ **1v1 Captain Duels & Mutual Agreement**: Propose challenges against any take, negotiate stakes in cUSD, and agree on immutable resolution terms on-chain.
- 🌊 **Parimutuel Outside Backer Pools**: Dynamic real-time odds bars that auto-adjust payout multipliers as spectators back Side A or Side B before the cutoff lock.
- 🔒 **Trustless Program-Controlled Escrow**: Built from scratch in Rust as a native Solana SBF program with programmatic PDA vaults (`[b"vault", duel_pda]`) and Position PDAs (`[b"position", duel_pda, user]`).
- ⭐ **High-Stakes SKR Arena Gating**: Derives official Solana Mobile `UserStake` PDAs on Mainnet-Beta across Guardian Pools, unlocking exclusive high-stakes arenas for verified SKR stakers.
- ⚡ **Deterministic Multi-Category Resolvers**: Automated settlement engine querying CoinGecko (Crypto thresholds), TheSportsDB (Official sports match results), and Open-Meteo (Verifiable weather conditions).
- 📜 **Permanent Receipts & Deep Links**: Every resolved duel generates a cryptographic resolution receipt with proof hash, on-chain signature, and `counter://duel/:id` or `counter://receipt/:id` deep-links for viral sharing.
- 🛡️ **Built-in Moderation & SIWS**: Sign-in with Solana (Ed25519 detached signature verification) + Content Reporting and User Blocking.

---

## 🏗️ Architecture Overview

```
                     ┌─────────────────────────────────────────────────┐
                     │          Counter Mobile App (React Native)      │
                     │   - MWA 2.0 Native Wallet Authorization         │
                     │   - Social Feed, Arena HUD, Odds Visualizer     │
                     │   - Deep Link Router (counter://duel/:id)       │
                     └───────────────┬─────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           │                                                   │
           ▼                                                   ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Counter Backend & Database   │              │ Solana Devnet Smart Program  │
│ - Express.js REST API        │              │ - Program ID: 52Qgq...NmT    │
│ - Durable SQLite (sql.js)    │              │ - Duel PDA & Vault PDA       │
│ - SIWS Auth & Session Tokens │              │ - Parimutuel Payout Logic    │
│ - Deterministic Resolvers    │              │ - Per-User Position PDAs     │
└──────────────┬───────────────┘              └──────────────┬───────────────┘
               │                                             │
               ▼                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Solana Mainnet-Beta RPC      │              │ Devnet SPL Token Vault       │
│ - StakeConfig PDA Derivation │              │ - cUSD Escrow Balance        │
│ - GuardianPool UserStake     │              │ - Atomic Claim & Refund CPIs │
└──────────────────────────────┘              └──────────────────────────────┘
```

---

## 📜 On-Chain Program Details (Devnet)

- **Program ID:** `52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT`
- **Escrow Vault PDA:** `8F7RhULAD3zySGXWrb3cQUWMkaa6hansvdW2PaATpFVG`
- **Devnet cUSD Mint:** `AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC` (SPL Token-owned; verified live)
- **Instructions:**
  1. `InitializeDuel (0)`: Seeds `[b"duel", duel_id]` + `[b"vault", duel_pda]`.
  2. `DepositStake (1)`: Captains & outside backers deposit cUSD into PDA vault.
  3. `ResolveDuel (2)`: Authorized deterministic oracle settles winner (`ResolvedSideA`, `ResolvedSideB`, or `Cancelled`).
  4. `ClaimPayout (3)`: Parimutuel payout computation `stake + (stake * losing_pool) / winning_pool`. Losers & double-claims are strictly rejected.

---

## 🛡️ Official SKR Staking Verification

Counter qualifies contenders for the High-Stakes Arena by deriving official Solana Mobile SKR Staking accounts on **Solana Mainnet-Beta**:

- **Staking Program:** `SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ`
- **StakeConfig PDA:** `4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw`
- **GuardianPool PDA:** `DPJ58trLsF9yPrBa2pk6UaRkvqW8hWUYjawe788WBuqr`
- **UserStake Formula:** `PublicKey.findProgramAddressSync([b"user_stake", StakeConfig, userWallet, GuardianPool], ProgramID)`
- **Arena Threshold:** `>= 100 SKR` active stake unlocks Arena Contender status and high-stakes pool creation.

---

## 🚀 Quick Start & Development

### Prerequisites
- Node.js >= 20.x
- pnpm or npm
- Android SDK 35 + JDK 17 (for APK rebuilds)

### 1. Start the Social Backend
```bash
cd server
pnpm install
# Run comprehensive 8/8 adversarial test suite
node test/backend-adversarial-tests.js
# Start server daemon (port 3001)
node index.js
```

### 2. Run the Mobile App
```bash
cd app
pnpm install
pnpm tsc --noEmit # Verify TypeScript types
pnpm start        # Start Expo dev server
```

### 3. Native Android Debug APK
The compiled multi-ABI (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) Android APK is located at:
```
app/android/app/build/outputs/apk/debug/app-debug.apk
```
To install on an attached Android or Seeker device:
```bash
adb install -r app/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🧪 Adversarial Test Suite Summary

The automated test suite (`server/test/backend-adversarial-tests.js`) validates:
1. **SIWS Authentication:** Replay protection, detached signature verification, tampered token rejection.
2. **Takes & Social Feed:** Category taxonomy, author handle binding, comments threading.
3. **Challenge Negotiation:** Counteroffer state machine, stake updates, mutual acceptance.
4. **Parimutuel Math:** Dynamic odds updates (`1.5x` vs `3.0x`), conservation of total pool invariants.
5. **Deterministic Resolvers:** Multi-category probes (CoinGecko, Sports, Weather) + settlement receipt generation.
6. **Rivalry Graph:** Head-to-head records and disputed volume aggregation.
7. **Moderation:** Abusive user blocking and content report queues.
8. **SKR Gating:** Mainnet-Beta UserStake account derivation.

---

## 📄 License
MIT License. Built for the Solana Mobile CLOCK IN Hackathon 2026.
