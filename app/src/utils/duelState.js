// One UI state authority for normal 1v1 captain Duels. This module is pure so
// the lifecycle can be tested without React Native, a wallet, or a backend.

const TERMINAL = new Set(['RESOLVED_SIDE_A', 'RESOLVED_SIDE_B', 'CANCELLED']);

function captainSide(duel, wallet) {
  if (!wallet) return null;
  if (wallet === duel.captain_a_wallet) return 1;
  if (wallet === duel.captain_b_wallet) return 2;
  return null;
}

function isTerminal(duel) {
  return TERMINAL.has(String(duel?.status || ''));
}

function positionFor(positions, wallet) {
  return (positions || []).find((position) => position.user_wallet === wallet) || null;
}

function mapDuelState({
  duel,
  userWallet,
  positions = [],
  mutualVotes = [],
  mutualState = null,
  myVoteSubmitted = false,
  otherVoteSubmitted = false,
  nowSec = Math.floor(Date.now() / 1000),
}) {
  if (!duel) return 'PENDING_CHALLENGE';

  const side = captainSide(duel, userWallet);
  const mine = positionFor(positions, userWallet);
  const captainAStake = Number(duel.side_a_total) || 0;
  const captainBStake = Number(duel.side_b_total) || 0;
  const bothFunded = captainAStake > 0 && captainBStake > 0;
  const initialized = (duel.chain_status || 'UNINITIALIZED') === 'INITIALIZED';
  const resolutionReached = nowSec >= Number(duel.resolution_ts || 0);
  const myVote = mutualVotes.find((vote) => vote.captain_wallet === userWallet) ||
    (myVoteSubmitted ? { captain_wallet: userWallet, winner_side: null } : null);
  const otherVote = mutualVotes.find((vote) => vote.captain_wallet !== userWallet) ||
    (otherVoteSubmitted ? { captain_wallet: '__other__', winner_side: null } : null);
  const bothVoted = (Number(myVote?.winner_side) === 1 || Number(myVote?.winner_side) === 2)
    && (Number(otherVote?.winner_side) === 1 || Number(otherVote?.winner_side) === 2);

  if (duel.status === 'CANCELLED') return 'MISMATCH';
  if (duel.status === 'RESOLVED_SIDE_A' || duel.status === 'RESOLVED_SIDE_B') return 'MATCHED_RESULT';
  if (!initialized) return side ? 'ACCEPTED_NOT_INITIALIZED' : 'ACCEPTED_NOT_INITIALIZED';
  if (!bothFunded && resolutionReached) return 'TIMEOUT';
  if (!bothFunded) return 'FUNDING';
  if (!resolutionReached) return 'LIVE';
  if (mutualState === 'DISPUTED') return 'MISMATCH';
  if (mutualState === 'MATCHED') return 'MATCHED_RESULT';
  if (mutualState === 'AWAITING_COUNTERPARTY' && myVote) return 'WAITING_FOR_OTHER_RESULT';
  if (bothVoted && Number(myVote.winner_side) !== Number(otherVote.winner_side)) return 'MISMATCH';
  if (bothVoted) return 'MATCHED_RESULT';
  if (myVote) return 'WAITING_FOR_OTHER_RESULT';
  if (duel.mutual_deadline_ts && nowSec >= Number(duel.mutual_deadline_ts)) return 'TIMEOUT';
  return 'READY_TO_SETTLE';
}

function stateLabel(state) {
  return {
    PENDING_CHALLENGE: 'Challenge pending',
    ACCEPTED_NOT_INITIALIZED: 'Ready to Duel',
    FUNDING: 'Funding',
    LIVE: 'Duel live',
    READY_TO_SETTLE: 'Ready to settle',
    WAITING_FOR_OTHER_RESULT: 'Waiting for @other',
    MATCHED_RESULT: 'Result confirmed',
    MISMATCH: 'No agreement',
    TIMEOUT: 'No agreement reached',
  }[state] || 'Duel';
}

module.exports = {
  captainSide,
  isTerminal,
  mapDuelState,
  positionFor,
  stateLabel,
};
