# Counter UX V2 — Reference Map (2026-09-30)

Method: studied CURRENT mobile patterns of each reference (interaction, density,
navigation), then mapped per Counter screen. Nothing cloned: no trademarks,
assets, trade dress, or pixel layouts reproduced. Counter keeps its own
graphite/green identity, its duel escrow model, and its deterministic-oracle
settlement story.

## Why current Counter feels cluttered (explicit diagnosis)

1. Nested navigation: tab bar + detail overlays + modals + in-screen tabs
   (feed had 3 primary tabs + 5 category chips = 8 competing filters).
2. Too many simultaneous tabs/filters on Home (see above).
3. Pill-heavy: category pills, chips, badges, status tags on every card.
4. Card density: every take/duel/receipt/activity row is a bordered rounded box;
   borders stack (card border + inner box border + section dividers).
5. Border density: 1px `cardBorder` outlines everywhere flatten hierarchy.
6. Vertical rhythm: mixed paddings (12/16/24), magic paddings (80/96 bottom),
   conditional sections appearing/disappearing shift layout.
7. Information duplication: duel data repeated in feed card + detail + activity
   row with slightly different labels.
8. Scrolling continuity: feed mixes three card sizes (take/duel/settled) so the
   eye never locks a rhythm; detail screens nest ScrollView content of uneven
   weight.
9. Header complexity: wordmark + compose + wallet pill + bell on one 60px strip.
10. Repeated actions: share buttons on every card AND detail; challenge on card
    AND detail AND reply.
11. Wallet visibility: address pill permanently occupies prime header space.
12. Unnecessary blockchain visibility: program IDs, PDAs, resolver labels leak
    above the outcome on cards and detail headers.

## Screen mapping

### Counter Home → Threads + Bluesky timeline
- Borrow: single chronological timeline; avatar + name + handle + time header
  row; text-first rows separated by 1px dividers (no cards); compact inline
  action row (reply / challenge / share); pull-to-refresh; thread tap-through.
- Spacing/density: Bluesky's ~64px comfortable row rhythm; generous line-height
  on body copy; actions sit directly under text, not in a footer bar.
- Navigation: no in-feed tabs until Following is real; composer as a floating
  action (Material FAB pattern, bottom-right above nav) rather than a tab.
- NOT borrowed: algorithmic "For You" ranking claims; quote-post complexity;
  like counts without a backend (no fake metrics).
- Why: Counter's core loop starts with reading opinions; the timeline must feel
  weightless so conflict (challenge) is one calm tap away.

### Take detail / conversation → Threads conversation + Bluesky thread
- Borrow: parent take on top, vertical continuity, flat reply rows with small
  avatars, sticky bottom composer, challenge as a contextual row action.
- NOT borrowed: nested quote trees; multi-level indentation past one level.
- Why: the dispute must read as a conversation first, a market second.

### Profile → Bluesky / Threads profile
- Borrow: avatar + name + handle + bio block; counts row (Takes / Duels /
  Receipts as plain numbers, tappable); content tabs below; wallet/account
  moved to a lower "Account" section.
- NOT borrowed: follower graphs (no backend); large stat dashboard cards.
- Why: Counter is person-first; escrow metadata is secondary by thesis.

### Wallet connect + transaction progress → Robinhood / Cash App action flow
- Borrow: full-sheet staging (what happens → approve in wallet → verifying →
  done); one dominant button per state; rejection framed as a normal choice;
  amounts in plain figures with explicit difference/payout lines.
- NOT borrowed: custodial-wallet assumptions; jargon-free means Counter still
  names Devnet honestly ("Test build · Solana Devnet").
- Why: money movement needs calm, staged certainty, especially over MWA hops.

### Duels list → lightweight financial list (Robinhood watchlist discipline)
- Borrow: dense rows (participants, proposition, status, pool, deadline);
  segment filter (Open / Yours / Resolved) only because each maps to a real
  query; category discovery lives here (real `?category=` backend param).
- NOT borrowed: candlesticks, sparklines, fake precision; social-card chrome;
  separate Arena destination (arena becomes a filter/eligibility state).
- Why: browsing duels is scanning, not reading; rows beat cards for scan speed.

### Duel detail → Robinhood clarity + Kalshi/Polymarket hierarchy
- Borrow: proposition first; Side A / Side B people; state; real pool amounts;
  user position; ONE dominant contextual CTA (sticky bottom); supporting
  timeline; technical proof collapsed under "Details and proof".
- Polymarket rule clarity: exact resolution rule/source inspectable at the
  detail layer, never cluttering Home.
- NOT borrowed: order books, trade tickets, odds-format selector complexity.
- Why: finance becomes important HERE and only here (Money Third).

### Activity → Venmo transaction/activity history
- Borrow: chronological rows with Today / Earlier grouping; compact
  icon + title + time rows; action-needed styling distinct from FYI rows;
  tap-through to the object.
- NOT borrowed: payment amounts front-and-center (Counter rows lead with the
  event, amounts secondary); friend-graph features.
- Why: "what happened and what do I need to do" is a timeline job.

### Receipt → Venmo/Cash App transaction detail + Counter chain proof
- Borrow: status header (Settled), proposition, winner, pool/payout figures,
  participants, time/source rows, transaction IDs with copy + explorer,
  share at the bottom.
- Counter-specific: settlement tx + claim tx under a collapsed proof section;
  verified badge ONLY for genuine signatures.
- NOT borrowed: "immutable" marketing language; badges for legacy history rows.
- Why: receipts must read as high-trust records, with proof available but quiet.

## Activity failure root cause (Gate 11)

Observed on hardware: `JSON Parse error: Unexpected character: <`.
App path: `api.getActivity()` → shared `request()` calls `response.json()`
unconditionally and `ActivityScreen` renders `err.message` verbatim.

Eliminated: Express error middleware returns JSON (verified in
`server/index.js`); all `/api/*` routes return JSON when the backend is up;
Caddy has no HTML error wrapping (plain `reverse_proxy`, verified config).

Remaining explanation: the body was not JSON at all. The only HTML source in
the chain is a gateway 502/503 page when the Node backend is unreachable
(restarts during the deployment windows overlapped the owner's physical
sessions), or an Express default 404 page for an unknown path. Either yields a
body starting with `<`.

Fix (both layers, no VPS change): `request()` validates content-type/status
before parsing and throws curated errors (server JSON `.error` preserved;
non-JSON becomes a generic reachability error); screens render fixed friendly
copy ("Activity couldn't load. Try again.") and keep technical detail in logs.
