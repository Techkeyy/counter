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
