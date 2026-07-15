import { apiPost } from './api';

export interface InterviewTurn {
  reply: string;
  interviewComplete: boolean;
}

export function startInterview(sessionId: string): Promise<InterviewTurn> {
  return apiPost<InterviewTurn>(`/api/exam/sessions/${sessionId}/interview/start`);
}

export function respondToInterview(sessionId: string, answer: string): Promise<InterviewTurn> {
  return apiPost<InterviewTurn>(`/api/exam/sessions/${sessionId}/interview/respond`, { answer });
}

export interface InterviewEvaluation {
  score: number;
  pct: number;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
}

export function finishInterview(sessionId: string): Promise<InterviewEvaluation> {
  return apiPost<InterviewEvaluation>(`/api/exam/sessions/${sessionId}/interview/finish`);
}
