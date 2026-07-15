import express from 'express';
import { ObjectId } from 'mongodb';
import { getDb, getSnapshotBucket } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { isValidEmbedding, euclideanDistance, THRESHOLD } from '../lib/faceMatch.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = express.Router();

const ROUND_ORDER = ['technical', 'personal', 'hr'];
const MAX_FACE_GATE_ATTEMPTS = 3;
const ACTIVE_STATUSES = ['face_gate_pending', 'pending_manual_review', 'in_progress'];
const GATE_PENDING_STATUSES = ['face_gate_pending', 'pending_manual_review'];

function toSessionDto(s) {
  return {
    id: s._id.toString(),
    userId: s.userId.toString(),
    companyId: s.companyId.toString(),
    status: s.status,
    currentRound: s.currentRound ?? null,
    faceGateAttempts: s.faceGateAttempts,
    integrityScore: s.integrityScore,
    technicalPct: s.technicalPct ?? null,
    personalPct: s.personalPct ?? null,
    hrPct: s.hrPct ?? null,
    overallPct: s.overallPct ?? null,
  };
}

const loadOwnedSession = asyncHandler(async (req, res, next) => {
  let sessionId;
  try {
    sessionId = new ObjectId(req.params.id);
  } catch {
    return res.status(400).json({ error: 'invalid_session' });
  }
  const db = await getDb();
  const session = await db.collection('examSessions').findOne({ _id: sessionId });
  if (!session) return res.status(404).json({ error: 'invalid_session' });
  if (session.userId.toString() !== req.userId && req.role !== 'recruiter') {
    return res.status(403).json({ error: 'forbidden' });
  }
  req.session = session;
  req.db = db;
  next();
});

// Creates a new attempt for a company, or resumes an unfinished one.
router.post('/sessions', requireAuth, asyncHandler(async (req, res) => {
  const { companyId } = req.body ?? {};
  let companyObjectId;
  try {
    companyObjectId = new ObjectId(String(companyId));
  } catch {
    return res.status(400).json({ error: 'invalid_input', detail: 'companyId is not a valid id' });
  }

  const db = await getDb();
  const userId = new ObjectId(req.userId);

  const existing = await db.collection('examSessions').findOne(
    { userId, companyId: companyObjectId, status: { $in: ACTIVE_STATUSES } },
    { sort: { createdAt: -1 } },
  );
  if (existing) return res.json({ sessionId: existing._id.toString() });

  const now = new Date();
  const { insertedId } = await db.collection('examSessions').insertOne({
    userId,
    companyId: companyObjectId,
    status: 'face_gate_pending',
    currentRound: null,
    faceGateAttempts: 0,
    faceGatePassedAt: null,
    startedAt: null,
    endedAt: null,
    integrityScore: 100,
    technicalScore: null,
    technicalPct: null,
    personalScore: null,
    personalPct: null,
    hrScore: null,
    hrPct: null,
    overallPct: null,
    createdAt: now,
  });
  res.status(201).json({ sessionId: insertedId.toString() });
}));

router.get('/sessions/:id', requireAuth, loadOwnedSession, (req, res) => {
  res.json({ session: toSessionDto(req.session) });
});

// Mirrors the (superseded) Supabase plan's unlock-exam-session edge function.
router.post('/sessions/:id/unlock', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const { embedding, livenessPassed } = req.body ?? {};
  if (!isValidEmbedding(embedding)) return res.status(400).json({ error: 'invalid_embedding' });
  if (!GATE_PENDING_STATUSES.includes(req.session.status)) {
    return res.status(400).json({ error: 'invalid_session', detail: `session status is ${req.session.status}` });
  }

  const stored = await req.db.collection('faceEmbeddings').findOne({ userId: req.session.userId });
  if (!stored) return res.status(404).json({ error: 'no_enrollment' });

  const distance = euclideanDistance(embedding, stored.embedding);
  const identityPassed = distance <= THRESHOLD;
  const livenessOk = livenessPassed === true;
  const unlocked = identityPassed && livenessOk;

  await req.db.collection('faceGateAttempts').insertOne({
    sessionId: req.session._id,
    userId: req.session.userId,
    distance,
    livenessPassed: livenessOk,
    identityPassed,
    snapshotFileId: null,
    createdAt: new Date(),
  });

  if (unlocked) {
    await req.db.collection('examSessions').updateOne(
      { _id: req.session._id },
      { $set: { status: 'in_progress', currentRound: 'technical', faceGatePassedAt: new Date(), startedAt: new Date() } },
    );
    return res.json({ unlocked: true });
  }

  const attempts = req.session.faceGateAttempts + 1;
  const reason = !identityPassed ? 'identity' : 'liveness';

  if (attempts >= MAX_FACE_GATE_ATTEMPTS) {
    await req.db.collection('examSessions').updateOne(
      { _id: req.session._id },
      { $set: { status: 'pending_manual_review', faceGateAttempts: attempts } },
    );
    return res.json({ unlocked: false, reason: 'max_attempts', status: 'pending_manual_review' });
  }

  await req.db.collection('examSessions').updateOne({ _id: req.session._id }, { $set: { faceGateAttempts: attempts } });
  res.json({ unlocked: false, reason, attemptsRemaining: MAX_FACE_GATE_ATTEMPTS - attempts });
}));

