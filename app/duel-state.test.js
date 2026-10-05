const assert = require('node:assert/strict');
const { mapDuelState } = require('./src/utils/duelState');

const base = {
  id: 'duel_state_test',
  captain_a_wallet: 'A',
  captain_b_wallet: 'B',
  side_a_total: 30,
  side_b_total: 30,
  chain_status: 'INITIALIZED',
  resolution_ts: 2_000,
  mutual_deadline_ts: 3_000,
  status: 'ACCEPTING_STAKES',
};

const duel = (overrides = {}) => ({ ...base, ...overrides });
const vote = (captain_wallet, winner_side) => ({ captain_wallet, winner_side });

assert.equal(mapDuelState({ duel: null, userWallet: 'A', nowSec: 1_000 }), 'PENDING_CHALLENGE');
assert.equal(mapDuelState({ duel: duel({ chain_status: 'UNINITIALIZED' }), userWallet: 'A', nowSec: 1_000 }), 'ACCEPTED_NOT_INITIALIZED');
assert.equal(mapDuelState({ duel: duel({ chain_status: 'UNINITIALIZED', side_a_total: 0, side_b_total: 0 }), userWallet: 'A', nowSec: 2_000 }), 'EXPIRED_BEFORE_FUNDING');
assert.equal(mapDuelState({ duel: duel({ side_b_total: 0 }), userWallet: 'A', nowSec: 1_000 }), 'FUNDING');
assert.equal(mapDuelState({ duel: duel({ side_b_total: 0 }), userWallet: 'A', nowSec: 2_000 }), 'EXPIRED_BEFORE_FUNDING');
assert.equal(mapDuelState({ duel: duel(), userWallet: 'A', nowSec: 1_000 }), 'LIVE');
assert.equal(mapDuelState({ duel: duel(), userWallet: 'A', nowSec: 2_000 }), 'READY_TO_SETTLE');
assert.equal(mapDuelState({ duel: duel(), userWallet: 'A', mutualVotes: [vote('A', 1)], nowSec: 2_000 }), 'WAITING_FOR_OTHER_RESULT');
assert.equal(mapDuelState({ duel: duel(), userWallet: 'A', mutualVotes: [vote('A', 1), vote('B', 1)], nowSec: 2_000 }), 'MATCHED_RESULT');
assert.equal(mapDuelState({ duel: duel(), userWallet: 'A', mutualVotes: [vote('A', 1), vote('B', 2)], nowSec: 2_000 }), 'MISMATCH');
assert.equal(mapDuelState({ duel: duel(), userWallet: 'A', nowSec: 3_000 }), 'TIMEOUT');
assert.equal(mapDuelState({ duel: duel({ status: 'RESOLVED_SIDE_A' }), userWallet: 'A', nowSec: 3_000 }), 'MATCHED_RESULT');
assert.equal(mapDuelState({ duel: duel({ status: 'CANCELLED' }), userWallet: 'A', nowSec: 3_000 }), 'MISMATCH');
assert.equal(mapDuelState({ duel: duel({ mutualState: 'AWAITING_COUNTERPARTY' }), userWallet: 'A', myVoteSubmitted: true, nowSec: 2_000 }), 'WAITING_FOR_OTHER_RESULT');
assert.equal(mapDuelState({ duel: duel({ mutualState: 'AWAITING_COUNTERPARTY' }), userWallet: 'A', otherVoteSubmitted: true, nowSec: 2_000 }), 'READY_TO_SETTLE');
assert.equal(mapDuelState({ duel: duel({ side_a_total: 30, side_b_total: 0 }), userWallet: 'A', nowSec: 2_000 }), 'EXPIRED_BEFORE_FUNDING');
assert.equal(mapDuelState({ duel: duel({ side_a_total: 30, side_b_total: 30 }), userWallet: 'A', nowSec: 2_000 }), 'READY_TO_SETTLE');

console.log('V1 canonical Duel state mapper: PASS (18/18)');
