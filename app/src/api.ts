import { Take, Comment, Challenge, Counteroffer, Duel, Receipt, User, Rivalry, ActivityNotification } from './types';

export interface ProfileUpdateInput {
  displayName?: string;
  handle?: string;
  bio?: string;
}

// Dedicated Hosted VPS Backend URL (Fixed Public HTTPS)
export const STABLE_BACKEND_URL = 'https://counter.103-195-188-198.sslip.io/api';
export const API_BASE_URL = STABLE_BACKEND_URL;
// Public web host for share links (duel /d/:slug and receipt /r/:id pages).
export const PRODUCTION_WEB_URL = 'https://counter.103-195-188-198.sslip.io';

let authToken: string | null = null;
let currentWallet: string | null = null;

export function setAuthSession(token: string, wallet: string) {
  authToken = token;
  currentWallet = wallet;
}

export function getAuthToken() {
  return authToken;
}

export function getCurrentWallet() {
  return currentWallet;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (err: any) {
    // Transport never reached the backend (offline, DNS, refused).
    console.warn(`[API] transport failure ${endpoint}:`, err?.message);
    throw new Error('NETWORK_UNREACHABLE');
  }

  // Never assume JSON: gateways and default error pages answer HTML (which
  // used to surface on-device as "JSON Parse error: Unexpected character:
  // <"). Server JSON error bodies are preserved verbatim; anything else
  // becomes a status-coded reachability error with no parser text.
  const contentType = response.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (err: any) {
      console.warn(`[API] malformed JSON ${endpoint}:`, err?.message);
      data = null;
    }
  }

  if (!response.ok) {
    if (data && typeof data.error === 'string' && data.error.length > 0) {
      throw new Error(data.error);
    }
    throw new Error(`REQUEST_FAILED:${response.status}`);
  }
  if (data === null || data === undefined) {
    throw new Error('REQUEST_FAILED:200');
  }
  return data as T;
}

// True when the backend was never reached (or answered non-JSON): the UI
// should render its offline variant, never raw parser text.
export function isUnreachable(err: any): boolean {
  const msg = String(err?.message || '');
  return /NETWORK_UNREACHABLE|REQUEST_FAILED:5|network request failed|failed to fetch|offline/i.test(msg);
}

// Fixed UI copy for list-level failures. Backend-provided messages stay for
// action flows (they carry meaning); screens show these instead of raw text.
export const OFFLINE_MESSAGE = 'NETWORK_UNREACHABLE';

