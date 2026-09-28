# HACKATHON REQUIREMENTS & COMPLIANCE MATRIX

**Hackathon:** Solana Mobile CLOCK IN Hackathon  
**Deadline:** October 8, 2026 — exact cutoff time not independently evidenced  
**Submission Portal:** Official CLOCK IN Submission Page  

---

## 1. Compliance Checklist

| Item | Requirement | Status | Verification Reference |
|---|---|---|---|
| **Android APK** | Functional Android APK | **In Progress** | React Native Expo codebase structured in `app/` (`package: app.counter.mobile`). Tooling configured. |
| **GitHub Repo** | Public source code repository | **Compliant** | Version controlled git repository at `C:\Users\HomePC\Desktop\Counter`. |
| **Demo Video** | Video showcasing app in use | **Planned** | Script & storyboard mapped in `docs/build-plan.md`. |
| **Pitch Deck** | Product presentation | **Planned** | Outlined in `docs/competitive-edge.md` and `docs/product-definition.md`. |
| **MWA Support** | Solana Mobile Wallet Adapter integration | **Compliant** | Protocol v2 client integration in `app/App.tsx` and proven devnet transaction `2q2yzFAr4Zn5riBf9KzUqcUrPohfUNHR7D7xdRkX7SmgAqfe17VT8Maq8cs49zdym9St5oBWwxWdghZqjgDHhvzf`. |
| **SKR Integration** | SKR Token / Staking utility | **Compliant** | Official on-chain staking verification implemented in `probes/skr-official-stake-query.js` (`StakeConfig` -> `GuardianPool` -> `UserStake`). |
