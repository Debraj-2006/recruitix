import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import type { QuestionBankRow } from '@/lib/examRounds';
import { scoreAnswer } from '@/lib/examRounds';

interface RoundViewProps {
  title: string;
  durationMin: number;
  questions: QuestionBankRow[];
  onSubmit: (result: { score: number; pct: number; answers: Record<string, string> }) => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** Shared question-navigation + timer UI for Technical/Personal/HR rounds — question shape differs, structure doesn't. */
const RoundView = ({ title, durationMin, questions, onSubmit }: RoundViewProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(durationMin * 60);

  const maxPoints = useMemo(() => questions.reduce((sum, q) => sum + q.points, 0), [questions]);

  const finish = () => {
    let score = 0;
    for (const q of questions) score += scoreAnswer(q, answers[q.id] ?? '');
    const pct = maxPoints > 0 ? Math.round((score / maxPoints) * 100) : 0;
    onSubmit({ score, pct, answers });
  };

  useEffect(() => {
    if (timeLeft <= 0) {
      finish();
      return;
    }
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">No questions configured for this round yet.</p>
      </div>
    );
  }

  const question = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;

  return (
    <div className="min-h-screen bg-black p-4">
      <div className="max-w-3xl mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <Badge className="bg-slate-800 text-white flex items-center gap-1">
            <Clock className="w-3 h-3" /> {formatTime(timeLeft)}
          </Badge>
        </div>

        <Progress value={((currentIndex + 1) / questions.length) * 100} className="h-2" />
        <p className="text-slate-400 text-sm">
          Question {currentIndex + 1} of {questions.length} {question.category ? `· ${question.category}` : ''}
        </p>

        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-lg">{question.prompt}</CardTitle>
          </CardHeader>
          <CardContent>
            {question.qtype === 'mcq' && question.options ? (
              <RadioGroup
                value={answers[question.id] ?? ''}
                onValueChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
              >
                {question.options.map((option) => (
                  <div key={option} className="flex items-center space-x-2 py-1">
                    <RadioGroupItem
                      value={option}
                      id={option}
                      className="border-slate-400 text-blue-400 focus-visible:ring-blue-500"
                    />
                    <Label htmlFor={option} className="text-slate-200">{option}</Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <Textarea
                value={answers[question.id] ?? ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                placeholder="Type your answer here..."
                className="min-h-[160px] bg-slate-800 border-slate-600 text-white"
              />
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button
            variant="outline"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => i - 1)}
            className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          {isLast ? (
            <Button onClick={finish} className="bg-green-600 hover:bg-green-700 text-white">
              Submit Round
            </Button>
          ) : (
            <Button onClick={() => setCurrentIndex((i) => i + 1)} className="bg-blue-600 hover:bg-blue-700 text-white">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoundView;
