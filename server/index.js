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
// Raised body cap for base64 avatar uploads (server enforces a 1.5 MB
// decoded-file ceiling and magic-byte type check in server/profile.js).
app.use(express.json({ limit: '3mb' }));

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPublicSharePage({ title, description, badge, deepLink, canonicalUrl, heading, body }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeBadge = escapeHtml(badge);
  const safeDeepLink = escapeHtml(deepLink);
  const safeCanonicalUrl = escapeHtml(canonicalUrl);
  const safeHeading = escapeHtml(heading);
  const safeBody = escapeHtml(body);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}"/>
  <link rel="canonical" href="${safeCanonicalUrl}"/>
  <meta property="og:title" content="${safeTitle}"/>
  <meta property="og:description" content="${safeDescription}"/>
  <meta property="og:type" content="article"/>
  <meta property="og:site_name" content="Counter"/>
  <meta property="og:url" content="${safeCanonicalUrl}"/>
  <meta property="al:android:url" content="${safeDeepLink}"/>
  <meta property="al:android:package" content="app.counter.mobile"/>
  <meta property="al:android:app_name" content="Counter"/>
  <style>
    body { background: #0b0c10; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #161922; border: 1px solid #2a2e3d; border-radius: 20px; padding: 28px; max-width: 520px; width: 100%; box-shadow: 0 12px 32px rgba(0,0,0,0.6); }
    .badge { display: inline-block; padding: 5px 12px; background: rgba(255,114,94,0.14); color: #ff725e; border-radius: 20px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 16px; }
    h1 { font-size: 25px; margin: 0 0 12px; line-height: 1.25; }
    p { color: #c4c7d0; font-size: 16px; margin: 0 0 24px; line-height: 1.55; white-space: pre-wrap; }
    .btn { display: block; background: #ff725e; color: #101116; text-decoration: none; padding: 14px 20px; border-radius: 12px; font-weight: 800; font-size: 16px; text-align: center; }
    .brand { color: #ff725e; font-size: 12px; font-weight: 900; letter-spacing: .18em; margin-top: 22px; }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">${safeBadge}</div>
    <h1>${safeHeading}</h1>
    <p>${safeBody}</p>
    <a href="${safeDeepLink}" class="btn">Open in Counter</a>
    <div class="brand">COUNTER</div>
  </main>
</body>
</html>`;
}

// Public Take preview. The API remains the canonical object read for the
// installed app; this document is only a useful web/share landing page.
app.get('/t/:id', (req, res) => {
  const { queryOne } = require('./db');
  const id = String(req.params.id || '');
  const take = queryOne(
    `SELECT t.id, t.topic, t.content, t.status, t.created_at,
            u.handle AS author_handle, u.display_name AS author_name
       FROM takes t
       LEFT JOIN users u ON t.author_wallet = u.wallet_address
      WHERE t.id = ? AND t.status = 'ACTIVE'`,
    [id],
  );
  const canonicalUrl = `https://counter.103-195-188-198.sslip.io/t/${encodeURIComponent(id)}`;
  const deepLink = `counter://take/${encodeURIComponent(id)}`;
  const author = take?.author_name || (take?.author_handle ? `@${String(take.author_handle).replace(/^@/, '')}` : 'a Counter user');
  const takeText = String(take?.content || take?.topic || 'A Counter Take').trim();
  const title = take ? `${take.topic || takeText} | Counter Take` : 'Counter Take';
  const description = take
    ? `${author} posted this Take on Counter. Think they're wrong? Challenge this Take.`
    : 'A social Take on Counter.';
  const body = take
    ? `${author}\n\n${takeText}\n\nThink they're wrong? Challenge this Take.`
    : 'This Take is unavailable or has been removed.';
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120' });
  res.send(renderPublicSharePage({
    title,
    description,
    badge: 'Counter Take',
    deepLink,
    canonicalUrl,
    heading: take ? String(take.topic || takeText) : 'Take unavailable',
    body,
  }));
});

// Digital Asset Links for Android App Links Verification
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'app.counter.mobile',
        sha256_cert_fingerprints: [
          'A1:1B:E6:43:07:AE:1E:F3:67:36:2D:5B:32:D0:0B:C4:32:18:FE:AB:FC:91:D6:8C:EA:F2:7C:B4:6F:7D:78:27',
          '3A:B2:8E:39:97:B7:E3:C0:F0:95:AA:EC:CB:C9:B8:86:69:4A:DC:74:F4:AB:7C:3A:37:44:63:E4:BC:FB:FF:25',
          'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C'
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
    `SELECT d.*, ua.handle as cap_a_handle, ua.display_name as cap_a_name,
            ub.handle as cap_b_handle, ub.display_name as cap_b_name,
            t.topic as take_topic
     FROM duels d 
     LEFT JOIN users ua ON d.captain_a_wallet = ua.wallet_address 
     LEFT JOIN users ub ON d.captain_b_wallet = ub.wallet_address 
     LEFT JOIN takes t ON d.take_id = t.id
     WHERE d.id = ? OR d.share_slug = ?`,
    [slug, slug]
  );

  const captainA = duel?.cap_a_name || (duel?.cap_a_handle ? `@${String(duel.cap_a_handle).replace(/^@/, '')}` : 'Captain A');
  const captainB = duel?.cap_b_name || (duel?.cap_b_handle ? `@${String(duel.cap_b_handle).replace(/^@/, '')}` : 'Captain B');
  const titleRaw = duel ? `${captainA} vs ${captainB} | Counter Duel` : 'Counter Duel';
  const descRaw = duel
    ? `${duel.take_topic || 'A Counter Duel'} · ${duel.proposition_a || 'Side A'} vs ${duel.proposition_b || 'Side B'} · ${duel.status || 'Duel'} · ${(Number(duel.side_a_total) || 0) + (Number(duel.side_b_total) || 0)} cUSD pool.`
    : 'A social Duel on Counter.';
  const title = escapeHtml(titleRaw);
  const desc = escapeHtml(descRaw);
  const publicId = encodeURIComponent(String(duel?.share_slug || slug));
  const canonicalUrl = `https://counter.103-195-188-198.sslip.io/d/${publicId}`;
  const deepLink = `counter://duel/${publicId}`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <meta name="description" content="${desc}"/>
  <link rel="canonical" href="${canonicalUrl}"/>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${desc}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:site_name" content="Counter"/>
  <meta property="og:url" content="${canonicalUrl}"/>
  <meta property="al:android:url" content="${deepLink}"/>
  <meta property="al:android:package" content="app.counter.mobile"/>
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
    <div class="badge">⚔️ Counter Duel</div>
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
    `SELECT r.*, d.proposition_a, d.proposition_b,
            ua.handle as captain_a_handle, ua.display_name as captain_a_name,
            ub.handle as captain_b_handle, ub.display_name as captain_b_name
     FROM receipts r 
     LEFT JOIN duels d ON r.duel_id = d.id 
     LEFT JOIN users ua ON r.captain_a_wallet = ua.wallet_address
     LEFT JOIN users ub ON r.captain_b_wallet = ub.wallet_address
     WHERE r.id = ? OR r.duel_id = ?`,
    [id, id]
  );

  const captainA = receipt?.captain_a_name || (receipt?.captain_a_handle ? `@${String(receipt.captain_a_handle).replace(/^@/, '')}` : 'Captain A');
  const captainB = receipt?.captain_b_name || (receipt?.captain_b_handle ? `@${String(receipt.captain_b_handle).replace(/^@/, '')}` : 'Captain B');
  const titleRaw = receipt ? `Counter Receipt · ${captainA} vs ${captainB}` : 'Counter Receipt';
  const descRaw = receipt
    ? `${receipt.resolution_summary || 'Final result recorded'}. ${Number(receipt.total_pool || 0).toFixed(2)} cUSD total outcome. Permanent proof on Counter.`
    : 'Permanent Counter receipt proof.';
  const title = escapeHtml(titleRaw);
  const desc = escapeHtml(descRaw);
  const publicId = encodeURIComponent(String(id));
  const canonicalUrl = `https://counter.103-195-188-198.sslip.io/r/${publicId}`;
  const deepLink = `counter://receipt/${publicId}`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <meta name="description" content="${desc}"/>
  <link rel="canonical" href="${canonicalUrl}"/>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${desc}"/>
  <meta property="og:type" content="article"/>
  <meta property="og:site_name" content="Counter"/>
  <meta property="og:url" content="${canonicalUrl}"/>
  <meta property="al:android:url" content="${deepLink}"/>
  <meta property="al:android:package" content="app.counter.mobile"/>
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
    <div class="badge">🏆 Counter Receipt</div>
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
