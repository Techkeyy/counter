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

// Digital Asset Links for Android App Links Verification
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.counter.app',
        sha256_cert_fingerprints: [
          '3A:7E:F2:26:5B:5E:6E:88:F3:6D:44:49:89:4C:4E:C8:68:95:C1:CC:88:53:0F:19:51:4E:E4:F7:16:A1:5A:99',
          'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
          '18:27:0B:CA:8D:18:2A:FD:51:57:4E:59:71:BC:B6:CD:C9:46:75:FA:AE:20:FE:CF:9B:E6:E5:5A:1C:EC:BE:C9',
        ],
      },
    },
  ]);
});

// Shared Duel Web Preview with OpenGraph & Android App Links Deep Link
app.get('/d/:slug', async (req, res) => {
  const { queryOne } = require('./db');
  const slug = req.params.slug;
  const duel = queryOne(
    `SELECT d.*, ua.handle as cap_a_handle, ub.handle as cap_b_handle 
     FROM duels d 
     LEFT JOIN users ua ON d.captain_a_wallet = ua.wallet_address 
     LEFT JOIN users ub ON d.captain_b_wallet = ub.wallet_address 
     WHERE d.id = ? OR d.share_slug = ?`,
    [slug, slug]
  );

  const title = duel ? `${duel.proposition_a} vs ${duel.proposition_b} | Counter Duel` : 'Live 1v1 Prediction Duel | Counter';
  const desc = duel 
    ? `Total Pool: $${(Number(duel.side_a_total) || 0) + (Number(duel.side_b_total) || 0)} cUSD. Back side A or B on Solana Mobile.`
    : 'Back takes with real capital on Solana Mobile.';
  const deepLink = `counter://duel/${slug}`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${desc}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:site_name" content="Counter Solana"/>
  <meta property="al:android:url" content="${deepLink}"/>
  <meta property="al:android:package" content="com.counter.app"/>
  <meta property="al:android:app_name" content="Counter"/>
  <style>
    body { background: #0b0c10; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #161922; border: 1px solid #2a2e3d; border-radius: 16px; padding: 28px; max-width: 480px; width: 100%; box-shadow: 0 12px 32px rgba(0,0,0,0.6); text-align: center; }
    .badge { display: inline-block; padding: 4px 12px; background: rgba(99,102,241,0.2); color: #818cf8; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 16px; }
    h1 { font-size: 22px; margin: 0 0 12px 0; line-height: 1.3; }
    p { color: #9ca3af; font-size: 15px; margin: 0 0 24px 0; line-height: 1.5; }
    .btn { display: block; background: #6366f1; color: #ffffff; text-decoration: none; padding: 14px 20px; border-radius: 10px; font-weight: bold; font-size: 16px; transition: background 0.2s; margin-bottom: 12px; }
    .btn:hover { background: #4f46e5; }
    .btn-secondary { background: #232734; color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">⚔️ 1v1 Solana Duel</div>
    <h1>${title}</h1>
    <p>${desc}</p>
    <a href="${deepLink}" class="btn">⚡ Open in Counter App</a>
    <a href="/api/health" class="btn btn-secondary">Backend Status</a>
  </div>
</body>
</html>`);
});

// Shared Receipt Web Preview with OpenGraph & Android Deep Link
app.get('/r/:id', async (req, res) => {
  const { queryOne } = require('./db');
  const id = req.params.id;
  const receipt = queryOne(
    `SELECT r.*, d.proposition_a, d.proposition_b 
     FROM receipts r 
     LEFT JOIN duels d ON r.duel_id = d.id 
     WHERE r.id = ? OR r.duel_id = ?`,
    [id, id]
  );

  const title = receipt ? `⚔️ Settlement Receipt: Winner ${receipt.winner_wallet.slice(0, 6)}...` : 'Settlement Receipt | Counter';
  const desc = receipt 
    ? `Total Pool: $${receipt.total_pool} cUSD. Resolved: ${receipt.resolution_summary}. Tx: ${receipt.onchain_signature}`
    : 'Permanent on-chain settlement receipt on Solana.';
  const deepLink = `counter://receipt/${id}`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${desc}"/>
  <meta property="og:type" content="article"/>
  <meta property="og:site_name" content="Counter Solana"/>
  <meta property="al:android:url" content="${deepLink}"/>
  <meta property="al:android:package" content="com.counter.app"/>
  <meta property="al:android:app_name" content="Counter"/>
  <style>
    body { background: #0b0c10; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #161922; border: 1px solid #10b981; border-radius: 16px; padding: 28px; max-width: 480px; width: 100%; box-shadow: 0 12px 32px rgba(0,0,0,0.6); text-align: center; }
    .badge { display: inline-block; padding: 4px 12px; background: rgba(16,185,129,0.2); color: #10b981; border-radius: 20px; font-size: 12px; font-weight: bold; margin-bottom: 16px; }
    h1 { font-size: 22px; margin: 0 0 12px 0; }
    p { color: #9ca3af; font-size: 15px; margin: 0 0 24px 0; }
    .btn { display: block; background: #10b981; color: #ffffff; text-decoration: none; padding: 14px 20px; border-radius: 10px; font-weight: bold; font-size: 16px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🏆 Verified Settlement Receipt</div>
    <h1>${title}</h1>
    <p>${desc}</p>
    <a href="${deepLink}" class="btn">⚡ Open in Counter App</a>
  </div>
</body>
</html>`);
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
