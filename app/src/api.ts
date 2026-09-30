import { Take, Comment, Challenge, Counteroffer, Duel, Receipt, User, Rivalry, ActivityNotification } from './types';

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

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP error ${response.status}`);
  }
  return data as T;
}

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
  getDuel: async (id: string): Promise<Duel & { positions: any[]; myPosition?: any }> => {
    const res = await request<any>(`/duels/${id}`);
    if (res && res.duel) {
      return {
        ...res.duel,
        positions: Array.isArray(res.positions) ? res.positions : [],
        myPosition: res.myPosition || null,
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
  updateProfile: async (data: Partial<User>) => {
    const res = await request<any>(`/users/profile`, {
      method: 'PUT',
      body: JSON.stringify(data),
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
