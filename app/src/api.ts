import { Take, Comment, Challenge, Counteroffer, Duel, Receipt, User, Rivalry, ActivityNotification } from './types';

export const PUBLIC_API_URL = 'https://0aa4526759d73199-102-88-168-51.serveousercontent.com/api';
export const API_BASE_URL = 'http://10.0.2.2:3001/api';
export const LOCAL_API_URL = 'http://localhost:3001/api';

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

  // Try public HTTPS first (physical devices/remote), then Android emulator IP, then localhost
  const targetUrls = [PUBLIC_API_URL, API_BASE_URL, LOCAL_API_URL];
  let lastErr: any = null;

  for (const baseUrl of targetUrls) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error ${response.status}`);
      }
      return data as T;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(`Network request failed to all endpoints (${endpoint}): ${lastErr?.message || lastErr}`);
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
  getTakes: async (category?: string) => {
    const query = category ? `?category=${category}` : '';
    return request<Take[]>(`/takes${query}`);
  },
  getTake: async (id: string) => {
    return request<Take & { comments: Comment[]; duels: Duel[] }>(`/takes/${id}`);
  },
  createTake: async (topic: string, content: string, category: string) => {
    return request<Take>(`/takes`, {
      method: 'POST',
      body: JSON.stringify({ topic, content, category }),
    });
  },
  addComment: async (takeId: string, content: string) => {
    return request<Comment>(`/takes/${takeId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  // Challenges & Negotiation
  getChallenges: async () => {
    return request<Challenge[]>(`/challenges`);
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
    return request<Challenge>(`/challenges`, {
      method: 'POST',
      body: JSON.stringify(data),
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
  getDuels: async (options: { isArena?: boolean; category?: string; status?: string } = {}) => {
    const params = new URLSearchParams();
    if (options.isArena) params.append('isArena', '1');
    if (options.category) params.append('category', options.category);
    if (options.status) params.append('status', options.status);
    return request<Duel[]>(`/duels?${params.toString()}`);
  },
  getDuel: async (id: string) => {
    return request<Duel & { positions: any[]; myPosition?: any }>(`/duels/${id}`);
  },
  initOnChainDuel: async (duelId: string, onchainDuelPda: string, onchainVaultPda: string, termsHash: string) => {
    return request<{ success: boolean; duel: Duel }>(`/duels/${duelId}/init-onchain`, {
      method: 'POST',
      body: JSON.stringify({ onchainDuelPda, onchainVaultPda, termsHash }),
    });
  },
  recordStake: async (duelId: string, side: 1 | 2, stakeAmount: number, positionPda?: string) => {
    return request<{ success: boolean; duel: Duel; position: any }>(`/duels/${duelId}/stake`, {
      method: 'POST',
      body: JSON.stringify({ side, stakeAmount, positionPda }),
    });
  },
  resolveDuel: async (duelId: string) => {
    return request<any>(`/duels/${duelId}/resolve`, {
      method: 'POST',
    });
  },
  publishToArena: async (duelId: string) => {
    return request<{ success: boolean; isArena: number; skrStake: number }>(`/duels/${duelId}/publish-arena`, {
      method: 'POST',
    });
  },

  // Faucet
  claimFaucet: async () => {
    return request<{ success: boolean; amount: number; txSignature: string; message: string }>(`/faucet/cusd`, {
      method: 'POST',
    });
  },

  // Receipts
  getReceipt: async (id: string) => {
    return request<Receipt>(`/receipts/${id}`);
  },
  getUserReceipts: async (wallet: string) => {
    return request<Receipt[]>(`/receipts/user/${wallet}`);
  },

  // Users & Profiles
  getUserProfile: async (wallet: string) => {
    return request<User & { stats: any }>(`/users/${wallet}`);
  },
  getRivalry: async (wallet: string, opponentWallet: string) => {
    return request<Rivalry>(`/users/${wallet}/rivalry/${opponentWallet}`);
  },
  updateProfile: async (data: Partial<User>) => {
    return request<User>(`/users/profile`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
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
  getActivity: async () => {
    return request<ActivityNotification[]>(`/activity`);
  },
};
