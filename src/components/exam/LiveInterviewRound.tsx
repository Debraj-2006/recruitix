import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { startInterview, respondToInterview, finishInterview } from '@/lib/interview';

interface LiveInterviewRoundProps {
  sessionId: string;
  onSubmit: (result: { score: number; pct: number; answers: Record<string, string> }) => void;
}

type Phase = 'connecting' | 'speaking' | 'ready' | 'recording' | 'processing' | 'finishing' | 'error';

interface TranscriptEntry {
  speaker: 'AI' | 'You';
  text: string;
}

// SpeechRecognition is a non-standard, vendor-prefixed Web API — not in TS's DOM lib, hence the
// minimal local shape and `any`-typed event handlers below rather than fighting for real types.
interface SpeechRecognitionLike {
  start(): void;
  stop(): void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const speak = (text: string): Promise<void> =>
  new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });

/** AI-conducted "Live Interview": Claude asks questions (spoken via TTS), candidate answers via mic (transcribed via STT). */
const LiveInterviewRound = ({ sessionId, onSubmit }: LiveInterviewRoundProps) => {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // True while the candidate intends to still be recording — distinguishes a deliberate
  // stopRecording() from the browser silently ending recognition on its own (a known Chrome
  // quirk even with continuous:true, especially after a short pause in speech), so onend can
  // tell whether to auto-restart or leave it stopped.
  const shouldKeepListeningRef = useRef(false);

  const askQuestion = async (text: string, complete: boolean) => {
    setCurrentQuestion(text);
    setTranscript((prev) => [...prev, { speaker: 'AI', text }]);
    setPhase('speaking');
    await speak(text);

    if (complete) {
      setPhase('finishing');
      try {
        const evaluation = await finishInterview(sessionId);
        onSubmit({ score: evaluation.score, pct: evaluation.pct, answers: {} });
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not finalize the interview.');
        setPhase('error');
      }
      return;
    }
    setPhase('ready');
  };

  useEffect(() => {
    let cancelled = false;

    startInterview(sessionId)
      .then((turn) => {
        if (!cancelled) void askQuestion(turn.reply, turn.interviewComplete);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Could not start the interview.');
          setPhase('error');
        }
      });

    return () => {
      cancelled = true;
      shouldKeepListeningRef.current = false;
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const startRecording = () => {
    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setErrorMessage('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      setPhase('error');
      return;
    }

    setLiveTranscript('');
    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalText = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else interim += result[0].transcript;
      }
      setLiveTranscript((finalText + interim).trim());
    };

    // Most errors here are transient (e.g. 'no-speech' fires constantly during a normal pause
    // to think) and are recoverable via the onend auto-restart below — only bail out to 'ready'
    // on errors that mean recognition genuinely cannot continue.
    const FATAL_ERRORS = new Set(['not-allowed', 'audio-capture', 'service-not-allowed']);
    recognition.onerror = (event) => {
      if (FATAL_ERRORS.has(event.error)) {
        shouldKeepListeningRef.current = false;
        setPhase('ready');
      }
    };

    recognition.onend = () => {
      if (shouldKeepListeningRef.current) {
        try {
          recognition.start();
        } catch {
          // Already starting/started — the browser will settle on its own; next onend retries.
        }
      }
    };

    shouldKeepListeningRef.current = true;
    recognitionRef.current = recognition;
    recognition.start();
    setPhase('recording');
  };

  const stopRecording = async () => {
    shouldKeepListeningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    const answer = liveTranscript.trim();
    setLiveTranscript('');
    if (!answer) {
      setPhase('ready');
      return;
    }

    setTranscript((prev) => [...prev, { speaker: 'You', text: answer }]);
    setPhase('processing');
    try {
      const turn = await respondToInterview(sessionId, answer);
      await askQuestion(turn.reply, turn.interviewComplete);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not send your answer.');
      setPhase('error');
    }
  };

  const badgeLabel =
    phase === 'speaking'
      ? 'AI Speaking'
      : phase === 'recording'
        ? 'Listening'
        : phase === 'processing'
          ? 'Thinking'
          : phase === 'finishing'
            ? 'Wrapping Up'
            : 'Ready';

  return (
    <div className="min-h-screen bg-black p-4">
      <div className="max-w-3xl mx-auto py-12 space-y-6">
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">Live Interview</CardTitle>
              <Badge className="bg-blue-500 text-white">{badgeLabel}</Badge>
            </div>
            <CardDescription className="text-slate-300">
              Answer out loud, like a real interview. Click the mic, speak your answer, then click again to send it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-slate-800 rounded-lg p-4 flex items-start gap-3">
              <Volume2 className="w-5 h-5 text-blue-400 shrink-0 mt-1" />
              <p className="text-white text-lg">{currentQuestion || 'Connecting to your interviewer...'}</p>
            </div>

            {phase === 'recording' && (
              <div className="bg-slate-800/50 border border-blue-500/30 rounded-lg p-3 min-h-[60px]">
                <p className="text-slate-300 text-sm">{liveTranscript || 'Listening...'}</p>
              </div>
            )}

            {errorMessage && (
              <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
                <p className="text-red-300 text-sm">{errorMessage}</p>
              </div>
            )}

            <div className="flex justify-center">
              {phase === 'ready' && (
                <Button onClick={startRecording} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-16 h-16 p-0">
                  <Mic className="w-6 h-6" />
                </Button>
              )}
              {phase === 'recording' && (
                <Button onClick={stopRecording} className="bg-red-600 hover:bg-red-700 text-white rounded-full w-16 h-16 p-0">
                  <MicOff className="w-6 h-6" />
                </Button>
              )}
              {(phase === 'speaking' || phase === 'processing' || phase === 'connecting' || phase === 'finishing') && (
                <p className="text-slate-400 text-sm">
                  {phase === 'speaking' ? 'Listen to the question...' : phase === 'finishing' ? 'Finalizing your evaluation...' : 'Please wait...'}
                </p>
              )}
            </div>

            {transcript.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto border-t border-slate-700 pt-4">
                {transcript.map((entry, i) => (
                  <p key={i} className="text-sm">
                    <span className={entry.speaker === 'AI' ? 'text-blue-400 font-medium' : 'text-green-400 font-medium'}>{entry.speaker}: </span>
                    <span className="text-slate-300">{entry.text}</span>
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LiveInterviewRound;
