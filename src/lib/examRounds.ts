import { apiGet, apiPost } from './api';
import { calculateSemanticSimilarity } from '@/utils/semanticSimilarity';

export type RoundName = 'technical' | 'personal' | 'hr';

// Candidate-facing names for what are internally still the 'technical' / 'personal' / 'hr'
// round keys (unchanged to match existing seeded questionBank.round values and the company
// duration/score field names, e.g. personalDurationMin) — only the display label changed.
export const EXAM_TYPE_LABELS: Record<RoundName, string> = {
  technical: 'Technical Assessment',
  personal: 'Live Interview',
  hr: 'HR Simulation',
};

export const EXAM_TYPE_DESCRIPTIONS: Record<RoundName, string> = {
  technical: 'MCQs and coding questions covering DSA, aptitude, and quantitative reasoning.',
  personal: 'Coding problems under continuous AI-powered proctoring and behavior monitoring.',
  hr: 'Behavioral questions evaluating communication and situational judgment.',
};

export interface QuestionBankRow {
  id: string;
  round: RoundName;
  qtype: 'mcq' | 'coding' | 'behavioral';
  category: string | null;
  prompt: string;
  options: string[] | null;
  correctAnswer: string | null;
  points: number;
}

export async function fetchRoundQuestions(companyId: string, round: RoundName): Promise<QuestionBankRow[]> {
  const { questions } = await apiGet<{ questions: QuestionBankRow[] }>(
    `/api/question-bank?companyId=${encodeURIComponent(companyId)}&round=${encodeURIComponent(round)}`,
  );
  return questions;
}

/** Technical Assessment: LLM-generated MCQ + coding questions, unique per session. Grading (both
 *  MCQ and coding) happens server-side in submitTechnicalRound, so correctAnswer always comes back null. */
export async function startTechnicalRound(sessionId: string): Promise<QuestionBankRow[]> {
  const { questions } = await apiPost<{ questions: QuestionBankRow[] }>(`/api/exam/sessions/${sessionId}/technical/start`, {});
  return questions;
}

export async function submitTechnicalRound(sessionId: string, answers: Record<string, string>): Promise<{ score: number; pct: number }> {
  return apiPost<{ score: number; pct: number }>(`/api/exam/sessions/${sessionId}/technical/submit`, { answers });
}

/** MCQ: full points if exact match. Coding/behavioral: semantic-similarity partial credit, weighted by points. */
export function scoreAnswer(question: QuestionBankRow, answer: string): number {
  if (!answer) return 0;
  if (question.qtype === 'mcq') {
    return answer === question.correctAnswer ? question.points : 0;
  }
  const similarity = calculateSemanticSimilarity(answer, question.correctAnswer ?? '');
  return similarity * question.points;
}

export interface PersistedResponse {
  questionId: string;
  round: RoundName;
  answer: string;
  score: number;
}

export async function submitRoundResponses(sessionId: string, responses: PersistedResponse[]): Promise<void> {
  if (responses.length === 0) return;
  await apiPost(`/api/exam/sessions/${sessionId}/responses`, { responses });
}

/** Persists the round's score/pct, advances current round, and finalizes the session after HR. */
export async function recordRoundScore(sessionId: string, round: RoundName, score: number, pct: number): Promise<void> {
  await apiPost(`/api/exam/sessions/${sessionId}/round-score`, { round, score, pct });
}
