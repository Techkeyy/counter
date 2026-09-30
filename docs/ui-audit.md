# Counter UI / Data Audit — UX Hardening Phase (2026-09-30)

Method: full source read (`app/App.tsx`, all screens/components, `api.ts`, `wallet.ts`,
`chain.ts`, `session.ts`, `theme.ts`, backend resolver contracts), emoji scan
(unicode-range sweep), fixture-pattern sweep, dead-code usage check.
Skills applied: project-audit (claims-vs-reality, mechanical hygiene),
veritable-ui-design (product-outward structure, 4 states, no-dash copy).

## 1. Screen / route inventory

| Screen | Purpose | Primary goal | Primary action today | Problems |
|---|---|---|---|---|
| Feed (`FeedScreen`) | Social entry | Read takes, find duels | Tabs For You/Following/Live | Following tab is fake (comments>0 proxy, no follow backend); For You implies ranking (chronological only); client-synthesized receipt objects with unverified badges |
| Arena (`ArenaScreen`) | SKR-gated duel discovery | Browse high-stakes duels | Back via modal | 5th destination; gating banner dominates; overlaps Duels destination |
| Compose (`CreateTakeScreen`) | New take | Post a take | Publish | Emoji titles, fabricated "4x faster" stat |
| Take detail | Conversation | Read/reply/challenge | Challenge This Take | Sound; reply-challenge retargets parent take (acceptable simplification) |
| Duel detail | Economic surface | Back/init/resolve/claim | Context CTAs | Emoji chrome; "Verified on Solana" shown when UNINITIALIZED; Resolve shown when it must fail; small targets |
| Receipt | Permanent record | Verify/share outcome | Share, explorer | "Immutable/Verified" badges unconditional (legacy `simulated_resolution_tx` exists in prod); share copy claims verification unconditionally |
| Activity | Inbox | Answer what happened / what to do | Review buttons | No error state (silent empty on failure); challenge actions navigate to duel view (wrong target); no accept/decline/counter UI anywhere |
| Profile | Person record | Identity + history | Tabs Takes/Duels/Receipts | HARDCODED rivalry card ("vs Israel, 3 Duels, Leads 2-1") + dead Rematch button; bio fallback presented as bio; no error state |
| Onboarding modal | First run | Connect + name | Connect Solana Wallet | Binary connect outcome, no progress/recovery/timeout states |
| Challenge modal | Propose duel | Define terms, send | Propose | Emoji; hardcoded resolution `{targetPriceUsd: 250, condition: 'GTE'}` (backend reads `operator`/`assetId`, so every duel effectively resolves SOL >= $250); no per-category criteria; small targets |
| Back modal | Deposit stake | Fund a side via MWA | Confirm and deposit | Sound flow (real tx, faucet balance-reread); ✕ glyph; small presets |
| Header / tab bar | Shell | Navigate, wallet entry | Connect / tabs | Binary wallet button (failure dumps to idle); hardcoded `unreadCount={0}`; 5 tabs; small targets |

## 2. Data source per displayed value (material claims)

- Take author/display/handle/avatar: backend fields via `identity.ts` (no handle fabrication; dicebear identicon derived from wallet when no avatar). REAL.
- comments_count, pools, positions, receipts: backend rows. REAL.
- Win rate / streak: server `stats` with local fallback from fetched duels. REAL (derived).
- Odds/percentages/payout previews: computed from real pool totals. REAL (derived).
- Following tab, For You ranking, synthesized feed receipts, rivalry card, 4x stat, 250/GTE criteria: NOT backend-backed. FAKE (see §3).

## 3. Hardcoded-data findings + disposition

| # | Location | Finding | Class | Disposition |
|---|---|---|---|---|
| H1 | 11 spots: `BackModal` ✕; `ChallengeModal` ⚔️✕🔒; `CreateTakeScreen` 🔥💡; `DuelDetailScreen` ⚔️🔗📤👥← | Emoji-as-interface (prior "0 emojis" ledger claim is FALSE) | RUNTIME-HARDCODED | Replace with SVG Icon + plain copy |
| H2 | `FeedScreen` Following tab | Fake follow semantics | RUNTIME-HARDCODED | Replace tabs with Latest / Duels (chronological + open-duel filter, both real) |
| H3 | `FeedScreen` synthesized `receipt` objects | Client-fabricated receipts w/ "On-Chain Receipt" badge | RUNTIME-HARDCODED | Settled cards from duel fields only, honestly labeled; real receipt screen loads backend row |
| H4 | `ReceiptScreen` badges + share copy | "Immutable/Verified" unconditional; prod holds a `simulated_resolution_tx` receipt | RUNTIME-HARDCODED | Gate badge/copy/explorer on real-sig check |
| H5 | `ProfileScreen` rivalry card | "vs Israel · 3 Duels · Leads 2–1" + dead Rematch | RUNTIME-HARDCODED | Compute per-opponent W/L from fetched duels; tap opens latest duel; no fake names |
| H6 | `ChallengeModal` sourceConfig | `{targetPriceUsd: 250, condition: 'GTE'}`; backend reads `operator`/`assetId` | RUNTIME-HARDCODED | Per-category criteria UI: crypto (asset/operator/price), sports (event/teams/side), weather (city preset/coords/condition); send exact backend contract |
| H7 | `CreateTakeScreen` tip | "challenged 4x faster" | RUNTIME-HARDCODED | Remove statistic, keep neutral guidance |
| H8 | `DuelDetailScreen` proof accordion | "Verified on Solana" when UNINITIALIZED | RUNTIME-HARDCODED | Gate on `chain_status === 'INITIALIZED'`; else honest pending state |
| H9 | `DuelDetailScreen` Resolve button | Shown when it must fail (uninitialized) | RUNTIME-HARDCODED | Show only when INITIALIZED + unresolved |
| H10 | `TakeCard.tsx`, `DuelCard.tsx`, `ReceiptCard.tsx` | Dead components (0 usages) | DESIGN-ONLY (dead) | Delete |
| H11 | `App.tsx` `unreadCount={0}` | Fake zero badge data | RUNTIME-HARDCODED | Remove count (neutral bell) |
| H12 | Profile bio fallback | Presented as user bio | DESIGN-ONLY | Hide when absent |
| H13 | Placeholders ("e.g. SOL will flip ETH") | Input examples, not data | DESIGN-ONLY | Keep (neutralized where boastful) |
| H14 | dicebear identicons, `toFixed(2)` formatting, timestamps | Derived/formatting of real values | RUNTIME-REAL | Keep |

