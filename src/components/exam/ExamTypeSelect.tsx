import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Code, Video, MessageSquare, ArrowRight, Clock } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { EXAM_TYPE_LABELS, EXAM_TYPE_DESCRIPTIONS, type RoundName } from '@/lib/examRounds';
import type { Company } from './CompanySelect';

interface ExamTypeSelectProps {
  company: Company;
  onSessionReady: (sessionId: string) => void;
  onBack: () => void;
}

const EXAM_TYPE_ICONS: Record<RoundName, typeof Code> = {
  technical: Code,
  personal: Video,
  hr: MessageSquare,
};

const durationForRound = (company: Company, round: RoundName): number =>
  round === 'technical' ? company.technicalDurationMin : round === 'personal' ? company.personalDurationMin : company.hrDurationMin;

const ROUND_ORDER: RoundName[] = ['technical', 'personal', 'hr'];

/** Picks which single exam type to attempt for the chosen company — creates (or resumes) a session scoped to just that round. */
const ExamTypeSelect = ({ company, onSessionReady, onBack }: ExamTypeSelectProps) => {
  const [starting, setStarting] = useState<RoundName | null>(null);
  const [error, setError] = useState('');

  const handleSelect = async (round: RoundName) => {
    setStarting(round);
    setError('');
    try {
      const { sessionId } = await apiPost<{ sessionId: string }>('/api/exam/sessions', { companyId: company.id, round });
      onSessionReady(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start this exam. Please try again.');
      setStarting(null);
    }
  };

  return (
    <div className="min-h-screen bg-black p-4">
      <div className="max-w-4xl mx-auto py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Choose Your Exam Type</h1>
        <p className="text-slate-400 mb-8">
          {company.name} · pass at {company.passThresholdPct}%
        </p>

        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3 mb-6">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {ROUND_ORDER.map((round) => {
            const Icon = EXAM_TYPE_ICONS[round];
            return (
              <Card key={round} className="bg-slate-900 border-slate-700 hover:border-blue-500 transition-colors flex flex-col">
                <CardHeader>
                  <Icon className="w-8 h-8 text-blue-400 mb-2" />
                  <CardTitle className="text-white">{EXAM_TYPE_LABELS[round]}</CardTitle>
                  <CardDescription className="text-slate-400">{EXAM_TYPE_DESCRIPTIONS[round]}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="flex items-center gap-1 text-sm text-slate-400">
                    <Clock className="w-3 h-3" /> {durationForRound(company, round)} minutes
                  </div>
                  <Button
                    onClick={() => handleSelect(round)}
                    disabled={starting !== null}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {starting === round ? 'Starting...' : 'Start'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Button onClick={onBack} variant="outline" className="mt-8 bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800">
          Back
        </Button>
      </div>
    </div>
  );
};

export default ExamTypeSelect;
