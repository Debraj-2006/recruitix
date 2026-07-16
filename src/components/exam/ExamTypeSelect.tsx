import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Code, Video, MessageSquare, ArrowRight, Clock, Target, Building2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
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
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header - matches the main site header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/brain-logo.png" alt="Recruitix Brain Logo" className="w-10 h-10 object-contain" />
            <div>
              <span className="text-xl font-bold text-black dark:text-white">Recruitix</span>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">AI-Powered</div>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="container mx-auto px-6 py-16 max-w-5xl">
        {/* Header Section */}
        <div className="text-center mb-10 space-y-4">
          <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700">
            <Building2 className="w-3 h-3 mr-1.5" />
            {company.name} Assessment
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-black dark:text-white tracking-tight">
            Select Exam Phase
          </h1>
          <div className="flex items-center justify-center">
            <span className="flex items-center bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
              <Target className="w-4 h-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
              {company.passThresholdPct}% Pass Mark
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 mb-8 text-center">
            <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {ROUND_ORDER.map((round) => {
            const Icon = EXAM_TYPE_ICONS[round];
            const isStarting = starting === round;
            return (
              <Card
                key={round}
                className="group h-full border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden flex flex-col"
              >
                <CardHeader className="p-6 md:p-8 pb-4">
                  <div className="w-14 h-14 rounded-2xl bg-black dark:bg-white flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Icon className="w-7 h-7 text-white dark:text-black" />
                  </div>
                  <CardTitle className="text-2xl font-bold text-black dark:text-white mb-2">{EXAM_TYPE_LABELS[round]}</CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400 leading-relaxed min-h-[3rem]">
                    {EXAM_TYPE_DESCRIPTIONS[round]}
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-6 md:p-8 pt-0 mt-auto space-y-6">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <Clock className="w-4 h-4 text-gray-400" />
                    {durationForRound(company, round)} Minutes Duration
                  </div>

                  <Button
                    onClick={() => handleSelect(round)}
                    disabled={starting !== null}
                    className="w-full h-12 text-md font-semibold bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all duration-300"
                  >
                    {isStarting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 dark:border-black/30 border-t-white dark:border-t-black rounded-full animate-spin mr-2" />
                        Starting...
                      </>
                    ) : (
                      <>
                        Start Phase
                        <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-12 flex justify-center">
          <Button
            onClick={onBack}
            variant="ghost"
            className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl px-8 h-12 transition-colors"
          >
            ← Change Company
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ExamTypeSelect;
