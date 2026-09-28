# Hackathon Requirements & Compliance Matrix

**Hackathon:** CLOCK IN (Solana Mobile & RadiantsDAO)  
**Submission Deadline:** October 8, 2026, 23:59 UTC  

---

## 1. Compliance vs Product Completeness

| Requirement | Category | Hackathon Status | Counter Implementation Evidence |
|---|---|---|---|
| **Functional Android APK** | Mandatory Deliverable | HARD REQUIREMENT | React Native Android application buildable into signed Release APK (`counter.apk`). |
| **Public GitHub Source Code** | Mandatory Deliverable | HARD REQUIREMENT | Clean git repository with zero leaked secrets, complete commit history, reproducible build commands. |
| **Demo Video** | Mandatory Deliverable | HARD REQUIREMENT | 2.5–3 minute video walking: Take -> Challenge -> Terms -> Staking via MWA -> External Resolution -> Payout -> Receipt -> Rivalry. |
| **Pitch Deck / Presentation** | Mandatory Deliverable | HARD REQUIREMENT | Structured slide deck highlighting the problem, consumer UX wedge, technical trust architecture, SKR Arena, and unit economics. |
| **Mobile-First / SMS Focus** | Core Rubric | HARD REQUIREMENT | Native mobile touch UX (Android narrow viewport first), Mobile Wallet Adapter integration, Seed Vault compatibility. |
| **No Wrappers / Meaningful Native App** | Eligibility Rule | HARD REQUIREMENT | Built with React Native native bridging and deep link intents (`counter://` & HTTPS App Links), not a website iframe. |
| **SKR Token Integration Prize ($10k)** | Track / Bonus | LOAD-BEARING INTEGRATION | Arena Access curation: Staked SKR unlocks public feed discovery for high-stakes/public Duels. Authoritatively verified on mainnet. |
| **dApp Store Publishability** | Prize Claim Gate | HARD REQUIREMENT | Complies with Solana Mobile Publisher Policy: Report/Block UGC flows, 18+ gate, terms acknowledgement, signed APK. |

---

## 2. Judging Rubric Alignment

1. **Stickiness / Product-Market Fit (PMF):**
   - Natural social conversation-to-stakes funnel.
   - Head-to-head named Captain rivalry (e.g. `Praise vs Daniel: 8–11`) and durable resolved Receipts.
2. **User Experience (UX):**
   - Consumer social aesthetics (human buttons: `Back Praise`, `Back Daniel`, `Challenge`).
   - Zero DeFi jargon or order-book clutter on primary screens.
   - Deep-linking directly to specific Duel from group chat links.
3. **Technical Innovation & Trust Architecture:**
   - On-chain escrow custody on Solana.
   - Strict separation of social metadata (off-chain SQLite/backend) and financial truth (on-chain PDA).
   - Resolver-mediated settlement with verifiable external evidence preserved.
4. **Presentation & Documentation:**
   - 5-minute trust test passed via comprehensive README and Claim-Mechanism-Proof ledger.
