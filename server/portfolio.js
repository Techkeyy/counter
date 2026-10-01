const CUSD_DECIMALS = 6;
const BASE = 10 ** CUSD_DECIMALS;

function toBaseUnits(value) {
  const n = Number(value) || 0;
  return BigInt(Math.max(0, Math.round(n * BASE)));
}

function fromBaseUnits(value) {
  return Number(value) / BASE;
}

function roundUsd(value) {
  return Math.round((Number(value) || 0) * BASE) / BASE;
}

function isSettled(status) {
  return String(status || '').startsWith('RESOLVED') || status === 'CANCELLED';
}

// Mirrors program/src/lib.rs::process_claim_payout using integer base units.
// It is an estimate of the amount currently claimable; actual realized P&L
// comes only from payout_amount written after a verified claim transaction.
function expectedPayoutBase(position, duel = position) {
  const stake = toBaseUnits(position.stake_amount);
  if (duel.status === 'CANCELLED') return stake;
  if (duel.status === 'RESOLVED_SIDE_A' && Number(position.side) === 1) {
    const sideA = toBaseUnits(duel.side_a_total);
    const sideB = toBaseUnits(duel.side_b_total);
    if (sideA === 0n) return 0n;
    return stake + (stake * sideB) / sideA;
  }
  if (duel.status === 'RESOLVED_SIDE_B' && Number(position.side) === 2) {
    const sideA = toBaseUnits(duel.side_a_total);
    const sideB = toBaseUnits(duel.side_b_total);
    if (sideB === 0n) return 0n;
    return stake + (stake * sideA) / sideB;
  }
  return 0n;
}

function positionView(position) {
  const payoutBase = expectedPayoutBase(position, position);
  const stake = roundUsd(position.stake_amount);
  const settled = isSettled(position.status);
  const expectedPayout = fromBaseUnits(payoutBase);
  let claimState = 'OPEN';
  if (settled && Number(position.claimed) === 1) claimState = 'CLAIMED';
  else if (settled && payoutBase > 0n) claimState = 'CLAIMABLE';
  else if (settled) claimState = 'LOST';
  return {
    duel_id: position.duel_id,
    proposition_a: position.proposition_a,
    proposition_b: position.proposition_b,
    chosen_side: Number(position.side),
    stake_amount: stake,
    expected_payout: roundUsd(expectedPayout),
    payout_amount: position.payout_amount === null || position.payout_amount === undefined
      ? null
      : roundUsd(position.payout_amount),
    status: position.status,
    claim_state: claimState,
    claimed: Number(position.claimed) === 1,
    created_at: position.created_at,
  };
}

function buildPortfolio({ balance, positions }) {
  const views = positions.map((position) => positionView(position));
  const activeInDuels = views
    .filter((position) => position.claim_state === 'OPEN')
    .reduce((sum, position) => sum + position.stake_amount, 0);
  const claimable = views
    .filter((position) => position.claim_state === 'CLAIMABLE')
    .reduce((sum, position) => sum + position.expected_payout, 0);
  const claimed = views.filter((position) => position.claim_state === 'CLAIMED');
  const missingPayout = claimed.some((position) => position.payout_amount === null);
  const realizedPnl = missingPayout
    ? null
    : claimed.reduce((sum, position) => sum + (position.payout_amount - position.stake_amount), 0);

  return {
    currency: 'Counter Test USD',
    devnet: true,
    summary: {
      available_balance: roundUsd(balance),
      active_in_duels: roundUsd(activeInDuels),
      claimable: roundUsd(claimable),
      realized_pnl: realizedPnl === null ? null : roundUsd(realizedPnl),
      realized_pnl_available: !missingPayout,
      realized_pnl_note: missingPayout
        ? 'Earlier claims do not include a chain-observed payout amount.'
        : null,
    },
    positions: views,
  };
}

module.exports = {
  expectedPayoutBase,
  buildPortfolio,
  isSettled,
};
