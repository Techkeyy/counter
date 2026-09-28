# User Acceptance Testing (UAT) Plan

**Project:** Counter  

---

## 1. Test Scenarios Matrix

| Test ID | Scenario Name | Actors Involved | Expected Outcome | Verification Method |
|---|---|---|---|---|
| **UAT-01** | Take Creation | User A | Post appears in feed with active Challenge CTA. | Backend DB + Mobile Feed Query |
| **UAT-02** | Challenge & Counter-Offer | User A + User B | User B proposes challenge; User A counters; User B accepts. Terms locked. | State transition to `MUTUALLY_APPROVED` |
| **UAT-03** | Dual Captain Staking (MWA) | User A + User B | Both captains sign transaction; `cUSD` deposited to Vault PDA; status becomes `LIVE`. | Devnet Tx confirmation + Vault balance check |
| **UAT-04** | Deep-Link Arrival & Outside Backing | User C (Backer) | Opens link `https://counter.app/duel/...`, backs User A for 20 cUSD. | Position PDA created + Side A total updated |
| **UAT-05** | Cutoff Enforcement | User D | Attempts to stake 1 second after cutoff timestamp. | Transaction rejected with `StakingClosed` error |
| **UAT-06** | Authoritative Resolution | Resolver Daemon | Match concludes -> Resolver fetches API data -> Submits `resolve_duel` tx. | On-chain status becomes `RESOLVED (Side A)` |
| **UAT-07** | Winner Payout Claim | User A + User C | Both claim exact proportional winning tokens; balance increases in wallet. | Token transfer confirmed; `Position.claimed == true` |
| **UAT-08** | Loser Claim Rejection | User B | Attempts to claim payout on losing position. | Tx rejected with `InvalidPositionSide` |
| **UAT-09** | Double Claim Prevention | User A | Attempts to call `claim_payout` a second time. | Tx rejected with `AlreadyClaimed` |
| **UAT-10** | Receipt Transformation & Rivalry Update | User A + User B | Original post shows `USER A CALLED IT`; Profile rivalry scorecard updates to `1–0`. | Feed Card UI + Profile Aggregate View |
| **UAT-11** | SKR Arena Curation Gate | User with <100 SKR vs User with >=100 SKR | Non-staked wallet cannot publish to Arena; staked wallet can toggle Arena discovery. | Backend Staking Verification check |
| **UAT-12** | UGC Report & Block Flow | User A reporting User B | Post hidden immediately; report logged in database. | UI state + Database moderation log |
