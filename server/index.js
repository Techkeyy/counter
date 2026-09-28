require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getDb } = require('./db');
const { seedDatabase } = require('./seed');

const authRoutes = require('./routes/auth');
const takesRoutes = require('./routes/takes');
const challengesRoutes = require('./routes/challenges');
const duelsRoutes = require('./routes/duels');
const receiptsRoutes = require('./routes/receipts');
const usersRoutes = require('./routes/users');
const moderationRoutes = require('./routes/moderation');
const activityRoutes = require('./routes/activity');
const faucetRoutes = require('./routes/faucet');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Counter Social Backend',
    time: new Date().toISOString(),
    network: {
      wagerAsset: 'Devnet cUSD (SPL Token)',
      skrGating: 'Solana Mainnet-Beta',
      escrowProgram: process.env.PROGRAM_ID || '52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT',
    },
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/takes', takesRoutes);
app.use('/api/challenges', challengesRoutes);
app.use('/api/duels', duelsRoutes);
app.use('/api/receipts', receiptsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/faucet', faucetRoutes);

// Android App Links verification
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'app.counter.mobile',
        sha256_cert_fingerprints: [
          'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
        ],
      },
    },
  ]);
});

// Web Preview for Shared Duels /d/:id
app.get('/d/:id', (req, res) => {
  const duelId = req.params.id;
  const { queryOne } = require('./db');
  const duel = queryOne(
    `SELECT d.*, ua.display_name as captain_a_name, ub.display_name as captain_b_name
     FROM duels d
     LEFT JOIN users ua ON d.captain_a_wallet = ua.wallet_address
     LEFT JOIN users ub ON d.captain_b_wallet = ub.wallet_address
     WHERE d.id = ?`,
    [duelId]
  );

  if (!duel) {
    return res.status(404).send('<h1>⚔️ Duel Not Found</h1><p>This duel does not exist or has expired.</p>');
  }

  const poolA = Number(duel.side_a_total) || 0;
  const poolB = Number(duel.side_b_total) || 0;
  const totalPool = poolA + poolB;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚔️ Counter Duel: ${duel.captain_a_name || 'Captain A'} vs ${duel.captain_b_name || 'Captain B'}</title>
  <meta property="og:title" content="⚔️ 1v1 Duel: ${duel.proposition_a} vs ${duel.proposition_b}">
  <meta property="og:description" content="Back your side in this high-stakes 1v1 duel on Counter! Total Backer Pool: $${totalPool} cUSD.">
  <meta property="og:type" content="website">
  <meta name="theme-color" content="#0E1117">
  <style>
    body {
      background: #0E1117;
      color: #F0F6FC;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .card {
      background: #161B22;
      border: 1px solid #30363D;
      border-radius: 20px;
      max-width: 480px;
      width: 100%;
      padding: 28px;
      box-shadow: 0 12px 36px rgba(0,0,0,0.5);
    }
    .tag {
      display: inline-block;
      background: rgba(88, 166, 255, 0.15);
      color: #58A6FF;
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 12px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    .title {
      font-size: 18px;
      font-weight: 800;
      margin: 0 0 16px 0;
      line-height: 1.4;
    }
    .side-box {
      background: #21262D;
      border: 1px solid #30363D;
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .side-a { border-left: 4px solid #3FB950; }
    .side-b { border-left: 4px solid #58A6FF; }
    .author { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
    .prop { font-size: 14px; color: #F0F6FC; font-style: italic; line-height: 1.4; }
    .pool { font-size: 12px; color: #8B949E; margin-top: 6px; font-weight: 600; }
    .btn {
      display: block;
      width: 100%;
      background: #3FB950;
      color: #000;
      text-align: center;
      padding: 14px 0;
      border-radius: 14px;
      font-weight: 800;
      text-decoration: none;
      font-size: 15px;
      margin-top: 20px;
      box-sizing: border-box;
    }
    .subtext {
      text-align: center;
      font-size: 12px;
      color: #6E7681;
      margin-top: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="tag">⚔️ ${duel.category} DUEL</span>
    <h1 class="title">${duel.captain_a_name || 'Captain A'} vs ${duel.captain_b_name || 'Captain B'}</h1>
    
    <div class="side-box side-a">
      <div class="author" style="color: #3FB950;">${duel.captain_a_name || 'Captain A'} (Side A)</div>
      <div class="prop">"${duel.proposition_a}"</div>
      <div class="pool">$${poolA} cUSD backed</div>
    </div>

    <div class="side-box side-b">
      <div class="author" style="color: #58A6FF;">${duel.captain_b_name || 'Captain B'} (Side B)</div>
      <div class="prop">"${duel.proposition_b}"</div>
      <div class="pool">$${poolB} cUSD backed</div>
    </div>

    <a href="counter://duel/${duel.id}" class="btn">⚡ OPEN & BACK IN COUNTER APP</a>
    <div class="subtext">Solana Mobile CLOCK IN Hackathon 2026 • Parimutuel Devnet Escrow</div>
  </div>
</body>
</html>`;

  res.send(html);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

async function start() {
  await getDb();
  await seedDatabase();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 Counter Social Backend running on http://localhost:${PORT}`);
    console.log(`📡 Devnet Program ID: ${process.env.PROGRAM_ID || '52QgqEmxZzh2EH1gAwheMmp2ZXd9eT3WuXefSLYu6NmT'}`);
    console.log(`⚔️ SKR Arena Gateway: Active (Mainnet Stake Qualification)`);
    console.log(`=======================================================`);
  });
}

start().catch((err) => {
  console.error('Fatal backend startup error:', err);
  process.exit(1);
});
