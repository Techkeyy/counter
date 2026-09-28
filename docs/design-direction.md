# Design Direction & UI Specifications

**Project:** Counter  
**Design Standard:** Applied `design-skill` (Consumer Social, Clean Type, No Purple-Gradient Clutter)  

---

## 1. Emotional Hierarchy

The visual hierarchy places the **People and Stakes** first:

```
PERSON → TAKE → CONFLICT → SIDE → STAKE → RESULT → RECEIPT
```

- Primary CTAs use active, human language:
  - `Challenge this take`
  - `Back Praise ($25)`
  - `Back Daniel ($25)`
  - `Accept Terms`
  - `Counter Offer`
  - `Claim Payout ($116.66)`
  - `Rematch`

---

## 2. Design Tokens & Visual System

- **Theme:** Dark Consumer Social (Deep Obsidian `#0A0D14`, Card Surface `#141923`, Border `#232B3B`).
- **Accent & Brand:** Electric Cyan `#00F2FE` / Vibrant Amber `#FF9900` (for Duels) / Emerald Green `#10B981` (for Resolved Receipts).
- **Typography:**
  - Display / Headings: `Inter` or `Plus Jakarta Sans` (Bold, 20px - 28px).
  - Body Copy: 15px - 16px (visible contrast `#E2E8F0`, no washed-out gray).
  - Monospace: Reserved strictly for transaction signatures and token amounts (e.g. `cUSD`).
- **Prohibited Patterns:**
  - NO em dashes or en dashes in UI text (enforced by `design-skill`).
  - NO generic purple web3 gradient backgrounds.
  - NO financial terminal candlestick charts or order-book depth meters on feed cards.

---

## 3. The 3 Core Feed Cards

1. **Take Card:**
   - Author avatar, handle, verified badge.
   - Core claim text.
   - Engagement bar (Likes, Comments, `⚔️ Challenge` CTA).
2. **Live Duel Card:**
   - Visual Split: **Captain A vs Captain B** (with avatar head-to-head).
   - Backing progress bar (e.g., `$75 Backing Praise` vs `$100 Backing Daniel`).
   - Cutoff timer countdown.
   - Dual CTAs: `Back Praise` / `Back Daniel`.
3. **Receipt Card:**
   - Headline: `[WINNER] CALLED IT.`
   - Outcome badge (`VERIFIED`).
   - Agreed terms snippet and resolution proof link.
   - Total pool settled and user's personal return.
