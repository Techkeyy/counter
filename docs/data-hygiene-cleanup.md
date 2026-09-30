# Counter Production Data-Hygiene Cleanup (2026-09-30)

Authorization: owner-explicit removal of audited synthetic rows
(`docs/data-hygiene-audit.md`). No legitimate user content was deleted.
Service windows: two brief `counter-backend` stop/start cycles, nothing else.

## Backups
- Pre-cleanup backup: `/opt/counter/backups/counter-pre-cleanup-20260930192103.sqlite`
  (184320 bytes, SHA-256 `e1bd3b49…f51`; identical to live hash at backup time).
- Pre-cleanup-2 backup: `/opt/counter/backups/counter-pre-cleanup2-20260930.sqlite`
  (live hash `0a21ab3e…8488be49`, verified identical after copy).
- Rollback for the wipe: restore either backup file + restart
  `counter-backend` only. Rollback for the guard change (§4): previous
  `server/seed.js` blob + restart.

## Pre-cleanup counts
users 53 / takes 13 / comments 12 / challenges 12 / duels 13 / positions 34 /
receipts 4 / activity 75.

## Pass 1 — old ladder (13 takes, 13 duels, 12 challenges, 4 receipts, 34 positions, 12 comments, 71+4 activity, 52 users, 4 stale nonces)
- Guards: zero genuine-origin takes/duels; target counts exactly matched the audit.
- Deleted IDs: `take_test_001`, `take_179062*` (11), `duel_test_001/002`,
  `duel_179062*` (11), `chal_test_001`, `chal_179062*` (11), `receipt_duel_test_001`,
  `rcpt_duel_1790629*` (3), all positions/comments on those, activity rows by
  target (71) and by removed users (4), 4 expired nonces.
- Users: kept owner device wallet `eMMEh8…` (physical-testing wallet, Sep 30);
  dropped 52 synthetic/placeholder wallets (incl. seed personas Alice/Bob),
  each verified zero-reference first; none skipped.
- Result: users 1, all content tables 0, orphans 0/0/0.

## Reseed trap (observed, then fixed durably)
- Restart after pass 1 re-ran `seedDatabase()` (guard: seed when takes table
  empty) and repopulated a curated demo set: 4 named personas, 3 takes with
  hardcoded `likes_count=12`/`comments_count=4`, 4 duels with hardcoded pools,
  1 receipt with a scripted signature.
- Durable fix (minimal, Counter-only, reversible): `server/seed.js` now skips
  unless `SEED_DEMO_CONTENT=1` (default off; committed, pushed, deployed as a
  hash-verified single file; `node -e require` smoke OK). Production env does
  NOT set the flag. Rollback: previous blob + restart.
- Rationale recorded: row removal alone cannot hold zero while boot reseeds;
  the guard change is the necessary machinery of the authorized removal.

## Pass 2 — curated seed set
- Guard: unknown-ID scan returned `[]` (no genuine content present).
- Deleted: `take_sol_breakout`, `take_liverpool_derby`, `take_london_rain`,
  `duel_sol_125`, `duel_liv_tot`, `duel_london_rain`, `duel_resolved_historical`,
  `receipt_duel_resolved_historical`, 4 persona users
  (`sol_maximalist`, `seeker_whale`, `premier_pundit`, `weather_oracle`).
  Zero positions/comments/challenges/activity referenced them (all 0).
- Users: kept `eMMEh8…` (owner); dropped 4; none skipped.

## Post-cleanup verification
- Restart log: `[SEED] Demo seeding disabled (SEED_DEMO_CONTENT is not 1). Skipping.`
  No errors, no reseed. Service active, port 8795.
- DB counts: users 1 / takes 0 / comments 0 / challenges 0 / duels 0 /
  positions 0 / receipts 0 / activity 0. Orphans 0/0/0. Schema intact
  (chain columns present).
- Public reads: `/api/health` 200 (program exact); `/api/takes` → 0 rows;
  `/api/duels` → 0 rows. App renders honest empty states (no seeding of
  replacement content).

## Resulting claims
- PERSISTED_SYNTHETIC_DATA_VISIBLE_TO_USERS = 0 (durable across restarts).
- Deleted-ID ledger: this file + pre-cleanup backup. Nothing else on the VPS
  was created, modified, or deleted this phase besides `server/seed.js`,
  the two backup files, and `counter-backend` restarts.
