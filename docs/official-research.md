# OFFICIAL RESEARCH & TECHNICAL AUDIT

**Project:** Counter  
**Target:** Solana Mobile CLOCK IN Hackathon  
**Last Updated:** 2026-09-28  

---

## 1. Solana Mobile Developer & MWA Ecosystem

- **MWA Protocol:** Solana Mobile Wallet Adapter v2.0 (`@solana-mobile/mobile-wallet-adapter-protocol` and `@solana-mobile/mobile-wallet-adapter-protocol-web3js`).
- **Standard Transaction Signing Flow:**
  1. `transact()` invokes Android Intent to open installed MWA-compatible wallet.
  2. `wallet.authorize()` returns user public key and authorization token.
  3. `wallet.signAndSendTransactions()` signs and dispatches the transaction payload.
  4. Client polls/confirms signature on Solana RPC.
- **Deep Linking Protocol:**
  - Custom URI Scheme: `counter://duel/:id`
  - Android App Links: `https://counter.app/d/:id` with `/.well-known/assetlinks.json` verification.

---

## 2. Official SKR Staking Architecture & IDL Verification

- **Program ID:** `SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ`
- **Mainnet Mint:** `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`
- **StakeConfig PDA:** `4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw` (Seeds: `[b"stake_config"]`)
- **GuardianPools:** Nodes verifying Seeker devices and reviewing dApps. Discovered on-chain GuardianPool: `DPJ58trLsF9yPrBa2pk6UaRkvqW8hWUYjawe788WBuqr`.
- **UserStake PDA Derivation:**
  ```typescript
  const [userStakePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('user_stake'),
      stakeConfigPubkey.toBuffer(),
      userWalletPubkey.toBuffer(),
      guardianPoolPubkey.toBuffer(),
    ],
    SKR_PROGRAM_ID
  );
  ```
- **Aggregation & Qualification:** Active stake is aggregated across all registered GuardianPools. Technical qualification rule for Gate A: `active staked SKR > 0`.

---

## 3. Solana Program Architecture & Devnet Behavior

- **Deployment Model:** Agave 3.1.13 / Anchor 0.30.1 native SBF Rust program deployed via `BPFLoaderUpgradeab1e11111111111111111111111`.
- **PDA Escrow Security:** Escrow vault accounts are owned by the native SPL Token Program with authority assigned to `vault_pda` (`[b"vault", duel_pda]`). Program CPI uses `invoke_signed` with PDA seeds to release payouts to verified winners.

---

## 4. Hackathon Rules & Submission Portal

- **Deadline:** October 8, 2026 — exact cutoff time not independently evidenced.
- **Required Deliverables:**
  1. Functional Android APK.
  2. GitHub public source repository.
  3. Demo video.
  4. Pitch deck / short presentation.
- **Judging Criteria:** Stickiness/PMF, UX, Innovation, Demo/Presentation.