export const api = {
  // Auth
  getNonce: async (wallet: string) => {
    return request<{ nonce: string; expiresAt: number }>(`/auth/nonce?wallet=${wallet}`);
  },
  verifySignature: async (wallet: string, signature: string, nonce: string) => {
    const res = await request<{ valid: boolean; token: string; user: User }>(`/auth/verify`, {
      method: 'POST',
      body: JSON.stringify({ wallet, signature, nonce }),
    });
    if (res.token) {
      setAuthSession(res.token, wallet);
    }
    return res;
  },

  // Takes
  getTakes: async (category?: string): Promise<Take[]> => {
    const query = category ? `?category=${category}` : '';
    const res = await request<any>(`/takes${query}`);
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.takes)) return res.takes;
    return [];
  },
  getTake: async (id: string): Promise<Take & { comments: Comment[]; duels: Duel[] }> => {
    const res = await request<any>(`/takes/${id}`);
    if (res && res.take) {
      return {
        ...res.take,
        comments: Array.isArray(res.comments) ? res.comments : [],
        duels: Array.isArray(res.duels) ? res.duels : [],
      };
    }
    return res;
  },
  createTake: async (topic: string, content: string, category: string): Promise<Take> => {
    const res = await request<any>(`/takes`, {
      method: 'POST',
      body: JSON.stringify({ topic, content, category }),
    });
    return res?.take || res;
  },
  addComment: async (takeId: string, content: string): Promise<Comment> => {
    const res = await request<any>(`/takes/${takeId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return res?.comment || res;
  },
  deleteTake: async (takeId: string): Promise<{ success: boolean; cancelledChallenges: number }> => {
    return request<{ success: boolean; cancelledChallenges: number }>(`/takes/${takeId}`, {
      method: 'DELETE',
    });
  },

  // Challenges & Negotiation
  getChallenges: async (): Promise<Challenge[]> => {
    const res = await request<any>(`/challenges`);
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.challenges)) return res.challenges;
    return [];
  },
  proposeChallenge: async (data: {
    takeId?: string;
    targetWallet: string;
    propositionA: string;
    propositionB: string;
    category: string;
    stakeAmountUsd: number;
    cutoffTs: number;
    resolutionTs: number;
    sourceType: string;
    sourceConfig: any;
    resolutionMode?: string;
    fallbackMode?: string;
    mutualDeadlineTs?: number | null;
  }) => {
    // Server contract uses `creatorWallet` (Captain A / take author).
    // Send both keys so the challenge counterparty is never silently dropped
    // by a field-name mismatch.
    return request<Challenge>(`/challenges`, {
      method: 'POST',
      body: JSON.stringify({ ...data, creatorWallet: data.targetWallet }),
    });
  },
  createCounteroffer: async (challengeId: string, data: {
    stakeAmountUsd: number;
    cutoffTs?: number;
    resolutionTs?: number;
    propositionA?: string;
    propositionB?: string;
  }) => {
    return request<Counteroffer>(`/challenges/${challengeId}/counter`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  acceptChallenge: async (challengeId: string, counterofferId?: string) => {
    return request<{ success: boolean; duel: Duel }>(`/challenges/${challengeId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ counterofferId }),
    });
  },
  declineChallenge: async (challengeId: string) => {
    return request<{ success: boolean }>(`/challenges/${challengeId}/decline`, {
      method: 'POST',
    });
  },

  // Duels & Arena
  getDuels: async (options: { isArena?: boolean; category?: string; status?: string } = {}): Promise<Duel[]> => {
    const params = new URLSearchParams();
    if (options.isArena) params.append('isArena', '1');
    if (options.category) params.append('category', options.category);
    if (options.status) params.append('status', options.status);
    const res = await request<any>(`/duels?${params.toString()}`);
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.duels)) return res.duels;
    return [];
  },
  getDuel: async (id: string): Promise<Duel & { positions: any[]; myPosition?: any; mutualVotes?: any[] }> => {
    const res = await request<any>(`/duels/${id}`);
    if (res && res.duel) {
      return {
        ...res.duel,
        positions: Array.isArray(res.positions) ? res.positions : [],
        myPosition: res.myPosition || null,
        mutualVotes: Array.isArray(res.mutualVotes) ? res.mutualVotes : [],
      };
    }
    return res;
  },
  initOnChainDuel: async (duelId: string, txSignature: string) => {
    // Binds the duel to the deployed program. The backend independently
    // verifies the confirmed InitializeDuel transaction before storing
    // anything; fabricated signatures are rejected with no state change.
    return request<{ success: boolean; duelId: string; chainStatus: string }>(`/duels/${duelId}/init-onchain`, {
      method: 'POST',
      body: JSON.stringify({ txSignature }),
    });
  },
  recordStake: async (duelId: string, side: 1 | 2, stakeAmount: number, txSignature: string, positionPda?: string) => {
    // Pool totals are set from chain-observed state, never client numbers.
    // txSignature is REQUIRED: unstaked claims are rejected.
    return request<{ success: boolean; duel: Duel }>(`/duels/${duelId}/stake`, {
      method: 'POST',
      body: JSON.stringify({ side, amount: stakeAmount, stakeAmount, txSignature, positionPda }),
    });
  },
  claimDuel: async (duelId: string, txSignature: string) => {
    return request<{ success: boolean; payoutUsd: number | null; receipt: Receipt }>(`/duels/${duelId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ txSignature }),
    });
  },
  getChainAccounts: async (duelId: string, wallet?: string) => {
    const query = wallet ? `?wallet=${wallet}` : '';
    return request<any>(`/duels/${duelId}/chain-accounts${query}`);
  },
  resolveDuel: async (duelId: string) => {
    return request<any>(`/duels/${duelId}/resolve`, {
      method: 'POST',
    });
  },
  publishArena: async (duelId: string) => {
    return request<{ success: boolean; isArena: number; skrStake: number }>(`/duels/${duelId}/publish-arena`, {
      method: 'POST',
    });
  },
  postMutualVote: async (duelId: string, winnerSide: 1 | 2, signature: string) => {
    return request<{ success: boolean; votes: any[]; match: { matched: boolean; winnerSide: number; state?: string } }>(
      `/duels/${duelId}/mutual-vote`,
      {
        method: 'POST',
        body: JSON.stringify({ winnerSide, signature }),
      }
    );
  },

  // Receipts
  getReceipt: async (id: string): Promise<Receipt> => {
    const res = await request<any>(`/receipts/${id}`);
    if (res && res.receipt) {
      return {
        ...res.receipt,
        positions: Array.isArray(res.positions) ? res.positions : [],
      };
    }
    return res;
  },
  getUserReceipts: async (wallet: string): Promise<Receipt[]> => {
    const res = await request<any>(`/receipts/user/${wallet}`);
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.receipts)) return res.receipts;
    return [];
  },

  // Users & Profiles
  getUserProfile: async (wallet: string): Promise<User & { stats: any }> => {
    const res = await request<any>(`/users/${wallet}`);
    if (res && res.user) {
      return {
        ...res.user,
        stats: res.stats || {},
      };
    }
    return res;
  },
  getRivalry: async (wallet: string, opponentWallet: string) => {
    return request<Rivalry>(`/users/${wallet}/rivalry/${opponentWallet}`);
  },
  updateProfile: async (data: ProfileUpdateInput): Promise<User> => {
    const res = await request<any>(`/users/profile`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res?.user || res;
  },
  uploadAvatar: async (dataUrl: string) => {
    const res = await request<any>(`/users/profile/avatar`, {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    });
    return res?.user || res;
  },
  removeAvatar: async () => {
    const res = await request<any>(`/users/profile/avatar`, {
      method: 'DELETE',
    });
    return res?.user || res;
  },

  // Faucet (Devnet test cUSD — no monetary value)
  requestFaucet: async () => {
    return request<{
      success: boolean;
      amount: number;
      tokenMint: string;
      txSignature: string;
      balanceBefore: number;
      balanceAfter: number;
      retryAfterHours?: number;
    }>(`/faucet/cusd`, { method: 'POST' });
  },

  // Moderation
  reportContent: async (targetType: 'TAKE' | 'DUEL' | 'USER', targetId: string, reason: string) => {
    return request<{ success: boolean }>(`/moderation/report`, {
      method: 'POST',
      body: JSON.stringify({ targetType, targetId, reason }),
    });
  },
  blockUser: async (blockedWallet: string) => {
    return request<{ success: boolean }>(`/moderation/block`, {
      method: 'POST',
      body: JSON.stringify({ blockedWallet }),
    });
  },

  // Activity
  getActivity: async (): Promise<ActivityNotification[]> => {
    const res = await request<any>(`/activity`);
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.activity)) return res.activity;
    return [];
  },
};
