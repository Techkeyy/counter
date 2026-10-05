function parsedResolutionData(duel) {
  try { return duel?.resolution_data ? JSON.parse(duel.resolution_data) : null; } catch { return null; }
}

function deriveDuelState(duel, nowSec = Math.floor(Date.now() / 1000)) {
  if (!duel) return 'UNKNOWN';
  const status = String(duel.status || '');
  const sideA = Number(duel.side_a_total) || 0;
  const sideB = Number(duel.side_b_total) || 0;
  const resolutionReached = nowSec >= Number(duel.resolution_ts || 0);
  const bothFunded = sideA > 0 && sideB > 0;
  if (status.startsWith('RESOLVED')) return 'COMPLETED';
  if (status === 'CANCELLED') {
    const outcome = parsedResolutionData(duel);
    return outcome?.resolutionMode === 'MUTUAL' || outcome?.fallback === 'REFUND' ? 'REFUNDED' : 'CANCELLED';
  }
  if (resolutionReached && !bothFunded) return 'EXPIRED';
  if ((duel.chain_status || 'UNINITIALIZED') !== 'INITIALIZED') return 'FORMING';
  if (!bothFunded) return 'FORMING';
  if (!resolutionReached) return 'LIVE';
  return 'READY_TO_SETTLE';
}

function stateLabel(state) {
  return {
    FORMING: 'Duel forming',
    LIVE: 'Duel live',
    READY_TO_SETTLE: 'Ready to settle',
    COMPLETED: 'Result confirmed',
    REFUNDED: 'Refunded',
    CANCELLED: 'Duel cancelled',
    EXPIRED: 'Duel expired',
  }[state] || 'Duel state unavailable';
}

function summarizeDuel(duel, nowSec = Math.floor(Date.now() / 1000)) {
  const state = deriveDuelState(duel, nowSec);
  return {
    id: duel.id,
    take_id: duel.take_id,
    status: duel.status,
    state,
    state_label: stateLabel(state),
    resolution_ts: duel.resolution_ts,
    captain_a_wallet: duel.captain_a_wallet,
    captain_b_wallet: duel.captain_b_wallet,
    captain_a_name: duel.captain_a_name,
    captain_b_name: duel.captain_b_name,
    captain_a_handle: duel.captain_a_handle,
    captain_b_handle: duel.captain_b_handle,
    captain_a_avatar: duel.captain_a_avatar,
    captain_b_avatar: duel.captain_b_avatar,
    side_a_total: duel.side_a_total,
    side_b_total: duel.side_b_total,
  };
}

module.exports = { deriveDuelState, stateLabel, summarizeDuel };
