import express from 'express';
import { ObjectId } from 'mongodb';
import { getDb, getSnapshotBucket } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { isValidEmbedding, euclideanDistance, THRESHOLD } from '../lib/faceMatch.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { generateInterviewerTurn, generateInterviewEvaluation } from '../lib/interviewer.js';
import { generateTechnicalQuestions, gradeCodingAnswer } from '../lib/technicalRound.js';
import { severityForType } from '../lib/violations.js';

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
    round: s.round,
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

// Creates a new single-exam-type attempt for a company (Technical Assessment / Live Interview /
// HR Simulation — internal round keys 'technical' / 'personal' / 'hr'), or resumes an unfinished
// one of that same type. Each session covers exactly one round; candidates pick a type up front
// rather than being carried through all three back-to-back.
router.post('/sessions', requireAuth, asyncHandler(async (req, res) => {
  const { companyId, round } = req.body ?? {};
  if (!ROUND_ORDER.includes(round)) {
    return res.status(400).json({ error: 'invalid_input', detail: 'round must be one of technical, personal, hr' });
  }
  let companyObjectId;
  try {
    companyObjectId = new ObjectId(String(companyId));
  } catch {
    return res.status(400).json({ error: 'invalid_input', detail: 'companyId is not a valid id' });
  }

  const db = await getDb();
  const userId = new ObjectId(req.userId);

  const existing = await db.collection('examSessions').findOne(
    { userId, companyId: companyObjectId, round, status: { $in: ACTIVE_STATUSES } },
    { sort: { createdAt: -1 } },
  );
  if (existing) return res.json({ sessionId: existing._id.toString() });

  const now = new Date();
  const { insertedId } = await db.collection('examSessions').insertOne({
    userId,
    companyId: companyObjectId,
    round,
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
      { $set: { status: 'in_progress', currentRound: req.session.round, faceGatePassedAt: new Date(), startedAt: new Date() } },
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

// Mirrors the (superseded) Supabase plan's record_round_score RPC. Since a session now covers
// exactly one exam type, recording that round's score finalizes the session immediately — no
// more advancing through technical -> personal -> hr in sequence.
router.post('/sessions/:id/round-score', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const { round, score, pct } = req.body ?? {};
  if (!ROUND_ORDER.includes(round) || typeof score !== 'number' || typeof pct !== 'number') {
    return res.status(400).json({ error: 'invalid_input' });
  }
  if (round !== req.session.round) {
    return res.status(400).json({ error: 'invalid_input', detail: "round does not match this session's exam type" });
  }

  await req.db.collection('examSessions').updateOne(
    { _id: req.session._id },
    {
      $set: {
        [`${round}Score`]: score,
        [`${round}Pct`]: pct,
        currentRound: null,
        status: 'submitted',
        endedAt: new Date(),
        overallPct: pct,
      },
    },
  );

  res.json({ ok: true });
}));

// LLM-generated Technical Assessment (round === 'technical'): a fresh set of MCQ + coding
// questions is generated per session on first load and persisted to questionBank tagged with
// this session's id, so re-fetching mid-exam returns the same set instead of a new one. Unlike
// the static per-company seeded pool, correctAnswer/rubric is never sent to the client — MCQ and
// coding grading both happen server-side in /technical/submit below.
router.post('/sessions/:id/technical/start', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  if (req.session.round !== 'technical') return res.status(400).json({ error: 'invalid_input', detail: 'not a technical session' });

  let docs = await req.db.collection('questionBank').find({ sessionId: req.session._id, round: 'technical' }).toArray();

  if (docs.length === 0) {
    const generated = await generateTechnicalQuestions();
    const now = new Date();
    const toInsert = generated.map((q) => ({
      ...q,
      round: 'technical',
      companyId: req.session.companyId,
      sessionId: req.session._id,
      createdAt: now,
    }));
    const { insertedIds } = await req.db.collection('questionBank').insertMany(toInsert);
    docs = toInsert.map((doc, i) => ({ ...doc, _id: insertedIds[i] }));
  }

  res.json({
    questions: docs.map((q) => ({
      id: q._id.toString(),
      round: q.round,
      qtype: q.qtype,
      category: q.category ?? null,
      prompt: q.prompt,
      options: q.options ?? null,
      correctAnswer: null,
      points: q.points,
    })),
  });
}));

router.post('/sessions/:id/technical/submit', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  if (req.session.round !== 'technical') return res.status(400).json({ error: 'invalid_input', detail: 'not a technical session' });

  const { answers } = req.body ?? {};
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'invalid_input' });

  const questions = await req.db.collection('questionBank').find({ sessionId: req.session._id, round: 'technical' }).toArray();
  if (questions.length === 0) {
    return res.status(400).json({ error: 'invalid_input', detail: 'technical round was not started' });
  }

  let earned = 0;
  let possible = 0;
  const responseDocs = [];

  for (const q of questions) {
    const answer = typeof answers[q._id.toString()] === 'string' ? answers[q._id.toString()] : '';
    possible += q.points;

    let score = 0;
    if (q.qtype === 'mcq') {
      score = answer === q.correctAnswer ? q.points : 0;
    } else if (answer.trim()) {
      // A grading failure shouldn't fail the whole submission — a zero for that one question is
      // the safe fallback rather than leaving the candidate's exam stuck mid-submit.
      try {
        const { scoreFraction } = await gradeCodingAnswer(q, answer);
        score = scoreFraction * q.points;
      } catch (err) {
        console.error('Technical answer grading failed:', err);
      }
    }
    earned += score;

    responseDocs.push({
      sessionId: req.session._id,
      questionId: q._id,
      round: 'technical',
      answer,
      score,
      createdAt: new Date(),
    });
  }

  await req.db.collection('examResponses').insertMany(responseDocs);

  const pct = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  await req.db.collection('examSessions').updateOne(
    { _id: req.session._id },
    {
      $set: {
        technicalScore: earned,
        technicalPct: pct,
        currentRound: null,
        status: 'submitted',
        endedAt: new Date(),
        overallPct: pct,
      },
    },
  );

  res.json({ score: earned, pct });
}));

