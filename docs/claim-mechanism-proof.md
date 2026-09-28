# Claim → Mechanism → Proof Ledger

**Project:** Counter  
**Status:** Gate A Baseline  

---

| # | Claim | Mechanism | Authoritative Boundary | Required Proof | Current Proof | Enforcement Class | Status |
|---|---|---|---|---|---|---|---|
| **1** | Users stake their own tokens. | Direct SPL Token transfer via MWA from user ATA to Vault PDA. | On-Chain Program | Confirmed devnet transaction with user signature. | Verified in `probes/escrow-probe.js` (`3xPFprsq...`) | HARD ENFORCED | PROVEN |
| **2** | Counter cannot arbitrarily withdraw user escrow. | Vault PDA seeds constrained to program; no admin drain function. | On-Chain Program | Smart contract code audit + rejection of unauthorized signer. | Program architecture verified in `docs/architecture.md` | HARD ENFORCED | SUPPORTED |
| **3** | Accepted Duel terms cannot be edited. | SHA-256 terms hash stored immutably in Duel PDA. | On-Chain Program | Contract rejects resolution if hash mismatch occurs. | State model defined in `docs/architecture.md` | HARD ENFORCED | SUPPORTED |
| **4** | Stakes cannot enter after cutoff. | Program checks `Clock::get() < duel.cutoff_ts`. | On-Chain Program | Transaction fails if clock >= cutoff. | On-chain check in instruction handler | HARD ENFORCED | SUPPORTED |
| **5** | Only configured resolver may resolve. | Duel PDA stores `authority` pubkey; checked during `resolve_duel`. | On-Chain Program | Tx fails with `Unauthorized` if signed by non-resolver. | On-chain authorization check | HARD ENFORCED | SUPPORTED |
| **6** | Resolution cannot occur prematurely. | Program checks `Clock::get() >= duel.resolution_ts`. | On-Chain Program | Tx fails if called before resolution timestamp. | On-chain check in instruction handler | HARD ENFORCED | SUPPORTED |
| **7** | One user's position cannot be claimed by another. | Position PDA derives seeds from `[b"position", duel, user_pubkey]`. | On-Chain Program | Tx signer must match Position PDA user pubkey. | Account derivation constraint | HARD ENFORCED | SUPPORTED |
| **8** | A loser cannot claim winner payout. | Program verifies `position.side == duel.winning_side`. | On-Chain Program | Tx fails with `InvalidPositionSide` for losing position. | Verified in `probes/escrow-probe.js` | HARD ENFORCED | PROVEN |
| **9** | A winner receives mathematically correct payout. | Exact integer proportional formula: $s_i + \lfloor (s_i \times L) / W \rfloor$. | On-Chain Program | Unit test matching exact base units down to 1 dust unit. | Verified in `probes/escrow-probe.js` | HARD ENFORCED | PROVEN |
| **10** | A payout cannot be claimed twice. | Program checks `!position.claimed` and sets `position.claimed = true`. | On-Chain Program | Second claim transaction fails with `AlreadyClaimed`. | Atomic state update | HARD ENFORCED | SUPPORTED |
| **11** | Cancellation/refund cannot be claimed twice. | Same `claimed` flag guards refund disbursements. | On-Chain Program | Second refund call fails. | Atomic state update | HARD ENFORCED | SUPPORTED |
| **12** | Social DB state cannot fake financial settlement. | Client queries on-chain Duel and Position PDAs directly for claimable balances. | Client / RPC | Mocking DB does not enable on-chain withdrawal. | Separation of DB and RPC | HARD ENFORCED | SUPPORTED |
| **13** | Shared links resolve to exact Duel. | Android App Links & Custom Scheme (`counter://duel/<id>`) parse path into Duel context. | Mobile OS / Router | Deep link test script parses valid duel IDs. | Verified in `probes/deeplink-probe.js` | HARD ENFORCED | PROVEN |
| **14** | Identity cannot be impersonated. | SIWS nonce issuance and signature verification. | Backend Auth | Signature verification rejects forged pubkeys. | Nonce-signed proof architecture | HARD ENFORCED | SUPPORTED |
| **15** | Arena visibility requires qualifying SKR state. | Backend queries Mainnet Staking Program for >= 100 staked SKR. | Dual (Mainnet RPC + Backend) | Mainnet query verifies account data. | Verified in `probes/skr-probe.js` | HARD ENFORCED | PROVEN |
| **16** | AI cannot silently determine financial outcomes. | AI only drafts structured terms proposals; humans approve; external APIs resolve. | Architectural Separation | Resolver reads API directly; zero AI inference in settlement pipeline. | Verified in `probes/resolution-probe.js` | HARD ENFORCED | PROVEN |
| **17** | External resolution evidence is preserved. | Raw API response payload, source URL, and timestamp recorded in DB and receipt. | Backend / Receipt | Receipt displays clickable source proof. | Verified in `probes/resolution-probe.js` | SOFT ENFORCED | PROVEN |
| **18** | Profile/rivalry records reflect resolved outcomes. | Scorecard derived via aggregation of on-chain resolved Receipts. | Backend DB / Client | Head-to-head counters match count of resolved Duels. | Data pipeline design | HARD ENFORCED | SUPPORTED |
