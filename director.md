# DIRECTOR HANDOFF STATE — COUNTER

> **CORE OUTCOME:**  
> **Counter is only genuinely working when a fresh Android user can publish a take, a second real user can challenge that take from its social discussion and both commit stake under mutually approved immutable terms, an unrelated third user can enter through the shared Duel link and stake behind either person, the agreed authoritative resolver can resolve the supported real-world outcome, the winning participants can receive the mathematically correct payout while losing/unauthorized participants cannot, and the original social post becomes a truthful resolved Receipt that updates both users' public record and rivalry history — all through the normal product interface without developer intervention.**

---

## 1. Project Overview & Status

- **Project Name:** Counter
- **Tagline:** Talk is cheap. Back your take.
- **Current Phase:** Phase 0 / Gate A Complete
- **Status Language:** `COMPONENT PROVEN / GATE A PASS`
- **Repository Location:** `C:\Users\HomePC\Desktop\Counter`
- **Branch:** `main` (initialized)

---

## 2. Local Desktop Skills Ledger

| Skill Name | Exact Located Path | Files Read | Key Instructions Extracted | Impact on Counter | When to Reapply |
|---|---|---|---|---|---|
| **hackathon-onboarding** | `C:\Users\HomePC\Desktop\skill\hackathon-onboarding` | `SKILL.md` | Audit before installing, understand ecosystem in plain language, verify tools with smoke tests, pin deadline with timezone. | Prevented blind installation; guided research of CLOCK IN rules, dApp Store policy, and environment smoke tests. | Applied in Phase 0; reapply on any toolchain addition. |
| **project-understanding** | `C:\Users\HomePC\Desktop\skill\project-understanding` | `SKILL.md` | Core outcome sentence, actors, data flow, technology necessity test, plain language trust model. | Formed the core outcome, eliminated speculative tokens/order books, established exact on-chain/off-chain boundaries. | Applied in Phase 0; maintain across all doc updates. |
| **project-edge** | `C:\Users\HomePC\Desktop\skill\project-edge` | `SKILL.md` | Read rubric as checklist, audit claims against reality, differentiate on substance, adversarial robustness table. | Formed `docs/claim-mechanism-proof.md` and competitive wedge (1v1 named Captains + durable Receipts). | Reapply before submission and UAT. |
| **build-process** | `C:\Users\HomePC\Desktop\skill\build-process` | `SKILL.md` | Build the risky core first, deterministic decision core, 4 flow states (loading, success, empty, error), 90-second test. | Guided Phase 0 technical probes (mint, escrow math, resolution sources, SKR verifier, deep links) before full build. | Active across Phase 1 – Phase 4. |
| **design-skill** | `C:\Users\HomePC\Desktop\skill\design-skill` | `SKILL.md` | Consumer social over DeFi dashboards, no long dashes in UI, human CTAs (`Back Praise`), 3-metric plain money. | Dictated dark consumer theme, dual captain vs cards, prohibited generic purple web3 gradients. | Active in Phase 3 (Mobile UI build). |
| **audit-skill** | `C:\Users\HomePC\Desktop\skill\audit-skill` | `SKILL.md` | Claims vs reality, mechanical hygiene, repo size check, verify counts and commands against running software. | Governed Phase 0 verification runs and zero hardcoded fake data. | Mandatory before Release / Phase 4 UAT. |
| **perfect-readme** | `C:\Users\HomePC\Desktop\skill\perfect-readme` | `SKILL.md` | Link bar, 3am emotional hook in blockquote, numbered pipeline, copy-paste quickstart, adversarial table. | Directly structured `README.md` to pass the 5-minute judge trust test. | Reapply on any feature change. |

---

## 3. Official Hackathon Facts & Authoritative Sources

- **Hackathon:** CLOCK IN (Solana Mobile & RadiantsDAO)
- **Official Source:** `https://solanamobile.com/blog/clock-in-hackathon`
- **Submission Dates:** September 8, 2026 – October 8, 2026 at 23:59 UTC.
- **Prizes:** $135,000 total ($125,000 USDC across top 10; $10,000 SKR Integration Prize).
- **Deliverables:** Functional Android APK, Public GitHub repo, Demo Video (2.5–3 min), Pitch deck.
- **Compliance Rules:** Mobile-first (SMS/Seeker/MWA), no web wrappers, dApp Store UGC/18+ compliance.

