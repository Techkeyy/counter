# Resolution & Source Verification Model

**Project:** Counter  

---

## 1. Truthful Resolution Architecture

Counter settlements are **operator/resolver-mediated settlements using agreed authoritative sources**, NOT trustless oracle settlements.

Every accepted Duel requires explicit approval of:
1. Exact proposition statement
2. Proposition cutoff time (UTC)
3. Target resolution timestamp (UTC)
4. Authoritative data source identifier
5. Deterministic boolean outcome condition
6. Tie / void fallback semantics

---

## 2. Supported Categories & Probed Data Sources

### Category A: Crypto Prices
- **Probed & Verified Source:** CoinGecko Simple Price API (`https://api.coingecko.com/api/v3/simple/price`) / Pyth Hermes.
- **Sample Proposition:** *"Will SOL/USD be >= $120.00 at 2026-09-28T12:00:00Z?"*
- **Outcome Logic:** `price >= 120.0 ? Outcome::SideA : Outcome::SideB`
- **Rate Limit & Cost:** Public free tier (30 calls/min), zero API key requirement.

### Category B: Weather Outcomes
- **Probed & Verified Source:** Open-Meteo Public API (`https://api.open-meteo.com/v1/forecast`).
- **Sample Proposition:** *"Will precipitation in London exceed 0.0mm on 2026-09-28?"*
- **Outcome Logic:** `precipitation > 0.0 ? Outcome::SideA : Outcome::SideB`
- **Rate Limit & Cost:** 10,000 calls/day free, zero API key requirement.

### Category C: Sports Results
- **Probed & Verified Source:** TheSportsDB API (`https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=...`).
- **Sample Proposition:** *"Will Arsenal win against Liverpool on 2026-09-15?"*
- **Outcome Logic:** `arsenalScore > opponentScore ? Outcome::SideA : Outcome::SideB`
- **Rate Limit & Cost:** Public free tier, structured JSON response.

---

## 3. Failure & Timeout Semantics

If an authoritative endpoint returns an error, times out, or reports an incomplete/postponed match:
- The Duel state moves to `SETTLEMENT_PENDING`.
- Resolver retries exponentially every 15 minutes up to 24 hours.
- If unresolvable after 24 hours from scheduled resolution time, the Duel transitions to `CANCELLED / REFUNDABLE` enabling all participants to withdraw their principal stake.