## 4. Wallet / state gaps

- Connect outcome is binary; every failure (reject, timeout, no wallet, network,
  auth) collapses to idle Connect. REQUIRED: CONNECTING / WAITING_FOR_WALLET /
  VERIFYING / CONNECTED / USER_REJECTED / NO_WALLET / MWA_TIMEOUT / NETWORK_ERROR /
  AUTH_FAILED + 45s MWA timeout + Retry + Connection help (battery-saving note,
  per-app-setting path UNVERIFIED, no global-disable requirement) + "Test build ·
  Solana Devnet" badge + Devnet-mismatch guidance.
- No OFFLINE variant anywhere: classify `Network request failed` into ErrorState
  offline mode (no new native dep).
- Challenge accept/decline/counter has endpoints but NO UI: add review sheet from
  Activity (CHALLENGE_RECEIVED/COUNTEROFFER) with Accept / Decline / Counter form.

## 5. Touch / type / a11y gaps

- Interactive targets routinely 28–44dp (chips, preset buttons, icon buttons, tab
  items). REQUIRED: >= 48dp everywhere.
- 10–11px secondary text. REQUIRED: meaningful text >= 12px, body 14–15px.
- Nested pressables in `SocialPostCard` (actions inside card navigation touchable).
- `Icon` already SVG with labels; add `send`, `info`, `wifi-off`, `history` glyphs.

## 6. Navigation decision (4 destinations)

HOME (feed + composer action) / DUELS (All / Open / Settled / Arena filters; arena
publish stays a duel-detail action for eligible wallets) / ACTIVITY (with review
sheet) / PROFILE. Composer becomes a Home header action, not a tab. Arena screen
file is replaced by `DuelsScreen`; SKR-gating copy moves to duel detail/profile.

## 7. Pattern decisions (no trademark cloning)

- Farcaster/Bluesky: chronological feed, Following→Latest honesty, reply composer.
- Robinhood: glanceable duel economics, one dominant contextual CTA, progressive
  disclosure for chain proof.
- Polymarket/Kalshi: outcome comprehension (Side A vs B, pool split, resolution
  criteria stated before money).
- Cash App: focused Back sheet (already close; keep + harden).
- Venmo: chronological activity with action states.
- Phantom/MWA: explicit wallet-action boundary copy ("Approve in wallet", rejection
  as normal choice).
- Android: 48dp targets, edge-to-edge SafeArea, no critical content under gestures.

## 8. Out of scope (preserved)

Program, AXMB7 mint, backend trust boundaries, SIWS/MWA architecture, production
backend + data (no row wipes), signing identity, App Links. VPS untouched.

## 9. Final verification (post-implementation)

- Emoji sweep (unicode-range over all `app/src` + `App.tsx`, comments excluded):
  **0 hits**. Prior "0 emojis" ledger claim was false; the 11 real spots are gone.
- Em/en dash sweep over UI text: **0 hits**.
- `tsc --noEmit`: **0 errors**. Session tests **5/5**. Chain vectors **11/11**.
  Backend adversarial **8/8** (live oracle, fixtures cleaned).
- Dead components deleted: `TakeCard`, `DuelCard`, `ReceiptCard` (0 usages each).
- `expo-clipboard@~7.0.1` added (real copy action; autolinked at build).
- Additional dispositions closed during implementation:
  - H15 (new): profile copy button was icon-only theater → real
    `Clipboard.setStringAsync` with confirmation state.
  - H16 (new): MWA identity `uri` + wallet/chain authorize URIs used unowned
    `counter.app` → production host (same host-alignment as App Links).
  - H17 (new): `ActivityScreen` action filter missed server type
    `COUNTEROFFER_RECEIVED` → filter now covers both spellings.
  - H18 (new): `TakeDetailScreen` reply/load failures were silent → inline error
    with retry; challenge CTA labeled and 48dp.
- Accepted non-findings (documented, not changed): `console.warn` logs aid field
  diagnosis via logcat and are invisible in UI; dicebear identicons are
  wallet-derived (no fake faces); `toFixed(2)` formats real backend values;
  input placeholders are examples, not data; win-rate/streak derive from real
  records; per-app battery-setting recovery path is UNVERIFIED on hardware and
  the help copy says only what is proven.
- a11y: every interactive element carries `accessibilityLabel` (+ role/state
  where meaningful); icon-only buttons meet 48dp; text meets 12px floor
  (body 14-15px); mono reserved for wallets/signatures/IDs.
