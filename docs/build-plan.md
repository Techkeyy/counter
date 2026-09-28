# Build Plan & Phased Roadmap

**Project:** Counter  
**Execution Methodology:** `build-process` (De-risk risky core first, additive, tested)  

---

## Phase 0: Gate A (Technical Probes & De-Risking) — [CURRENT]
- [x] Machine toolchain inspection (Node, Rust, Cargo, Solana Agave CLI, Anchor CLI).
- [x] Official research documentation (CLOCK IN rules, dApp store policy, SKR mint & staking program).
- [x] Devnet test stake asset probe (Created `cUSD` mint: `AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC`).
- [x] Escrow custody & exact integer payout arithmetic probe (`probes/escrow-probe.js`).
- [x] Multi-source resolution probe for Crypto, Weather, and Sports (`probes/resolution-probe.js`).
- [x] SKR mainnet staking query probe (`probes/skr-probe.js`).
- [x] Deep link architecture probe (`probes/deeplink-probe.js`).
- [x] Safety ledger and architectural specifications written.

---

## Phase 1: On-Chain Solana Escrow Program
- [ ] Initialize Anchor program `counter_program`.
- [ ] Implement instructions:
  - `initialize_duel`: Creates Duel PDA, stores terms hash, cutoff, resolution ts.
  - `deposit_stake`: Transfers cUSD into Vault PDA, creates or increments Position PDA.
  - `resolve_duel`: Resolver signs outcome, locks status.
  - `claim_payout`: Validates winner, transfers exact share, marks position claimed.
  - `claim_refund`: Validates void/cancellation, refunds principal.
- [ ] Write integration test suite covering all adversarial failure modes.

---

## Phase 2: Social Backend & Resolver Daemon
- [ ] Express / SQLite backend service with SIWS nonce authentication.
- [ ] CRUD endpoints for Takes, Comments, Challenges, and Counter-offers.
- [ ] Automated background resolver daemon polling external APIs for live outcomes.
- [ ] Mainnet SKR staking verifier service to authorize public Arena posts.

---

## Phase 3: Mobile React Native Android Client & MWA
- [ ] React Native mobile client targeting Android SDK 34+.
- [ ] MWA wallet connection, transaction signing, and seed vault compatibility.
- [ ] Feed, Duel creation/challenge modal, and live Receipt views.
- [ ] Deep link intent handler (`/duel/:id`).
- [ ] UGC reporting and 18+ gate compliance dialogs.

---

## Phase 4: End-to-End Integration & Comprehensive UAT
- [ ] Execute full 6-step loop across multiple real wallet accounts.
- [ ] Verify zero UI drift, exact balances, and permanent Receipt updates.
- [ ] Generate signed Release APK for Solana dApp Store submission.
- [ ] Record demo video and finalize pitch deck.
