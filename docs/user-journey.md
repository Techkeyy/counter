# User Journey & State Transitions

**Project:** Counter  

---

## 1. Step-by-Step User Journey

### Step 1: Publishing a Take
- **User Action:** User A (Praise) writes: *"Arsenal will beat Manchester City tomorrow."*
- **System Action:** Stores post in social backend; renders public Take card in the feed.

### Step 2: The Callout & Challenge
- **User Action:** User B (Daniel) comments: *"No chance, City dominates."* and taps **Challenge this take**.
- **System Action:** Opens structured Challenge sheet with suggested terms:
  - Proposition: *"Arsenal to win against Manchester City in Premier League match on [Date]"*
  - Challenger Stake: `25 cUSD`
  - Author Required Stake: `25 cUSD`
  - Cutoff: Match kickoff timestamp
  - Source: `TheSportsDB Official API`

### Step 3: Terms Agreement & Counter-Proposal
- **User Action:** Praise reviews challenge. Praise taps **Counter** to raise stake to `50 cUSD`. Daniel reviews and taps **Accept**.
- **System Action:** Both users sign devnet escrow transaction via MWA.

### Step 4: Live Duel & Outside Backing
- **User Action:** 
  - Duel link is shared to a WhatsApp group: `https://counter.app/duel/arsenal-city-01`.
  - User C (Friend) opens link on Android, taps **Back Praise**, stakes `20 cUSD` via MWA.
- **System Action:** Program escrows `20 cUSD` into Vault PDA; updates `Side A Pool` to `70 cUSD` and creates `Position PDA` for User C.

### Step 5: Resolution & Settlement
- **User Action:** Match concludes.
- **System Action:** Resolver daemon queries sports API -> Result: Arsenal 2 - 1 City.
- **System Action:** Resolver submits signed `resolve_duel(winning_side = Side A)` transaction to Solana program. State moves to `RESOLVED / CLAIMABLE`.

### Step 6: Payout & Receipt
- **User Action:** Praise and User C tap **Claim Payout** in app.
- **System Action:** Program verifies Position PDA, transfers proportional winning share directly to user wallet, marks position `claimed`.
- **System Action:** Social post visually flips into a permanent **Receipt** (`PRAISE CALLED IT`), incrementing Praise's head-to-head score against Daniel.

---

## 2. Duel Authoritative State Machine

```
[DRAFT]
   │
   ▼
[CHALLENGE_PROPOSED] ◄────► [COUNTER_PROPOSED]
   │                              │
   ├───────────► [DECLINED]       │
   │                              ▼
   └───────────► [MUTUALLY_APPROVED]
                        │
                        ▼ (Both Captain Escrows Confirmed On-Chain)
                 [LIVE_ACCEPTING_STAKES]
                        │
                        ▼ (Cutoff Timestamp Reached)
                 [BACKING_CLOSED]
                        │
                        ▼ (Resolution Event Triggered)
                 [SETTLEMENT_PENDING]
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
   [RESOLVED]                      [VOIDED / CANCELLED]
        │                               │
        ▼                               ▼
   [CLAIMABLE_PAYOUT]              [CLAIMABLE_REFUND]
        │                               │
        ▼ (All Claims Settled)          ▼ (All Refunds Settled)
   [FULLY_SETTLED_RECEIPT]         [FULLY_REFUNDED]
```
