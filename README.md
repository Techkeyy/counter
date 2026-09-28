# Counter

**Mobile social network where people put something behind their takes.**

[Architecture](docs/architecture.md) · [Claim & Proof Ledger](docs/claim-mechanism-proof.md) · [Resolution Model](docs/resolution-model.md) · [Official Research](docs/official-research.md)

---

> *"You said Arsenal is winning tomorrow. I say no chance. Put your money where your mouth is."*

People make confident claims online every day across sports, crypto, politics, and culture. Arguments flare up in comments and group chats, but terms remain vague, nobody remembers who was right, informal bets are abandoned, and there is no permanent head-to-head record.

**Counter** turns casual social arguments into structured, shareable, on-chain Duels between named Captains, with external backers and truthful permanent Receipts.

---

## Why This Exists

Existing prediction platforms are built as sterile financial trading terminals: order books, probability percentage charts, and anonymous YES/NO shares. They capture market speculation, but completely miss the social thrill of personal rivalry.

```
       TRADITIONAL PREDICTION MARKET               COUNTER SOCIAL DUEL
  [ Anonymous Order Book: YES 54¢ ]          [ ⚔️ PRAISE vs DANIEL: 8-11 Rivalry ]
                 │                                            │
        Financial Trader                             Social Friends & Backers
                 │                                            │
        Anonymous Settlement                        🧾 Permanent Resolved Receipt
```

Counter connects social conversation directly to on-chain escrow custody without financial jargon.

---

## What It Does

1. **Publishes** casual social takes in an Android-first feed.
2. **Challenges** takes directly from the comments with structured terms (stakes, cutoff, authoritative resolution source).
3. **Locks** terms upon mutual captain approval and on-chain escrow deposit via Mobile Wallet Adapter (MWA).
4. **Enables** outside backers to rally behind either person via shareable deep links (`counter://duel/:id`).
5. **Resolves** real-world outcomes authoritatively using verified external data feeds (sports scores, weather data, spot prices).
6. **Disburses** exact integer proportional payouts to winning participants while blocking losers and duplicate claims.
7. **Transforms** the original post into an immutable **Receipt** that permanently updates both users' head-to-head rivalry history.

---

## Technical Architecture

| Module | Job |
|---|---|
| `counter_program` (Anchor/Solana) | Custodies stake tokens in Vault PDA, enforces cutoff timestamps, and executes proportional winner payouts. |
| `Duel & Position PDAs` | Scalable individual participant state isolation preventing unbounded account bloat. |
| `MWA Client Bridge` | React Native native intent bridge to Solana Mobile wallets (Phantom, Solflare, Seed Vault). |
| `Resolver Daemon` | Polls external verified APIs (CoinGecko, Open-Meteo, TheSportsDB) and signs on-chain settlement outcomes. |
| `SKR Arena Verifier` | Authoritatively checks Solana Mainnet staked SKR balance (>= 100 SKR) to grant public feed discovery. |
| `Social Backend` | Manages wallet-authenticated profiles (SIWS), comments, challenge negotiation, and UGC compliance. |

---

## Quickstart & Verification Probes

Clone the repository and run the Phase 0 Gate A technical verification probes:

```bash
# 1. Install dependencies
npm install

# 2. Run Resolution Sources Probe (Crypto, Weather, Sports)
node probes/resolution-probe.js

# 3. Run Mainnet SKR Staking & Mint Verification Probe
node probes/skr-probe.js

# 4. Run Escrow Custody & Payout Arithmetic Math Probe
node probes/escrow-probe.js

# 5. Run Deep-Link & Intent Resolution Probe
node probes/deeplink-probe.js
```

---

## How We Tried to Break It (Adversarial Robustness)

| Adversarial Scenario | Expected Result | Enforced Boundary |
|---|---|---|
| Stake attempt 1 second after cutoff | REJECTED (`StakingClosed`) | On-Chain Program Clock Check |
| Loser attempts to call `claim_payout` | REJECTED (`InvalidPositionSide`) | On-Chain Position Validation |
| Winner calls `claim_payout` a second time | REJECTED (`AlreadyClaimed`) | Atomic State Flag Mutation |
| Attacker tries to alter agreed resolution terms | REJECTED (SHA-256 mismatch) | Program Terms Hash Verification |
| Client fakes SKR staking balance for Arena access | REJECTED (Unauthorized) | Server-Side Mainnet RPC Proof |
| Sub-atomic token division dust | DETERMINISTICALLY RETAINED | Integer Math ($T - \sum P_i \le \text{Dust}$) |

---

## License

MIT
