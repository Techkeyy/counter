# CLAIM → MECHANISM → PROOF LEDGER

**Project:** Counter  
**Phase:** Phase 0 — Gate A Remediation  
**Status:** Updated with Official SKR Derivation and Preserved Deadline Status  

---

## 1. On-Chain Program-Controlled Escrow (Devnet)
- **Claim:** Counter utilizes a native Solana program to manage locked parimutuel duel stakes and execute exact integer payouts upon authoritative settlement without custodial intermediaries.
- **Mechanism:** Program-derived address (`vault_pda`) holds SPL tokens (`cUSD`). Deposits require user signature and position PDA creation. Resolution is strictly restricted to the assigned resolver authority. Claiming payout invokes `spl_token::instruction::transfer` signed with Vault PDA seeds. Loser claims and double claims are rejected on-chain.
- **Proof:**
  - **Program ID:** `52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT`
  - **Deploy / Upgrade Signature:** `HptkNbvtYTLFZo6TdpooJ9n66RtxtrhYGjhDysqdjTUcurAmxmdd1suR7syu9m7ySFnUnoQyaNb5AUdVDzYfUyC`
  - **Duel PDA:** `Hx6VAVVn81y1niLzF2xPpsgm81YqRasLkU6ZSu3C1Nqg`
  - **Vault PDA:** `8F7RhULAD3zySGXWrb3cQUWMkaa6hansvdW2PaATpFVG`
  - **Vault Token ATA:** `5hAuuW1itMGQfstQfjbbEsuaHZ2BkFBAdyZ2wCRvgTUf`
  - **Duel Init Tx:** `3931XF947Rf7riA8yi1w2MSGfYkSTtEtEpiwGzNgEBYz4UGUD3HGfDL7T1wREVaqRyixpk47uu4bZBaj2fs9dcHR`
  - **Deposit Cap A ($50):** `2y7Lya6UzqiBfYd3iWFqhwLvuGDKZXEsEiyn4R7Zmf2vRrXQpeSqXM7JAWbVvwD2aBScKwSHFP8MPvsbDWgYys45`
  - **Deposit Cap B ($50):** `3j6oJLgveTVCDmwjZy6XhNs1FterPvaJ4Zrq4133VKfai7w9QmAcNmbda418MTMqP2MhiJ6Q3ykt9PA6Uzcjvun4`
  - **Deposit Backer C ($25):** `cshfmvEVQWLzkcgqpZWuKFPdSmspDTNyfvMtNjw8pRsk9mnvPBMePouRzH4x8Xeghc9FnMrwY6Zg6wkASY3qba3`
  - **Resolve Tx (Side A Wins):** `Zf1usXEMN1df9nELy4iwJB7J2o26D4Sdvy4hQLRMvpmPM7Jf745TrhdPdKDT5rbJCsiSARgvHW7gxRaUbKvZwkU`
  - **Claim Payout Cap A:** `67bpSBL9LphvzpNVhVUvmRWB15QrmRcQYdxBZ9Fo74zhBuNisLE9McuUZHxcSxZwhqUYyaLi1aQXq7TQMJSymuLi`
  - **Claim Payout Backer C:** `HbrF1zWyBypGFniVczpLjZ4vNhNjRVFgKiA9gGLbMgVC7QQZBU1NVXmN3QQ4rLh8bEDwrMbmJqqYNnzAf5DKWJF`
  - **Loser Claim Rejection:** Error 107 `InvalidPositionSide` (Strictly Rejected)
  - **Double Claim Rejection:** Error 106 `AlreadyClaimed` (Strictly Rejected)
  - **Artifact:** `probes/escrow-proof-artifact.json`

---

## 2. Official SKR Staking Verification (Mainnet-Beta)
- **Claim:** Counter gates high-stakes Arenas and features based on active SKR staking on Solana Mobile.
- **Mechanism:** On-chain query to the official SKR Staking Program (`SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ`). Derives the official `UserStake` PDA using `[b"user_stake", StakeConfig, user_wallet, GuardianPool]`, reads raw staked shares, and aggregates across all registered GuardianPools. Technical qualification condition: `active staked SKR > 0`.
- **Proof:** Evaluated via [`probes/skr-official-stake-query.js`](file:///C:/Users/HomePC/Desktop/Counter/probes/skr-official-stake-query.js) against Solana Mainnet-Beta:
  - **StakeConfig PDA:** `4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw`
  - **Discovered GuardianPool:** `DPJ58trLsF9yPrBa2pk6UaRkvqW8hWUYjawe788WBuqr`
  - **Zero-Stake Test:** Wallet `3ZtkjCxPTKcEb9T4yWhCArGYbm1D7xqFdMmGXPpzjkv7` -> PDA `Cg7dgLPYVJ3Fa8VS1ynVnt3Q6662V4VeD4eUfvos7h75` -> `0.000000 SKR` (DENIED: `active staked SKR == 0`).
  - **Positive-Stake Test:** Wallet `ES6ZS6JVCgqBzTf3g9qcUrE8cJ7KProAPNbuUEGKzRQp` -> PDA `BWYZUSkaUUvbrqVsJDPqqHuhhAYrubXTyKVzAFJaP6Up` -> `791,399.494113 SKR` (QUALIFIED: `active staked SKR > 0`).
  - **Artifact:** `probes/skr-official-stake-evidence.json`

---

## 3. Mobile Wallet Adapter (MWA) Devnet Integration
- **Claim:** Counter provides seamless mobile wallet authorization and transaction signing via Solana Mobile Wallet Adapter.
- **Mechanism:** React Native `@solana-mobile/mobile-wallet-adapter-protocol` v2.0 client implementation.
- **Proof:**
  - **Confirmed User-Signed Devnet Signature:** `2q2yzFAr4Zn5riBf9KzUqcUrPohfUNHR7D7xdRkX7SmgAqfe17VT8Maq8cs49zdym9St5oBWwxWdghZqjgDHhvzf`
  - **Artifact:** `probes/mwa-proof.json`
  - **React Native App Screen:** `app/App.tsx` implementing Screen `Counter Gate A` with `Connect Wallet` and `Send Devnet Proof Transaction`.

---

## 4. Deterministic Resolution Verification
- **Claim:** Duel outcomes settle strictly based on verifiable, immutable external real-world criteria for Crypto, Sports, and Weather.
- **Mechanism:** Deterministic algorithmic matcher comparing agreed duel terms against historical oracle observations.
- **Proof:**
  - **Crypto:** `SOL/USD >= $125` on CoinGecko -> Observed `$118.74` -> Outcome: `SideB`
  - **Sports:** `Liverpool vs Tottenham` on TheSportsDB -> Observed `3-1` -> Outcome: `SideA`
  - **Weather:** `London Rain (Precip > 0mm)` on Open-Meteo -> Observed `0.0mm` -> Outcome: `SideB`
  - **Artifacts:** `probes/deterministic-evidence.json` & `probes/deterministic-resolution-probe.js`

---

## 5. Hackathon Deadline Verification
- **Claim:** Submission window and requirements are verified from official sources.
- **Mechanism:** Direct documentation and portal inspection.
- **Evidence:** October 8, 2026 — exact cutoff time not independently evidenced. Requirements: functional Android APK, GitHub repository, demo video, pitch presentation. Verified from Solana Mobile official announcement.
