import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import faceRoutes from './routes/face.js';
import companyRoutes from './routes/companies.js';
import examRoutes from './routes/exam.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' })); // snapshots are base64 JPEGs in the JSON body

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Temporary debug endpoint — remove after confirming env vars work on Vercel
app.get('/api/debug-env', (_req, res) => res.json({
  hasMongoUri: !!process.env.MONGODB_URI,
  hasJwtSecret: !!process.env.JWT_SECRET,
  nodeEnv: process.env.NODE_ENV || 'not set',
}));

app.use('/api/auth', authRoutes);
app.use('/api/face', faceRoutes);
app.use('/api', companyRoutes);
app.use('/api/exam', examRoutes);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('API Error:', err);
  const message = err.message || 'internal_error';
  res.status(500).json({ error: 'internal_error', detail: message });
});

export default app;
