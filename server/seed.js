const crypto = require('crypto');
const { getDb, queryOne, execute } = require('./db');

async function seedDatabase() {
  await getDb();

  // Demo seeding is strictly opt-in. Production must never resurrect demo
  // rows on boot: an empty takes table means "clean", not "please seed".
  // Set SEED_DEMO_CONTENT=1 only in throwaway local/dev environments.
  if (process.env.SEED_DEMO_CONTENT !== '1') {
    console.log('[SEED] Demo seeding disabled (SEED_DEMO_CONTENT is not 1). Skipping.');
    return;
  }

  const existingTake = queryOne(`SELECT COUNT(*) as count FROM takes`);
  if (existingTake && existingTake.count > 0) {
    console.log('[SEED] Database already contains initial data. Skipping seed.');
    return;
  }

  console.log('[SEED] Populating initial Counter social network data...');

  const now = new Date();
  const pastHour = new Date(now.getTime() - 3600000).toISOString();
  const pastDay = new Date(now.getTime() - 86400000).toISOString();

  // 1. Seed Contenders
  const users = [
    {
      wallet: '3ZtkjCxPTKcEb9T4yWhCArGYbm1D7xqFdMmGXPpzjkv7',
      handle: 'sol_maximalist',
      name: 'Mert (Devnet)',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      bio: 'Solana Mobile builder. High throughput or nothing. ⚔️',
      skrStake: 0,
      arenaEligible: 0,
    },
    {
      wallet: 'ES6ZS6JVCgqBzTf3g9qcUrE8cJ7KProAPNbuUEGKzRQp',
      handle: 'seeker_whale',
      name: 'Seeker Titan (Mainnet Staker)',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      bio: 'Verified 791k SKR Staker. Arena Contender. 🏆',
      skrStake: 791399.49,
      arenaEligible: 1,
    },
    {
      wallet: '2w8i2VfEw5k1K3d5N2B3a7c8j9k0l1m2n3o4p5q6r7s8',
      handle: 'premier_pundit',
      name: 'Marcus Sterling',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      bio: 'EPL & Champions League analyst. Duels settled by official scores.',
      skrStake: 500,
      arenaEligible: 1,
    },
    {
      wallet: '4x9k8j7h6g5f4d3s2a1q0w9e8r7t6y5u4i3o2p1z9x8c',
      handle: 'weather_oracle',
      name: 'Dr. Clara Rain',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      bio: 'Atmospheric scientist & on-chain rainfall prophet.',
      skrStake: 0,
      arenaEligible: 0,
    },
  ];

  for (const u of users) {
    execute(
      `INSERT OR REPLACE INTO users (wallet_address, handle, display_name, avatar_url, bio, skr_staked_amount, is_arena_eligible, is_age_verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [u.wallet, u.handle, u.name, u.avatar, u.bio, u.skrStake, u.arenaEligible, pastDay]
    );
  }

  // 2. Seed Takes
  const takes = [
    {
      id: 'take_sol_breakout',
      author: '3ZtkjCxPTKcEb9T4yWhCArGYbm1D7xqFdMmGXPpzjkv7',
      topic: 'SOL / USD Q4 Price Action',
      content: 'Solana is smashing through $150 before the end of the week. Breakout structure is undeniable on 4H candles.',
      category: 'crypto',
      created: pastDay,
    },
    {
      id: 'take_liverpool_derby',
      author: '2w8i2VfEw5k1K3d5N2B3a7c8j9k0l1m2n3o4p5q6r7s8',
      topic: 'Premier League Matchday',
      content: 'Liverpool will defeat Tottenham at Anfield this weekend. Slot ball is impenetrable right now.',
      category: 'sports',
      created: pastDay,
    },
    {
      id: 'take_london_rain',
      author: '4x9k8j7h6g5f4d3s2a1q0w9e8r7t6y5u4i3o2p1z9x8c',
      topic: 'London Weather Front',
      content: 'Over 2.0mm precipitation hitting Central London today. Radar shows heavy convective clouds.',
      category: 'weather',
      created: pastHour,
    },
  ];

  for (const t of takes) {
    execute(
      `INSERT OR REPLACE INTO takes (id, author_wallet, topic, content, category, created_at, status, likes_count, comments_count, duels_count, record_origin)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 12, 4, 1, 'DEMO')`,
      [t.id, t.author, t.topic, t.content, t.category, t.created]
    );
  }

  // 3. Seed Duels (Crypto, Sports, Weather, and Arena)
  const duels = [
    {
      id: 'duel_sol_125',
      onchainDuelId: '4a8f9c1e2b3d4e5f6a7b8c9d0e1f2a3b',
      challengeId: 'chal_sol_125',
      takeId: 'take_sol_breakout',
      captainA: '3ZtkjCxPTKcEb9T4yWhCArGYbm1D7xqFdMmGXPpzjkv7',
      captainB: 'ES6ZS6JVCgqBzTf3g9qcUrE8cJ7KProAPNbuUEGKzRQp',
      sideA: 75,
      sideB: 50,
      termsHash: crypto.createHash('sha256').update('SOL >= $125 USD on CoinGecko').digest('hex'),
      propA: 'SOL price >= $125.00 USD',
      propB: 'SOL price < $125.00 USD',
      category: 'crypto',
      sourceType: 'coingecko',
      sourceConfig: JSON.stringify({ assetId: 'solana', targetPriceUsd: 125, operator: '>=' }),
      cutoffTs: Math.floor(Date.now() / 1000) + 3600,
      resolutionTs: Math.floor(Date.now() / 1000) + 7200,
      status: 'ACCEPTING_STAKES',
      isArena: 1, // Staked seeker whale is Captain B
      shareSlug: 'sol125',
      created: pastHour,
    },
    {
      id: 'duel_liv_tot',
      onchainDuelId: '1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e',
      challengeId: 'chal_liv_tot',
      takeId: 'take_liverpool_derby',
      captainA: '2w8i2VfEw5k1K3d5N2B3a7c8j9k0l1m2n3o4p5q6r7s8',
      captainB: '3ZtkjCxPTKcEb9T4yWhCArGYbm1D7xqFdMmGXPpzjkv7',
      sideA: 100,
      sideB: 80,
      termsHash: crypto.createHash('sha256').update('Liverpool vs Tottenham TheSportsDB').digest('hex'),
      propA: 'Liverpool Wins (Home)',
      propB: 'Tottenham Wins or Draw (Away/Draw)',
      category: 'sports',
      sourceType: 'thesportsdb',
      sourceConfig: JSON.stringify({ eventId: '441613', homeTeam: 'Liverpool', awayTeam: 'Tottenham', targetSide: 'home' }),
      cutoffTs: Math.floor(Date.now() / 1000) + 5400,
      resolutionTs: Math.floor(Date.now() / 1000) + 9000,
      status: 'ACCEPTING_STAKES',
      isArena: 0,
      shareSlug: 'livtot',
      created: pastHour,
    },
    {
      id: 'duel_london_rain',
      onchainDuelId: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c',
      challengeId: 'chal_london_rain',
      takeId: 'take_london_rain',
      captainA: '4x9k8j7h6g5f4d3s2a1q0w9e8r7t6y5u4i3o2p1z9x8c',
      captainB: 'ES6ZS6JVCgqBzTf3g9qcUrE8cJ7KProAPNbuUEGKzRQp',
      sideA: 50,
      sideB: 50,
      termsHash: crypto.createHash('sha256').update('London Rain >= 0.1mm OpenMeteo').digest('hex'),
      propA: 'London Rainfall >= 0.1mm',
      propB: 'London Rainfall < 0.1mm',
      category: 'weather',
      sourceType: 'open-meteo',
      sourceConfig: JSON.stringify({ latitude: 51.5074, longitude: -0.1278, city: 'London', condition: 'rain', threshold: 0.1 }),
      cutoffTs: Math.floor(Date.now() / 1000) + 1800,
      resolutionTs: Math.floor(Date.now() / 1000) + 3600,
      status: 'ACCEPTING_STAKES',
      isArena: 1,
      shareSlug: 'lonrain',
      created: pastHour,
    },
    {
      id: 'duel_resolved_historical',
      onchainDuelId: '52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT',
      challengeId: 'chal_hist_1',
      takeId: 'take_sol_breakout',
      captainA: '3ZtkjCxPTKcEb9T4yWhCArGYbm1D7xqFdMmGXPpzjkv7',
      captainB: 'ES6ZS6JVCgqBzTf3g9qcUrE8cJ7KProAPNbuUEGKzRQp',
      sideA: 75,
      sideB: 50,
      termsHash: crypto.createHash('sha256').update('SOL >= $125 Devnet Verified').digest('hex'),
      propA: 'SOL price >= $125.00 USD',
      propB: 'SOL price < $125.00 USD',
      category: 'crypto',
      sourceType: 'coingecko',
      sourceConfig: JSON.stringify({ assetId: 'solana', targetPriceUsd: 125, operator: '>=' }),
      cutoffTs: Math.floor(Date.now() / 1000) - 3600,
      resolutionTs: Math.floor(Date.now() / 1000) - 1800,
      status: 'RESOLVED_SIDE_A',
      winningSide: 1,
      resolutionData: JSON.stringify({ source: 'CoinGecko API', observedPrice: 154.20, targetPrice: 125.00 }),
      resolutionTx: '2q2yzFAr4Zn5riBf9KzUqcUrPohfUNHR7D7xdRkX7SmgAqfe17VT8Maq8cs49zdym9St5oBWwxWdghZqjgDHhvzf',
      isArena: 1,
      shareSlug: 'solwon',
      created: pastDay,
    },
  ];

  for (const d of duels) {
    execute(
      `INSERT OR REPLACE INTO duels (
        id, onchain_duel_id, challenge_id, take_id, captain_a_wallet, captain_b_wallet,
        side_a_total, side_b_total, terms_hash, proposition_a, proposition_b, category,
        source_type, source_config, cutoff_ts, resolution_ts, status, winning_side,
        resolution_data, resolution_tx, is_arena, share_slug, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.id,
        d.onchainDuelId,
        d.challengeId,
        d.takeId,
        d.captainA,
        d.captainB,
        d.sideA,
        d.sideB,
        d.termsHash,
        d.propA,
        d.propB,
        d.category,
        d.sourceType,
        d.sourceConfig,
        d.cutoffTs,
        d.resolutionTs,
        d.status,
        d.winningSide || 0,
        d.resolutionData || null,
        d.resolutionTx || null,
        d.isArena,
        d.shareSlug,
        d.created,
      ]
    );
  }

  // 4. Seed Resolved Receipt
  execute(
    `INSERT OR REPLACE INTO receipts (
      id, duel_id, take_id, captain_a_wallet, captain_b_wallet, winner_wallet,
      total_pool, resolution_summary, resolution_evidence, onchain_signature, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'receipt_duel_resolved_historical',
      'duel_resolved_historical',
      'take_sol_breakout',
      '3ZtkjCxPTKcEb9T4yWhCArGYbm1D7xqFdMmGXPpzjkv7',
      'ES6ZS6JVCgqBzTf3g9qcUrE8cJ7KProAPNbuUEGKzRQp',
      '3ZtkjCxPTKcEb9T4yWhCArGYbm1D7xqFdMmGXPpzjkv7',
      125.00,
      'SOL observed at $154.20 USD (Target: >= $125.00). Side A Won with 1.66x Parimutuel Multiple.',
      JSON.stringify({ source: 'CoinGecko API', asset: 'solana', observedPrice: 154.20, targetPrice: 125 }),
      '2q2yzFAr4Zn5riBf9KzUqcUrPohfUNHR7D7xdRkX7SmgAqfe17VT8Maq8cs49zdym9St5oBWwxWdghZqjgDHhvzf',
      pastDay,
    ]
  );

  console.log('[SEED] Counter social network seeding complete!');
}

module.exports = { seedDatabase };