router.post('/sessions/:id/responses', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const { responses } = req.body ?? {};
  if (!Array.isArray(responses)) return res.status(400).json({ error: 'invalid_input' });
  if (responses.length === 0) return res.json({ ok: true });

  const docs = responses.map((r) => ({
    sessionId: req.session._id,
    questionId: r.questionId ? new ObjectId(r.questionId) : null,
    round: r.round,
    answer: r.answer ?? '',
    score: typeof r.score === 'number' ? r.score : 0,
    createdAt: new Date(),
  }));
  await req.db.collection('examResponses').insertMany(docs);
  res.json({ ok: true });
}));

// Mirrors the (superseded) Supabase plan's record_round_score RPC.
router.post('/sessions/:id/round-score', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const { round, score, pct } = req.body ?? {};
  if (!ROUND_ORDER.includes(round) || typeof score !== 'number' || typeof pct !== 'number') {
    return res.status(400).json({ error: 'invalid_input' });
  }

  const fieldSet = {
    [`${round}Score`]: score,
    [`${round}Pct`]: pct,
  };
  await req.db.collection('examSessions').updateOne({ _id: req.session._id }, { $set: fieldSet });

  const nextIndex = ROUND_ORDER.indexOf(round) + 1;
  const nextRound = nextIndex < ROUND_ORDER.length ? ROUND_ORDER[nextIndex] : null;

  if (nextRound) {
    await req.db.collection('examSessions').updateOne({ _id: req.session._id }, { $set: { currentRound: nextRound } });
  } else {
    const updated = await req.db.collection('examSessions').findOne({ _id: req.session._id });
    const overallPct = Math.round(((updated.technicalPct ?? 0) + (updated.personalPct ?? 0) + (updated.hrPct ?? 0)) / 3);
    await req.db.collection('examSessions').updateOne(
      { _id: req.session._id },
      { $set: { currentRound: null, status: 'submitted', endedAt: new Date(), overallPct } },
    );
  }

  res.json({ ok: true });
}));

router.post('/sessions/:id/auto-submit', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const s = req.session;
  const overallPct = Math.round(((s.technicalPct ?? 0) + (s.personalPct ?? 0) + (s.hrPct ?? 0)) / 3);
  await req.db.collection('examSessions').updateOne(
    { _id: s._id },
    { $set: { status: 'auto_submitted', endedAt: new Date(), overallPct } },
  );
  res.json({ ok: true });
}));

const SUBMITTED_STATUSES = ['submitted', 'auto_submitted'];

router.get('/sessions/:id/results', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const s = req.session;
  if (!SUBMITTED_STATUSES.includes(s.status)) {
    return res.status(400).json({ error: 'not_submitted' });
  }

  const [company, responses, violations] = await Promise.all([
    req.db.collection('companies').findOne({ _id: s.companyId }),
    req.db.collection('examResponses').find({ sessionId: s._id }).toArray(),
    req.db.collection('violations').find({ sessionId: s._id }).toArray(),
  ]);

  const questionIds = responses.map((r) => r.questionId).filter(Boolean);
  const questions = await req.db.collection('questionBank').find({ _id: { $in: questionIds } }).toArray();
  const questionById = new Map(questions.map((q) => [q._id.toString(), q]));

  // Group by round+category so the client can flag specific weak spots, not just round totals.
  const categoryTotals = new Map();
  for (const r of responses) {
    const q = r.questionId ? questionById.get(r.questionId.toString()) : null;
    if (!q) continue;
    const key = `${r.round}:${q.category ?? 'General'}`;
    const entry = categoryTotals.get(key) ?? { round: r.round, category: q.category ?? 'General', earned: 0, possible: 0 };
    entry.earned += r.score;
    entry.possible += q.points;
    categoryTotals.set(key, entry);
  }
  const categories = Array.from(categoryTotals.values()).map((c) => ({
    ...c,
    pct: c.possible > 0 ? Math.round((c.earned / c.possible) * 100) : 0,
  }));

  res.json({
    status: s.status,
    company: company ? { name: company.name, passThresholdPct: company.passThresholdPct } : null,
    overallPct: s.overallPct,
    passed: company && s.overallPct != null ? s.overallPct >= company.passThresholdPct : null,
    rounds: {
      technical: { score: s.technicalScore, pct: s.technicalPct },
      personal: { score: s.personalScore, pct: s.personalPct },
      hr: { score: s.hrScore, pct: s.hrPct },
    },
    categories,
    integrityScore: s.integrityScore,
    violations: violations.map((v) => ({ type: v.type, severity: v.severity, message: v.message, createdAt: v.createdAt })),
  });
}));

router.post('/sessions/:id/violations', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const { type, severity, message, snapshotBase64 } = req.body ?? {};
  if (!type || !severity || !message) return res.status(400).json({ error: 'invalid_input' });

  let snapshotFileId = null;
  if (snapshotBase64) {
    const bucket = await getSnapshotBucket();
    const buffer = Buffer.from(snapshotBase64, 'base64');
    const uploadStream = bucket.openUploadStream(`${req.session.userId}_${req.session._id}_${Date.now()}.jpg`, {
      contentType: 'image/jpeg',
    });
    await new Promise((resolve, reject) => {
      uploadStream.end(buffer, (err) => (err ? reject(err) : resolve()));
    });
    snapshotFileId = uploadStream.id;
  }

  await req.db.collection('violations').insertOne({
    sessionId: req.session._id,
    userId: req.session.userId,
    type,
    severity,
    message,
    snapshotFileId,
    createdAt: new Date(),
  });

  res.status(201).json({ ok: true });
}));

export default router;
