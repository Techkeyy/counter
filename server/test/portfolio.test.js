const assert = require('assert');
const { buildPortfolio, expectedPayoutBase } = require('../portfolio');

function ok(label) {
  console.log(`  ok - ${label}`);
}

function position(overrides = {}) {
  return {
    duel_id: 'duel_test',
    proposition_a: 'Side A wins',
    proposition_b: 'Side B wins',
    side: 1,
    stake_amount: 10,
    side_a_total: 10,
    side_b_total: 20,
    status: 'ACCEPTING_STAKES',
    winning_side: 0,
    claimed: 0,
    payout_amount: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function run() {
  assert.strictEqual(Number(expectedPayoutBase(position({ status: 'RESOLVED_SIDE_A' }))), 30 * 1e6, 'winner payout follows program formula');
  assert.strictEqual(Number(expectedPayoutBase(position({ status: 'CANCELLED', stake_amount: 7 }))), 7 * 1e6, 'cancelled payout returns principal');
  assert.strictEqual(Number(expectedPayoutBase(position({ status: 'RESOLVED_SIDE_A', side: 2 }))), 0, 'losing side is not claimable');
  ok('integer claimable formulas mirror accepted program arithmetic');

  const full = buildPortfolio({
    balance: 125.1234567,
    positions: [
      position(),
      position({ duel_id: 'duel_win', status: 'RESOLVED_SIDE_A' }),
      position({ duel_id: 'duel_refund', status: 'CANCELLED', stake_amount: 5 }),
      position({ duel_id: 'duel_loss', status: 'RESOLVED_SIDE_A', side: 2 }),
      position({ duel_id: 'duel_claimed', status: 'RESOLVED_SIDE_A', claimed: 1, payout_amount: 30 }),
    ],
  });
  assert.strictEqual(full.summary.available_balance, 125.123457, 'balance is rounded to cUSD precision');
  assert.strictEqual(full.summary.active_in_duels, 10, 'active principal includes unresolved positions only');
  assert.strictEqual(full.summary.claimable, 35, 'claimable includes winner payout plus refund principal');
  assert.strictEqual(full.summary.realized_pnl, 20, 'realized P&L uses recorded claimed payout minus stake');
  assert(full.positions.some((p) => p.claim_state === 'LOST'), 'losing settled position remains visible as history');
  ok('portfolio aggregate separates open, claimable, history, and realized P&L');

  const legacyClaim = buildPortfolio({
    balance: 0,
    positions: [position({ status: 'RESOLVED_SIDE_A', claimed: 1 })],
  });
  assert.strictEqual(legacyClaim.summary.realized_pnl, null, 'legacy claim without chain-observed payout is not guessed');
  assert.strictEqual(legacyClaim.summary.realized_pnl_available, false, 'legacy realized P&L limitation is explicit');
  ok('legacy claims do not produce fake realized P&L');

  console.log('\nAll portfolio tests passed.');
}

run();