// AI-driven Live Interview (round === 'personal'): a Claude-conducted conversational interview,
// one question at a time, transcribed by the candidate's browser and spoken back via TTS. The
// full exchange is persisted in interviewTranscripts so /finish can grade the whole conversation.
router.post('/sessions/:id/interview/start', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  if (req.session.round !== 'personal') return res.status(400).json({ error: 'invalid_input', detail: 'not an interview session' });

  const existing = await req.db.collection('interviewTranscripts').findOne({ sessionId: req.session._id });
  if (existing) {
    const last = existing.messages[existing.messages.length - 1];
    if (last?.role === 'assistant') return res.json({ reply: last.text, interviewComplete: false });
  }

  const messages = [{ role: 'user', text: 'Begin the interview.', createdAt: new Date() }];
  const turn = await generateInterviewerTurn(messages);
  messages.push({ role: 'assistant', text: turn.reply, createdAt: new Date() });

  await req.db.collection('interviewTranscripts').updateOne(
    { sessionId: req.session._id },
    { $set: { sessionId: req.session._id, userId: req.session.userId, messages, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  res.json({ reply: turn.reply, interviewComplete: turn.interviewComplete });
}));

router.post('/sessions/:id/interview/respond', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const { answer } = req.body ?? {};
  if (typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: 'invalid_input' });

  const transcript = await req.db.collection('interviewTranscripts').findOne({ sessionId: req.session._id });
  if (!transcript) return res.status(404).json({ error: 'not_found' });

  transcript.messages.push({ role: 'user', text: answer, createdAt: new Date() });
  const turn = await generateInterviewerTurn(transcript.messages);
  transcript.messages.push({ role: 'assistant', text: turn.reply, createdAt: new Date() });

  await req.db.collection('interviewTranscripts').updateOne(
    { sessionId: req.session._id },
    { $set: { messages: transcript.messages, updatedAt: new Date() } },
  );
  res.json({ reply: turn.reply, interviewComplete: turn.interviewComplete });
}));

