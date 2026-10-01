export type Category = 'CRYPTO' | 'SPORTS' | 'WEATHER' | 'POLITICS' | 'CULTURE';

export type DuelStatus =
  | 'ACCEPTING_STAKES'
  | 'CUTOFF_REACHED'
  | 'SETTLEMENT_PENDING'
  | 'RESOLVED_SIDE_A'
  | 'RESOLVED_SIDE_B'
  | 'CANCELLED';

export type ResolutionMode = 'COUNTER_VERIFIED' | 'MUTUAL';
export type FallbackMode = 'REFUND' | 'COUNTER_VERIFIED';

export interface MutualVote {
  duel_id: string;
  captain_wallet: string;
  winner_side: number;
  message: string;
  signature: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  wallet_address: string;
  handle: string;
  display_name: string;
  avatar_url: string;
  bio?: string;
  skr_staked_amount: number;
  is_arena_eligible: number;
  is_age_verified: number;
  created_at: string;
}

export interface Take {
  id: string;
  author_wallet: string;
  author_handle?: string;
  author_name?: string;
  author_avatar?: string;
  author_skr_staked?: number;
  topic: string;
  content: string;
  category: Category;
  created_at: string;
  status: string;
  likes_count: number;
  comments_count: number;
  duels_count: number;
}

export interface Comment {
  id: string;
  take_id: string;
  author_wallet: string;
  author_handle?: string;
  author_name?: string;
  author_avatar?: string;
  content: string;
  created_at: string;
}

export interface Challenge {
  id: string;
  take_id?: string;
  challenger_wallet: string;
  creator_wallet: string;
  proposition_a: string;
  proposition_b: string;
  category: Category;
  source_type?: string;
  source_config?: string;
  stake_amount_usd: number;
  cutoff_ts: number;
  resolution_ts: number;
  status: 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | 'COUNTERED';
  created_at: string;
  resolution_mode?: ResolutionMode;
  fallback_mode?: FallbackMode;
  mutual_deadline_ts?: number | null;
}

export interface Counteroffer {
  id: string;
  challenge_id: string;
  proposer_wallet: string;
  stake_amount_usd: number;
  cutoff_ts: number;
  resolution_ts: number;
  proposition_a: string;
  proposition_b: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  created_at: string;
}

export interface Duel {
  id: string;
  onchain_duel_id: string;
  challenge_id?: string;
  take_id?: string;
  onchain_duel_pda?: string;
  onchain_vault_pda?: string;
  vault_token_account?: string;
  captain_a_wallet: string;
  captain_b_wallet: string;
  captain_a_handle?: string;
  captain_a_name?: string;
  captain_a_avatar?: string;
  captain_b_handle?: string;
  captain_b_name?: string;
  captain_b_avatar?: string;
  side_a_total: number;
  side_b_total: number;
  terms_hash?: string;
  proposition_a: string;
  proposition_b: string;
  category: Category;
  source_type: string;
  source_config: string;
  cutoff_ts: number;
  resolution_ts: number;
  status: DuelStatus;
  winning_side: number;
  resolution_mode?: ResolutionMode;
  fallback_mode?: FallbackMode;
  mutual_deadline_ts?: number | null;
  resolution_data?: string;
  resolution_tx?: string;
  // Canonical chain binding (see server/chain.js + app/src/chain.ts).
  onchain_duel_bump?: number;
  onchain_vault_bump?: number;
  onchain_mint?: string;
  init_tx_signature?: string;
  chain_status?: 'UNINITIALIZED' | 'INITIALIZED';
  is_arena: number;
  share_slug?: string;
  created_at: string;
}

export interface Position {
  id: string;
  duel_id: string;
  user_wallet: string;
  side: 1 | 2;
  stake_amount: number;
  position_pda?: string;
  claimed: number;
  claim_tx?: string;
  stake_tx_signature?: string;
  created_at: string;
  // Live-joined profile fields (server LEFT JOINs users on reads).
  handle?: string;
  display_name?: string;
  avatar_url?: string;
}

export interface Receipt {
  id: string;
  duel_id: string;
  take_id?: string;
  captain_a_wallet: string;
  captain_b_wallet: string;
  winner_wallet: string;
  total_pool: number;
  resolution_summary: string;
  resolution_evidence: string;
  onchain_signature: string;
  created_at: string;
  share_slug?: string;
}

export interface Rivalry {
  opponent_wallet: string;
  opponent_handle: string;
  opponent_name: string;
  opponent_avatar: string;
  my_wins: number;
  opponent_wins: number;
  draws: number;
  total_disputed_volume: number;
  duels_count: number;
}

export interface ActivityNotification {
  id: string;
  user_wallet: string;
  type: 'CHALLENGE_RECEIVED' | 'COUNTEROFFER' | 'DUEL_STARTED' | 'DUEL_RESOLVED' | 'BACKER_JOINED' | 'PAYOUT_CLAIMED';
  source_wallet: string;
  target_id: string;
  target_type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}
