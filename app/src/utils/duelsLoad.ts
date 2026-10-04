export interface DuelsScreenData<DuelItem, ChallengeItem, PortfolioValue> {
  duels: DuelItem[];
  challenges: ChallengeItem[];
  portfolio: PortfolioValue | null;
  portfolioUnavailable: boolean;
}

/**
 * Load the independent read paths used by the Duels home. The base Duel list
 * and challenge inbox are required for a truthful Incoming/Sent/Active view;
 * portfolio is an auxiliary chain-balance read used only for Claimable and
 * Completed. A transient RPC failure in that auxiliary path must not turn an
 * otherwise successful empty Duels response into a screen-level error.
 */
export async function loadDuelsScreenData<DuelItem, ChallengeItem, PortfolioValue>(
  getDuels: () => Promise<DuelItem[]>,
  getChallenges: () => Promise<ChallengeItem[]>,
  getPortfolio: () => Promise<PortfolioValue>,
  authenticated: boolean,
): Promise<DuelsScreenData<DuelItem, ChallengeItem, PortfolioValue>> {
  const [duelsResult, challengesResult, portfolioResult] = await Promise.allSettled([
    getDuels(),
    authenticated ? getChallenges() : Promise.resolve([] as ChallengeItem[]),
    authenticated ? getPortfolio() : Promise.resolve(null as PortfolioValue | null),
  ]);

  if (duelsResult.status === 'rejected') throw duelsResult.reason;
  if (challengesResult.status === 'rejected') throw challengesResult.reason;

  return {
    duels: Array.isArray(duelsResult.value) ? duelsResult.value : [],
    challenges: Array.isArray(challengesResult.value) ? challengesResult.value : [],
    portfolio: portfolioResult.status === 'fulfilled' ? portfolioResult.value : null,
    portfolioUnavailable: portfolioResult.status === 'rejected',
  };
}
