import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, ShieldAlert, TrendingUp, TrendingDown } from 'lucide-react';
import { fetchExamResults, tipForCategory, isWeakArea, type ExamResultsData } from '@/lib/examResults';
import type { RoundName } from '@/lib/examRounds';

interface ExamResultsProps {
  sessionId: string;
  onContinue: () => void;
}

const ROUND_TITLES: Record<RoundName, string> = {
  technical: 'Technical Round',
  personal: 'Personal Round',
  hr: 'HR Round',
};

const pctColor = (pct: number) => (pct >= 75 ? 'text-green-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400');

const ExamResults = ({ sessionId, onContinue }: ExamResultsProps) => {
  const [data, setData] = useState<ExamResultsData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchExamResults(sessionId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load results.'));
  }, [sessionId]);

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900 border-slate-700">
          <CardContent className="pt-6 space-y-4">
            <p className="text-red-300 text-sm">{error}</p>
            <Button onClick={onContinue} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">Loading your results...</p>
      </div>
    );
  }

  const overallPct = data.overallPct ?? 0;
  const weakAreas = data.categories.filter(isWeakArea).sort((a, b) => a.pct - b.pct);
  const strongAreas = data.categories.filter((c) => !isWeakArea(c)).sort((a, b) => b.pct - a.pct);

  return (
    <div className="min-h-screen bg-black p-4">
      <div className="max-w-3xl mx-auto py-12 space-y-6">
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader className="text-center space-y-3">
            {data.passed ? (
              <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto" />
            ) : (
              <XCircle className="w-14 h-14 text-red-400 mx-auto" />
            )}
            <CardTitle className="text-white text-2xl">
              {data.passed ? 'You Passed' : 'Not Cleared'}
              {data.company ? ` — ${data.company.name}` : ''}
            </CardTitle>
            <CardDescription className="text-slate-300">
              {data.status === 'auto_submitted'
                ? 'This attempt was auto-submitted due to repeated proctoring flags and is pending review.'
                : `Overall score: ${overallPct}%${data.company ? ` (pass mark ${data.company.passThresholdPct}%)` : ''}`}
            </CardDescription>
            <div className={`text-5xl font-bold ${pctColor(overallPct)}`}>{overallPct}%</div>
          </CardHeader>
        </Card>

        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-lg">Round Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(Object.keys(ROUND_TITLES) as RoundName[]).map((round) => {
              const r = data.rounds[round];
              const pct = r?.pct ?? 0;
              return (
                <div key={round} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">{ROUND_TITLES[round]}</span>
                    <span className={pctColor(pct)}>{r?.pct != null ? `${pct}%` : '—'}</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {weakAreas.length > 0 && (
          <Card className="bg-slate-900 border-amber-500/30">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-amber-400" /> Areas to Improve
              </CardTitle>
              <CardDescription className="text-slate-400">
                Scored below 60% — focus your prep here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {weakAreas.map((c) => (
                <div key={`${c.round}:${c.category}`} className="bg-amber-900/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-medium">
                      {c.category} <span className="text-slate-400 font-normal">· {ROUND_TITLES[c.round]}</span>
                    </span>
                    <Badge className="bg-amber-900/40 text-amber-300 border border-amber-500/40">{c.pct}%</Badge>
                  </div>
                  <p className="text-slate-300 text-sm">{tipForCategory(c.category)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {strongAreas.length > 0 && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" /> Strengths
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {strongAreas.map((c) => (
                <Badge key={`${c.round}:${c.category}`} className="bg-green-900/30 text-green-300 border border-green-500/30">
                  {c.category} · {c.pct}%
                </Badge>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-slate-400" /> Proctoring Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">Integrity Score</span>
              <span className={pctColor(data.integrityScore)}>{data.integrityScore}/100</span>
            </div>
            {data.violations.length === 0 ? (
              <p className="text-slate-400 text-sm">No flags recorded during this attempt.</p>
            ) : (
              <ul className="text-slate-400 text-sm list-disc list-inside space-y-1">
                {data.violations.slice(0, 5).map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
                {data.violations.length > 5 && <li>+{data.violations.length - 5} more</li>}
              </ul>
            )}
          </CardContent>
        </Card>

        <Button onClick={onContinue} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg">
          Continue
        </Button>
      </div>
    </div>
  );
};

export default ExamResults;
