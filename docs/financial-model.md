# Financial & Payout Model

**Project:** Counter  

---

## 1. Pool Mechanics

Counter uses a two-sided parimutuel pool model without platform fees for the hackathon build.

Let:
- $A$ = Total confirmed stake in base units on Captain A's side
- $B$ = Total confirmed stake in base units on Captain B's side
- $T = A + B$ (Total vault balance in base units)

---

## 2. Payout Formula (Exact Integer Token Math)

When Side A wins:
For any individual participant $i$ on Side A with stake $s_i$:

$$\text{Share of Losing Pool } L_i = \left\lfloor \frac{s_i \times B}{A} \right\rfloor$$

$$\text{Gross Payout } P_i = s_i + L_i$$

Where $\lfloor \cdot \rfloor$ denotes standard integer division (truncation down to the atomic base unit).

### Example with cUSD (6 decimals)
- $A = 75.000000\text{ cUSD} = 75,000,000\text{ base units}$
- $B = 100.000000\text{ cUSD} = 100,000,000\text{ base units}$
- Total Pool $T = 175,000,000\text{ base units}$

If Captain A staked $50,000,000$ base units:
$$L_{\text{capA}} = \lfloor (50,000,000 \times 100,000,000) / 75,000,000 \rfloor = 66,666,666\text{ base units}$$
$$P_{\text{capA}} = 50,000,000 + 66,666,666 = 116,666,666\text{ base units } (116.666666\text{ cUSD})$$

If Backer A1 staked $25,000,000$ base units:
$$L_{\text{backerA1}} = \lfloor (25,000,000 \times 100,000,000) / 75,000,000 \rfloor = 33,333,333\text{ base units}$$
$$P_{\text{backerA1}} = 25,000,000 + 33,333,333 = 58,333,333\text{ base units } (58.333333\text{ cUSD})$$

---

## 3. Residual Dust Treatment

- **Total Distributed:** $116,666,666 + 58,333,333 = 174,999,999\text{ base units}$.
- **Residual Dust:** $175,000,000 - 174,999,999 = 1\text{ base unit } (0.000001\text{ cUSD})$.
- **Deterministic Treatment:** Any sub-unit rounding remainder remains non-withdrawable in the Duel Vault PDA or is claimable only by the protocol vault closing routine upon final account reclamation. Under no circumstances can a user withdraw more than the integer-calculated allocation, preventing vault insolvency.

---

## 4. Refund / Void Conditions

If an external source fails, is indefinitely delayed, or the match/event is canceled:
- State moves to `CANCELLED / REFUNDABLE`.
- Each participant on both Side A and Side B is entitled to a 100% refund of their exact deposited base units:
  $$P_i = s_i$$
- Position PDA is marked `claimed = true` to prevent double refunds.
