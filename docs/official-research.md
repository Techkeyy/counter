# Official Research & Fact Base

**Project:** Counter  
**Date:** September 28, 2026  
**Status:** Authoritative Verified Research  

---

## 1. Hackathon Details & Submission Portal

- **Event:** CLOCK IN Hackathon (presented by Solana Mobile in partnership with RadiantsDAO).
- **Official Portal & Announcement:** Solana Mobile Blog / Radiants Hackathon Portal (`https://solanamobile.com/blog/clock-in-hackathon`).
- **Submission Dates:** September 8, 2026 – October 8, 2026.
- **Deadline Timestamp:** October 8, 2026 at 23:59 UTC (Portal localized timer).
- **Prize Pool:** $135,000 total.
  - $125,000 USDC split across Top 10 teams (1st: $30k, 2nd: $25k, 3rd: $20k, 4th: $15k, 5th: $10k, 6th–10th: $5k each).
  - $10,000 SKR Integration Prize for most creative/meaningful integration of SKR token.
  - Bonus perks: dApp Store featured placement, co-marketing, Seeker devices, call with Anatoly Yakovenko.
- **Mandatory Deliverables:**
  1. Functional Android APK (debug builds prohibited for dApp store; release signed build required).
  2. Public GitHub source code repository.
  3. Demo video (2.5 – 3 minutes).
  4. Pitch deck / presentation.

---

## 2. Solana Mobile Stack (SMS) & Mobile Wallet Adapter (MWA)

- **MWA Protocol:** `@solana-mobile/mobile-wallet-adapter-protocol` and `@solana-mobile/mobile-wallet-adapter-protocol-web3js` (or `@wallet-ui/react-native-kit`).
- **Core Session Flow:**
  - `transact(async (wallet) => { ... })` establishes a secure WebSocket/intent session with installed mobile wallets (Phantom, Solflare, Seed Vault on Seeker).
  - `wallet.authorize({ cluster: 'solana:devnet', identity: { name: 'Counter', uri: 'https://counter.app', iconRelativePath: 'favicon.ico' } })`
  - `wallet.signAndSendTransactions({ transactions: [...] })` or `wallet.signTransactions(...)`
- **Signing & Re-reading Truth:**
  - Client signs transaction via MWA.
  - Transaction broadcast occurs through RPC with commitment `confirmed`.
  - Client re-fetches authoritative on-chain account state (PDA / Token Vault).

---

## 3. Solana Program & Escrow Recommendations

- **Architecture:** Anchor framework (`anchor-cli 0.30.1`) or native Agave BPF program.
- **Account Model:**
  - `Duel PDA`: Holds terms hash, captain_a, captain_b, cutoff_timestamp, resolution_timestamp, resolution_source, duel_status, side_a_total, side_b_total, winning_outcome.
  - `Position PDA [duel, participant]`: Holds user pubkey, side (A or B), stake_amount, claimed_status. Prevents unbounded vector reallocation inside Duel account.
  - `Token Vault PDA`: Program-controlled ATA holding escrowed SPL tokens.
- **Network Environment:** Solana Devnet for hackathon financial execution with explicitly labeled test token `Counter USD (cUSD)`.

---

## 4. SKR Token & Staking Program

- **Official Mainnet SKR Mint:** `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` (Verified on mainnet-beta, 82 bytes, owned by Token Program).
- **Official Mainnet SKR Staking Program:** `SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ` (Verified on mainnet-beta, executable BPFLoaderUpgradeable).
- **Official Staking Portal:** `stake.solanamobile.com`.
- **Arena Integration Model (Dual Network Boundary):**
  - Financial wager escrow operates on **Solana Devnet** (safe, compliant test token).
  - SKR Arena qualification read queries **Solana Mainnet-Beta** staking program accounts authoritatively via server-side RPC proof.
  - Users with >= 100 SKR staked on mainnet gain permission to promote Duels from private/link-only to the public community Arena.

---

## 5. Solana Mobile Publisher Policy & dApp Store Compliance

- **Official Policy URL:** `solanamobile.com/publisher-policy-web` and `docs.solanamobile.com`.
- **Key Findings:**
  - **UGC (User Generated Content):** Apps featuring social feeds, comments, and user posts must include reporting, blocking, and clear Acceptable Use Policies.
  - **Age Rating:** 18+ gate mandatory for wagering / financial speculation apps.
  - **Crypto-Friendly Architecture:** No 30% platform tax, permissionless smart contract interactions permitted.
  - **Release Requirements:** APK must be compiled in Release mode, aligned, and signed with a valid Keystore. Publisher wallet requires ~0.2 SOL for ArDrive/NFT metadata publishing.
