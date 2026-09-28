# Technical Architecture & Trust Boundaries

**Project:** Counter  

---

## 1. System Components

```
┌────────────────────────────────────────────────────────────────────────┐
│                          COUNTER CLIENT (ANDROID)                      │
│  - React Native Android App (MWA Integration, Native Deep Linking)    │
│  - Feed / Duel / Receipt UI (Design-Skill Tokenized Layouts)           │
│  - UGC Reporting & 18+ Compliance Gates                                │
└──────────────────┬──────────────────────────────┬──────────────────────┘
                   │                              │
        Sign-In / Auth Nonce / Social Data        │ Direct MWA / Web3.js
                   │                              │ Transactions
                   ▼                              ▼
┌──────────────────────────────────────┐   ┌─────────────────────────────┐
│       COUNTER SOCIAL BACKEND         │   │       SOLANA DEVNET         │
│  - SQLite / Express API Service      │   │  - Counter Escrow Program   │
│  - SIWS (Sign-In with Solana) Nonce  │   │  - Duel PDA & Vault PDA     │
│  - Terms Normalization Service       │   │  - User Position PDAs       │
│  - Mainnet SKR Staking Verifier      │   │  - cUSD Test Token Mint     │
└──────────────────┬───────────────────┘   └──────────────▲──────────────┘
                   │                                      │
                   ▼                                      │
┌──────────────────────────────────────┐                  │
│       COUNTER RESOLVER DAEMON        │                  │
│  - Authoritative Source Fetchers     │                  │
│    (CoinGecko, Open-Meteo, SportsDB) │                  │
│  - Submits Signed Outcome to Program ├──────────────────┘
└──────────────────────────────────────┘
```

---

## 2. On-Chain vs Off-Chain Boundary

| Component / Data | Layer | Why |
|---|---|---|
| **Stake Custody & Payouts** | On-Chain (Solana Devnet) | Immutable financial truth. No admin can drain or alter escrowed funds. |
| **Duel & Position PDAs** | On-Chain (Solana Devnet) | Program-enforced stake amounts, cutoff timestamps, and single-claim flags. |
| **Social Posts & Comments** | Off-Chain (Backend DB) | Fast consumer experience, editable drafts, UGC moderation and report handling. |
| **Duel Terms Hash** | Dual (On-Chain + Off-Chain) | On-chain Duel account stores cryptographic hash of agreed terms to guarantee zero tampering. |
| **SKR Staking Verification** | Off-Chain / Dual | Server queries Solana Mainnet RPC for staked SKR balances to authorize Arena visibility. |
| **Resolution Evidence Metadata** | Off-Chain (Stored DB + On-Chain Tx Memo) | Preserves exact raw payload and timestamp for complete public verification. |

---

## 3. Account Data Model (Solana Program)

### 1. `Duel` PDA
- Seeds: `[b"duel", duel_id.as_bytes()]`
- Fields:
  - `authority`: `Pubkey` (Resolver / Admin)
  - `mint`: `Pubkey` (Configured stake token mint, e.g. cUSD)
  - `terms_hash`: `[u8; 32]` (SHA-256 of agreed proposition string)
  - `captain_a`: `Pubkey`
  - `captain_b`: `Pubkey`
  - `side_a_total`: `u64`
  - `side_b_total`: `u64`
  - `cutoff_ts`: `i64`
  - `resolution_ts`: `i64`
  - `status`: `u8` (0: Live, 1: Backing Closed, 2: Resolved Side A, 3: Resolved Side B, 4: Cancelled/Refundable)
  - `bump`: `u8`

### 2. `Position` PDA
- Seeds: `[b"position", duel_pda.key().as_ref(), user.key().as_ref()]`
- Fields:
  - `duel`: `Pubkey`
  - `user`: `Pubkey`
  - `side`: `u8` (1: Side A, 2: Side B)
  - `amount`: `u64` (Base units)
  - `claimed`: `bool`
  - `bump`: `u8`

### 3. `Vault` PDA
- Seeds: `[b"vault", duel_pda.key().as_ref()]`
- Program-controlled Token Account (ATA) holding escrowed funds.
