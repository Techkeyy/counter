# ⚔️ Counter — Mobile Social Duel Network for Solana Mobile

[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet%20Deployed-14F195?style=for-the-badge&logo=solana)](https://explorer.solana.com/address/52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT?cluster=devnet)
[![Solana Mobile](https://img.shields.io/badge/Solana%20Mobile-MWA%202.0%20%2B%20Seeker-9945FF?style=for-the-badge&logo=android)](https://solanamobile.com)
[![SKR Staking Gated](https://img.shields.io/badge/SKR%20Staking-Mainnet%20Qualified-FFD60A?style=for-the-badge)](https://solanamobile.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

> **Put your money where your mouth is.**  
> Counter turns hot takes, crypto debates, and sports banter into **private 1v1 social Duels**, program-controlled Devnet cUSD outcomes, authoritative resolution evidence, and permanent settlement receipts on Solana Mobile.

---

## 🌟 Key Product Features

- 🗡️ **1v1 Captain Duels & Mutual Agreement**: Propose challenges against any Take, agree on cUSD terms, and privately confirm the result together.
- 🧭 **Clear social lifecycle**: Incoming, Sent, Active, Claimable, and Completed states keep the next action obvious without odds or trading-terminal UI.
- 🔒 **Trustless Program-Controlled Escrow**: Built from scratch in Rust as a native Solana SBF program with programmatic PDA vaults (`[b"vault", duel_pda]`) and Position PDAs (`[b"position", duel_pda, user]`).
- ⭐ **SKR Arena curation**: Derives the official Solana Mobile `UserStake` account on Mainnet-Beta and unlocks a read-only curated Arena feed only when active staked SKR is proven. SKR does not affect stake, payout, winner, refund, custody, settlement, or claim authorization.
- ⚡ **Deterministic Multi-Category Resolvers**: Automated settlement engine querying CoinGecko (Crypto thresholds), TheSportsDB (Official sports match results), and Open-Meteo (Verifiable weather conditions).
- 📜 **Permanent Receipts & Deep Links**: Every resolved Duel generates a durable receipt with proof data, on-chain signature, and `counter://duel/:id`, `counter://receipt/:id`, plus production HTTPS `/d/...` and `/r/...` links. Every supported surface uses one canonical receipt-opening route.
- 🛡️ **Built-in Moderation & SIWS**: Sign-in with Solana (Ed25519 detached signature verification) + Content Reporting and User Blocking.

---

## 🏗️ Architecture Overview

```
                     ┌─────────────────────────────────────────────────┐
                     │          Counter Mobile App (React Native)      │
                     │   - MWA 2.0 Native Wallet Authorization         │
                    │   - Social Feed, SKR Arena curation, receipts   │
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
- **Arena qualification:** active staked SKR `> 0` in the verified `UserStake` account unlocks the read-only SKR Arena discovery surface. The app does not claim that SKR stake alone proves Seeker hardware ownership; official Seeker Genesis Token verification is a separate contract.

The current official references are [Seeker ID / Genesis Token](https://github.com/solana-mobile/solana-mobile-docs/blob/main/solana-mobile-stack/seeker-id.mdx), the [official SKR staking sample](https://github.com/solana-mobile/react-native-samples/tree/main/skr-staking), and [SKR token information](https://solanamobile.com/skr).

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
4. **Outcome and refund math:** Winner total-pool payout and mismatch principal-refund invariants are tested separately; no odds UI is part of the active V1 product.
5. **Deterministic Resolvers:** Multi-category probes (CoinGecko, Sports, Weather) + settlement receipt generation.
6. **Rivalry Graph:** Head-to-head records and disputed volume aggregation.
7. **Moderation:** Abusive user blocking and content report queues.
8. **SKR Gating:** Mainnet-Beta UserStake account derivation, qualified/unqualified Arena states, and economic isolation.

## Finalization scope

- Receipts opened from Duel detail, Activity, Profile, terminal Duel paths, and both custom/HTTPS links all resolve through `openReceipt`.
- Receipt identity precedence is display name → `@handle` → shortened public wallet. Refund receipts distinguish pending return copy from the completed `Refunded / recorded` state.
- The Android launcher uses Counter’s existing target mark in adaptive, round, and legacy resources.
- No new economic transaction or SKR staking flow is introduced by the Arena slice.

---

## 📄 License
MIT License. Built for the Solana Mobile CLOCK IN Hackathon 2026.
