# Product Definition: Counter

**Tagline:** Talk is cheap. Back your take.  
**Core Outcome:**
> Counter is only genuinely working when a fresh Android user can publish a take, a second real user can challenge that take from its social discussion and both commit stake under mutually approved immutable terms, an unrelated third user can enter through the shared Duel link and stake behind either person, the agreed authoritative resolver can resolve the supported real-world outcome, the winning participants can receive the mathematically correct payout while losing/unauthorized participants cannot, and the original social post becomes a truthful resolved Receipt that updates both users' public record and rivalry history — all through the normal product interface without developer intervention.

---

## 1. Emotional & Mental Model

Counter transforms informal internet arguments into accountable, immutable social Duels.

```
TAKE → COMMENT/CALLOUT → CHALLENGE → AGREED TERMS → LIVE DUEL → OUTSIDE BACKERS → RESOLUTION → PAYOUT → RECEIPT → RIVALRY HISTORY
```

### Personality & Tone
- Confident, punchy, social, accountable.
- The UI centers on **People and Conflicts**, not abstract financial tickers.
- Cards feature **PRAISE vs DANIEL**, not `YES 54% / NO 46%`.

---

## 2. Core Entities

1. **Take (Social Post):**
   - Author, statement, timestamp, initial commentary, challenge CTA.
2. **Challenge / Counter-Proposal:**
   - Challenger proposes opposing side, captain stake amount, cutoff deadline, resolution source.
   - Author can **ACCEPT**, **COUNTER**, or **DECLINE**.
   - A counter-proposal updates terms and requires reciprocal approval before locking.
3. **Live Duel (⚔️):**
   - Created only after mutual term approval and on-chain stake escrow confirmation.
   - Captain A vs Captain B, current backing pools, cutoff countdown, source proof link.
   - Outside backers can stake behind either Captain.
4. **Receipt (🧾):**
   - The permanent, immutable post-resolution state of the Take.
   - Headline: e.g. `DANIEL CALLED IT.`
   - Shows outcome, authoritative source proof, total pool, user payout, updated rivalry record.
5. **Rivalry & Profile:**
   - Head-to-head scorecards between specific users (e.g. `Praise vs Daniel: 8–11`).
   - Win/Loss stats derived strictly from resolved on-chain Receipts, never client counters.

---

## 3. Explicit Non-Goals

- ❌ NO order books or continuous double auctions.
- ❌ NO cents-on-the-dollar derivative pricing or trading terminals.
- ❌ NO anonymous generic prediction markets.
- ❌ NO custom speculative meme tokens or NFT gating.
- ❌ NO unverified admin drain/rescue paths in smart contracts.