---

## 4. Environment & Toolchain Status

- **Operating System:** Windows 10/11
- **Node.js:** `v24.14.0` (Confirmed)
- **npm:** `11.9.0` (Confirmed)
- **pnpm:** `11.19.0` (Confirmed)
- **Rustc / Cargo:** `1.95.0` (Confirmed)
- **Solana Agave CLI:** `3.1.13` (Confirmed)
- **Anchor CLI:** `0.30.1` (Confirmed)
- **Git:** `2.53.0.windows.2` (Confirmed)
- **Devnet Deployer Keypair:** `C:\Users\HomePC\.config\solana\compart-devnet-upgrade.json` (Balance: 5.55 SOL)

---

## 5. Deployed Assets & Network Addresses

- **Financial Network:** Solana Devnet
- **Devnet Test Token Mint:** `AXMB7tf5yHqPuFRTzaMgNSGPZ8iKJtFkeYdpeN7jcHWC`
  - **Label:** `Counter USD (cUSD) — DEVNET TEST TOKEN — NO REAL VALUE`
  - **Decimals:** 6
  - **Payer ATA:** `5Mbr3vxpfrja1bLAp4Z1pJ8oU9nD4nWhVtKmUNT3MgsB`
  - **Mint Tx Signature:** `4nhyZAnc7fViUeRhTjfeATRmpUXQsHybseuJd68JYDUhs6dhLaEBuA4U3Pwt2iKK9bYjspJ5ioVJHSTNB1euk9kL`
- **Mainnet SKR Mint:** `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` (Verified on Mainnet-Beta)
- **Mainnet SKR Staking Program:** `SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ` (Verified on Mainnet-Beta)
- **SKR Arena Minimum Stake Threshold:** `100 SKR` (Staked on Mainnet)

---

## 6. Phase 0 Technical Probe Proofs Summary

1. **Resolution Sources Probe (`probes/resolution-probe.js`):**
   - **Crypto:** CoinGecko API (`PASS` -> SOL/USD = $118.74, BTC = $83,156)
   - **Weather:** Open-Meteo API (`PASS` -> London Temp = 14.1°C, Precip = 0.0mm)
   - **Sports:** TheSportsDB API (`PASS` -> Arsenal / Premier League live match feeds)
2. **SKR Staking Query Probe (`probes/skr-probe.js`):**
   - Mainnet SKR Mint (`82 bytes`, owned by Token Program) -> `PASS`
   - Mainnet SKR Staking Program (`BPFLoaderUpgradeable`) -> `PASS`
3. **Escrow Custody & Payout Arithmetic Probe (`probes/escrow-probe.js`):**
   - Exact proportional integer arithmetic confirmed down to 1 base unit dust.
   - Devnet Escrow Vault ATA created (`5tbTUDTA9u6HXXBvnwas3vmXGZRYQa3TGWejJbjxLvkc`) and funded (`50 cUSD`).
   - Escrow deposit Tx Signature: `3xPFprsqQbfA419jNddEfAvApFjzhJpaLRo7ZzqpWAUPiuCKjv2q39dAiWsiuzqXxH34YNSZn4h7aLAYVs4N1sQY`.
4. **Deep-Link Intent Probe (`probes/deeplink-probe.js`):**
   - Validated URL schemes (`counter://duel/:id` and `https://counter.app/duel/:id`) correctly extract target Duel IDs.

---

## 7. Known Blockers & Unresolved Assumptions

- **Android Native SDK on Windows Host:** Java/Android SDK binaries are not in global system PATH. While React Native CLI / Web view runs cleanly, APK generation requires linking Android SDK home or containerized build.
- **Mainnet vs Devnet Mixed Boundary:** SKR qualification lives on Mainnet while wagering escrow lives on Devnet. This is handled cleanly via server-side RPC reads, and clearly distinguished in UI.

---

## 8. Next Exact Action

Proceed to **Phase 1: Solana Program & Anchor Escrow Implementation** upon authorization by the Director.