router.post('/sessions/:id/interview/finish', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const transcript = await req.db.collection('interviewTranscripts').findOne({ sessionId: req.session._id });
  if (!transcript || transcript.messages.length < 2) {
    return res.status(400).json({ error: 'invalid_input', detail: 'interview has no content yet' });
  }

  const evaluation = await generateInterviewEvaluation(transcript.messages);
  await req.db.collection('examSessions').updateOne({ _id: req.session._id }, { $set: { personalFeedback: evaluation } });

  res.json({
    score: evaluation.score,
    pct: evaluation.score,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    areasToImprove: evaluation.areasToImprove,
  });
}));

router.post('/sessions/:id/auto-submit', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const s = req.session;
  const overallPct = s[`${s.round}Pct`] ?? 0;
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

  // Every response belongs to this session's single round, so group by category only.
  const categoryTotals = new Map();
  for (const r of responses) {
    const q = r.questionId ? questionById.get(r.questionId.toString()) : null;
    if (!q) continue;
    const key = q.category ?? 'General';
    const entry = categoryTotals.get(key) ?? { category: key, earned: 0, possible: 0 };
    entry.earned += r.score;
    entry.possible += q.points;
    categoryTotals.set(key, entry);
  }
  const categories = Array.from(categoryTotals.values()).map((c) => ({
    ...c,
    pct: c.possible > 0 ? Math.round((c.earned / c.possible) * 100) : 0,
  }));

  const pct = s[`${s.round}Pct`] ?? s.overallPct ?? 0;
  const score = s[`${s.round}Score`] ?? 0;

  res.json({
    status: s.status,
    company: company ? { name: company.name, passThresholdPct: company.passThresholdPct } : null,
    round: s.round,
    score,
    pct,
    passed: company ? pct >= company.passThresholdPct : null,
    categories,
    interviewFeedback: s.round === 'personal' ? (s.personalFeedback ?? null) : null,
    integrityScore: s.integrityScore,
    violations: violations.map((v) => ({ type: v.type, severity: v.severity, message: v.message, createdAt: v.createdAt })),
  });
}));

router.post('/sessions/:id/violations', requireAuth, loadOwnedSession, asyncHandler(async (req, res) => {
  const { type, message, snapshotBase64 } = req.body ?? {};
  if (!type || !message) return res.status(400).json({ error: 'invalid_input' });

  // Severity (and therefore the integrity-score deduction below) is always derived from the
  // type via the server's own whitelist, never trusted from the client's request body.
  const severity = severityForType(type);
  if (!severity) return res.status(400).json({ error: 'invalid_input', detail: `unknown violation type: ${type}` });

  let snapshotFileId = null;
  if (snapshotBase64) {
    // A snapshot upload failure must not cost the candidate their proctoring record — the flag
    // itself (and the integrity-score deduction) is what matters for scoring; the image is
    // supplementary evidence, so its failure is logged and swallowed rather than aborting the
    // whole violation write below.
    try {
      const bucket = await getSnapshotBucket();
      const buffer = Buffer.from(snapshotBase64, 'base64');
      const uploadStream = bucket.openUploadStream(`${req.session.userId}_${req.session._id}_${Date.now()}.jpg`, {
        contentType: 'image/jpeg',
      });
      await new Promise((resolve, reject) => {
        uploadStream.end(buffer, (err) => (err ? reject(err) : resolve()));
      });
      snapshotFileId = uploadStream.id;
    } catch (err) {
      console.error('Violation snapshot upload failed:', err);
    }
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

  const deduction = severity === 'critical' ? 15 : 5;
  const integrityScore = Math.max(0, (req.session.integrityScore ?? 100) - deduction);
  await req.db.collection('examSessions').updateOne({ _id: req.session._id }, { $set: { integrityScore } });

  res.status(201).json({ ok: true, integrityScore });
}));

export default router;
