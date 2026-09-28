# Security Boundaries & Attack Surface Analysis

**Project:** Counter  

---

## 1. Core Threat Matrix & Mitigations

| Threat | Attack Vector | Security Boundary | Mitigation |
|---|---|---|---|
| **Escrow Drain** | Attacker calls unauthorized withdraw instruction on Vault PDA. | On-Chain Program | Vault PDA is owned by program; funds are only released via `claim_payout` where `position.duel == duel` and `duel.status == Resolved(side)`. |
| **Double Claim** | Winner attempts to claim payout multiple times. | On-Chain Program | `Position.claimed` boolean is checked and set to `true` atomically in the claim transaction. |
| **Late Staking** | Backer stakes after outcome is known. | On-Chain Program | Program checks `Clock::get()?.unix_timestamp < duel.cutoff_ts` before accepting deposits. |
| **Terms Tampering** | Backend modifies resolution condition after bets placed. | Dual (PDA Terms Hash) | Program verifies SHA-256 hash of agreed terms at Duel creation; resolver must pass matching terms hash. |
| **Wallet Spoofing** | Attacker claims to be User A to social backend. | SIWS (Sign-In with Solana) | Server issues single-use bounded nonce; wallet must sign nonce; nonce is consumed upon authentication. |
| **Fake Arena Access** | Client bypasses SKR check via modified frontend. | Backend Staking Verifier | Server queries mainnet staking program accounts directly; Arena tag is only granted if verified staked balance >= threshold. |
| **AI Decision Risk** | LLM hallucinates an outcome and resolves market. | Strict Architecture Rule | AI is strictly restricted to drafting/normalizing casual prose into human-reviewed terms. AI has zero signing or resolution authority. |

---

## 2. Secrets Management & Operational Security

1. **No Private Keys in Client:** Mobile APK never stores or accesses resolver or server private keys.
2. **Disposable Devnet Authority:** Devnet deployer and resolver keypairs are isolated from any real-value mainnet funds.
3. **Strict `.gitignore` Enforcement:** All `.env`, `*.json` keypairs, and build caches are ignored before repository commits.
