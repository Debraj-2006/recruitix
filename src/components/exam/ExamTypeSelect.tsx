import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Code, Video, MessageSquare, ArrowRight, Clock, Target, Building2 } from 'lucide-react';
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
    <div className="min-h-screen bg-[#030712] relative overflow-hidden flex items-center justify-center p-4 sm:p-8">
      {/* Background glowing orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-5xl relative z-10 py-12">
        
        {/* Header Section */}
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center justify-center px-4 py-2 mb-4 rounded-full bg-slate-800/50 border border-slate-700/50 text-slate-300 backdrop-blur-sm">
            <Building2 className="w-4 h-4 mr-2 text-blue-400" />
            <span className="text-sm font-medium">{company.name} Assessment</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 tracking-tight">
            Select Exam Phase
          </h1>
          <div className="flex items-center justify-center gap-4 text-slate-400">
            <span className="flex items-center bg-slate-800/50 px-3 py-1 rounded-full text-sm border border-slate-700/50">
              <Target className="w-4 h-4 mr-1.5 text-emerald-400" />
              {company.passThresholdPct}% Pass Mark
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-8 text-center backdrop-blur-sm">
            <p className="text-red-400 font-medium">{error}</p>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {ROUND_ORDER.map((round, idx) => {
            const Icon = EXAM_TYPE_ICONS[round];
            const isStarting = starting === round;
            return (
              <div 
                key={round} 
                className="group relative"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {/* Hover gradient border effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm" />
                
                <Card className="relative h-full bg-slate-900/80 backdrop-blur-xl border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10 flex flex-col">
                  <CardHeader className="p-6 md:p-8 pb-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center border border-blue-500/20 mb-6">
                      <Icon className="w-7 h-7 text-blue-400" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-white mb-2">{EXAM_TYPE_LABELS[round]}</CardTitle>
                    <CardDescription className="text-slate-400 leading-relaxed min-h-[3rem]">
                      {EXAM_TYPE_DESCRIPTIONS[round]}
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent className="p-6 md:p-8 pt-0 mt-auto space-y-6">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-300 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                      <Clock className="w-4 h-4 text-blue-400" /> 
                      {durationForRound(company, round)} Minutes Duration
                    </div>
                    
                    <Button
                      onClick={() => handleSelect(round)}
                      disabled={starting !== null}
                      className="w-full h-12 text-md font-medium bg-white text-slate-900 hover:bg-slate-100 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group-hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] rounded-xl"
                    >
                      {isStarting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin mr-2" />
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
              </div>
            );
          })}
        </div>

        <div className="mt-12 flex justify-center">
          <Button 
            onClick={onBack} 
            variant="ghost" 
            className="text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl px-8 h-12 transition-colors"
          >
            ← Change Company
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ExamTypeSelect;
