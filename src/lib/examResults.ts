import { apiGet } from './api';
import type { RoundName } from './examRounds';

export interface CategoryBreakdown {
  category: string;
  earned: number;
  possible: number;
  pct: number;
}

export interface InterviewFeedback {
  score: number;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
}

export interface ExamResultsData {
  status: 'submitted' | 'auto_submitted';
  company: { name: string; passThresholdPct: number } | null;
  round: RoundName;
  score: number;
  pct: number;
  passed: boolean | null;
  categories: CategoryBreakdown[];
  interviewFeedback: InterviewFeedback | null;
  integrityScore: number;
  violations: { type: string; severity: string; message: string; createdAt: string }[];
}

export function fetchExamResults(sessionId: string): Promise<ExamResultsData> {
  return apiGet<ExamResultsData>(`/api/exam/sessions/${sessionId}/results`);
}

const CATEGORY_TIPS: Record<string, string> = {
  DSA: 'Revisit core data structures and algorithm complexity — practice more problems on arrays, trees, sorting, and searching.',
  Aptitude: 'Practice quantitative reasoning and word problems under time pressure; timed daily drills help most.',
  Quant: 'Brush up on percentages, ratios, and basic arithmetic — these show up repeatedly under different wording.',
  Behavioral: 'Structure answers with the STAR method (Situation, Task, Action, Result) to stay concise and concrete.',
  General: 'Review the topics covered in this round and re-attempt similar practice questions.',
};

export function tipForCategory(category: string): string {
  return CATEGORY_TIPS[category] ?? CATEGORY_TIPS.General;
}

const WEAK_THRESHOLD_PCT = 60;

export function isWeakArea(c: CategoryBreakdown): boolean {
  return c.possible > 0 && c.pct < WEAK_THRESHOLD_PCT;
}
