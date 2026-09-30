# Counter Production Data-Hygiene Audit (2026-09-30, read-only)

Source: live `/opt/counter/server/data/counter.sqlite` inspected via read-only
SELECTs. NOTHING was modified. Counts at audit time: users 53 / takes 13 /
comments 12 / challenges 12 / duels 13 / positions 34 / receipts 4 /
activity 75. No rows are deleted by this audit.

## Summary

All pre-UAT backend history falls into three labeled buckets (the
`record_origin` column was backfilled for exactly this purpose):
SEED (2 takes + 2 duels + 1 receipt + 2 named users + 1 challenge),
UAT (11 takes + 11 duels + 3 receipts + 11 challenges, Sep 28 product-path
testing), SYSTEM (1 persistence-verification take). The app consumes every row
honestly (real fields, real derived stats, unverified badges gated).

## SEED rows (repository seed script, Sep 28 12:32 UTC)

| Table | ID | Creator | Created | Synthetic reason | Referenced by | Delete order |
|---|---|---|---|---|---|---|
| users | `9rJErq…Trh4u` (Alice Sol / alicesol) | seed | 12:32:54 | scripted persona | takes, duels, challenges, positions | 7 (users last) |
| users | `DNhvSXZs…VH8gE` (Bob Bull / bobbull) | seed | 12:32:54 | scripted persona | duels, positions, receipts | 7 |
| takes | `take_test_001` | Alice | 12:32:54 | "SOL vs ETH" scripted topic | duels/challenges reference chain | 6 |
| duels | `duel_test_001` (RESOLVED_SIDE_B, UNINITIALIZED) | Alice/Bob | 12:32:54 | scripted fixture | positions, receipt_duel_test_001 | 5 |
| duels | `duel_test_002` (RESOLVED_SIDE_A, UNINITIALIZED) | Alice/Bob | 12:32:57 | scripted fixture | positions | 5 |
| challenges | `chal_test_001` (ACCEPTED) | Alice | 12:32:54 | scripted fixture | duel_test_001 | 4 |
| receipts | `receipt_duel_test_001` (`simulated_resolution_tx`) | system | 12:32:57 | non-chain marker | none (terminal) | 2 |

## UAT rows (product-path testing, Sep 28 20:26–21:13 UTC)

Eleven takes in two duplicated content groups ("Solana TPS & Active Fee
Payers" ×4, "Solana Devnet Settlement Speed" ×7), each with a same-minute duel
and ACCEPTED challenge from a distinct throwaway wallet. Eight duels remain
ACCEPTING_STAKES/UNINITIALIZED; three are marked resolved (one `RESOLVED`,
two `RESOLVED_SIDE_A`), all UNINITIALIZED on-chain.

| Table | IDs | Synthetic reason | Referenced by | Delete order |
|---|---|---|---|---|
| takes | `take_1790627*` / `take_1790629*` (11) | repeated identical content, throwaway authors | comments, duels | 6 |
| duels | `duel_1790627*` / `duel_1790629*` (11) | test ladder | positions, 3 receipts, challenges | 5 |
| challenges | `chal_1790627*` / `chal_1790629*` (11, all ACCEPTED) | test ladder | duels | 4 |
| receipts | `rcpt_duel_1790629*` (3) | all three cite the SAME `onchain_signature` (`8Yjz…`) | none | 2 |
| positions | 34 rows across test duels | test stakes | none (terminal-ish) | 3 |
| comments | 12 rows on test takes | test replies | none | 3 |
| users | ~49 `user_XXXX_XXXX` placeholder wallets | auto-created by auth/reads | everything above | 7 |
| activity | 75 rows (mixed test + probe traffic) | event log | none | 1 |

## SYSTEM rows

| Table | ID | Reason | Referenced by | Delete order |
|---|---|---|---|---|
| takes | `take_1790632763388_a0879046` ("Durable Persistence Verification persist_…") | restart-persistence probe artifact | none known | 6 |

## Notes for the cleanup decision

- The 3 receipts sharing one `onchain_signature` predate fail-closed
  settlement; the app renders the legacy one honestly (unverified state).
- Owner physical testing has begun adding REAL rows (users 52 → 53 during the
  device session); any cleanup must re-audit first and preserve non-test rows.
- Safe deletion order if authorized: 1 activity → 2 receipts → 3 positions +
  comments → 4 challenges → 5 duels → 6 takes → 7 orphan placeholder users
  (only wallets with zero remaining references; never named users).
- Recommended: keep SEED Alice/Bob + `duel_test_001` as permanent demo
  fixtures OR delete everything pre-UAT in one authorized pass. Do not
  half-delete (FK-shaped app queries assume chains stay intact).
