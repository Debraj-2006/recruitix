import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { loadFaceModels, getFaceDescriptor } from '@/lib/faceEngine';
import { loadFaceLandmarker, detectFrame } from '@/lib/faceMesh';
import { createStrikeTracker, createViolationPolicy, type ConfirmedViolation } from '@/utils/proctorEngine';
import {
  fetchRoundQuestions,
  startTechnicalRound,
  submitTechnicalRound,
  submitRoundResponses,
  recordRoundScore,
  scoreAnswer,
  EXAM_TYPE_LABELS,
  type QuestionBankRow,
  type RoundName,
} from '@/lib/examRounds';
import RoundView from './RoundView';
import LiveInterviewRound from './LiveInterviewRound';
import ExamResults from './ExamResults';

interface ExamRunnerProps {
  sessionId: string;
  screenStream: MediaStream;
  micStream: MediaStream;
  onExamComplete: () => void;
}

interface SessionInfo {
  companyId: string;
  currentRound: RoundName | null;
  status: string;
}

interface CompanyDurations {
  technicalDurationMin: number;
  personalDurationMin: number;
  hrDurationMin: number;
}

const PRESENCE_CHECK_MS = 1000;
const IDENTITY_CHECK_MS = 8000;
const MAX_YAW_DEG = 30;
const MAX_PITCH_DEG = 25;
const NO_FACE_WARNINGS_BEFORE_CANCEL = 3;
const AUDIO_CHECK_MS = 1500;
// 0-255 scale from AnalyserNode.getByteFrequencyData's average — sustained speech/loud noise
// reliably sits well above ambient room/keyboard noise at this threshold.
const LOUD_AUDIO_THRESHOLD = 50;

function captureBase64Jpeg(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  canvas.width = video.videoWidth || 320;
  canvas.height = video.videoHeight || 240;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  // dataURL is "data:image/jpeg;base64,<...>" — server only wants the payload after the comma.
  return canvas.toDataURL('image/jpeg', 0.7).split(',')[1] ?? null;
}

/**
 * Owns the camera + continuous proctoring for the exam session and renders the single exam
 * type (technical/personal/hr) the candidate chose, persisting every answer to examResponses.
 */
const ExamRunner = ({ sessionId, screenStream, micStream, onExamComplete }: ExamRunnerProps) => {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [durations, setDurations] = useState<CompanyDurations | null>(null);
  const [questions, setQuestions] = useState<QuestionBankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState<'submitted' | 'auto_submitted' | null>(null);
  const [liveViolations, setLiveViolations] = useState<ConfirmedViolation[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strikeTracker = useRef(createStrikeTracker());
  // Dedicated, faster-confirming tracker for NO_FACE only (2 consecutive checks ≈ 2s instead of
  // the shared 3s debounce) — the 3-cancellation-warnings feature should feel responsive rather
  // than needing a full 3s stare-down before the very first warning even shows.
  const noFaceStrikeTracker = useRef(createStrikeTracker(2));
  // Own tracker for sustained loud audio, on its own 1.5s cadence rather than the 1s webcam loop.
  const audioStrikeTracker = useRef(createStrikeTracker());
  const violationPolicy = useRef(createViolationPolicy());
  const noFaceCount = useRef(0);
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const identityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const endedRef = useRef(false);

  const stopEverything = useCallback(() => {
    if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
    if (identityIntervalRef.current) clearInterval(identityIntervalRef.current);
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    audioContextRef.current?.close().catch(() => {});
    streamRef.current?.getTracks().forEach((t) => t.stop());
    screenStream.getTracks().forEach((t) => t.stop());
    micStream.getTracks().forEach((t) => t.stop());
  }, [screenStream, micStream]);

  const recordViolation = useCallback(
    async (violation: ConfirmedViolation) => {
      if (endedRef.current) return;

      // Face-not-visible gets its own dedicated 3-strike cancellation, independent of the
      // general mixed-violation policy below (which still governs multiple-faces, looking-away,
      // identity-mismatch, and tab-hidden at their existing warn/auto-submit thresholds).
      if (violation.type === 'NO_FACE') {
        noFaceCount.current += 1;
        const count = noFaceCount.current;
        const cancelling = count >= NO_FACE_WARNINGS_BEFORE_CANCEL;
        const displayed: ConfirmedViolation = {
          ...violation,
          message: cancelling
            ? `Face not visible (warning ${count} of ${NO_FACE_WARNINGS_BEFORE_CANCEL}) — exam cancelled.`
            : `Warning ${count} of ${NO_FACE_WARNINGS_BEFORE_CANCEL}: face not visible. The exam is cancelled after ${NO_FACE_WARNINGS_BEFORE_CANCEL} such warnings.`,
        };
        setLiveViolations((prev) => [...prev, displayed]);

        if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
        const snapshotBase64 = videoRef.current ? captureBase64Jpeg(videoRef.current, canvasRef.current) : null;
        // A transient failure here must not silently drop the strike count towards cancellation
        // below — log it and keep going rather than letting the throw skip the rest of this fn.
        await apiPost(`/api/exam/sessions/${sessionId}/violations`, {
          type: violation.type,
          severity: violation.severity,
          message: displayed.message,
          snapshotBase64,
        }).catch((err) => console.error('Failed to persist violation:', err));

        if (cancelling) {
          endedRef.current = true;
          stopEverything();
          await apiPost(`/api/exam/sessions/${sessionId}/auto-submit`);
          setEnded('auto_submitted');
        }
        return;
      }

      setLiveViolations((prev) => [...prev, violation]);

      if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
      const snapshotBase64 = videoRef.current ? captureBase64Jpeg(videoRef.current, canvasRef.current) : null;

      await apiPost(`/api/exam/sessions/${sessionId}/violations`, {
        type: violation.type,
        severity: violation.severity,
        message: violation.message,
        snapshotBase64,
      }).catch((err) => console.error('Failed to persist violation:', err));

      const policyResult = violationPolicy.current.record();
      if (policyResult.shouldAutoSubmit) {
        endedRef.current = true;
        stopEverything();
        await apiPost(`/api/exam/sessions/${sessionId}/auto-submit`);
        setEnded('auto_submitted');
      }
    },
    [sessionId, stopEverything],
  );

  const handleTabHidden = useCallback(() => {
    if (document.hidden) recordViolation({ type: 'TAB_HIDDEN', severity: 'warning', message: 'Browser tab lost focus or was hidden.' });
  }, [recordViolation]);

  // Load session + camera + models once.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { session: sessionRow } = await apiGet<{ session: SessionInfo }>(`/api/exam/sessions/${sessionId}`);
      if (cancelled || !sessionRow) return;
      setSession(sessionRow);

      const { company } = await apiGet<{ company: CompanyDurations }>(`/api/companies/${sessionRow.companyId}`);
      if (!cancelled && company) setDurations(company);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const landmarker = await loadFaceLandmarker();
      await loadFaceModels();
      if (cancelled) return;

      presenceIntervalRef.current = setInterval(() => {
        if (!videoRef.current || endedRef.current) return;
        const frame = detectFrame(landmarker, videoRef.current, performance.now());
        // Not a real reading (video frame not decoded yet, or the detector hit a transient
        // error) — skip this tick's strike/clear bookkeeping entirely rather than letting it
        // count as either a pass or a fail.
        if (!frame.ok) return;

        if (frame.faceCount === 0) {
          strikeTracker.current.clear('MULTIPLE_FACES');
          strikeTracker.current.clear('LOOKING_AWAY');
          const confirmed = noFaceStrikeTracker.current.strike('NO_FACE');
          if (confirmed) recordViolation(confirmed);
          return;
        }
        noFaceStrikeTracker.current.clear('NO_FACE');

        if (frame.faceCount > 1) {
          const confirmed = strikeTracker.current.strike('MULTIPLE_FACES');
          if (confirmed) recordViolation(confirmed);
        } else {
          strikeTracker.current.clear('MULTIPLE_FACES');
        }

        const lookingAway =
          (frame.yawDeg !== null && Math.abs(frame.yawDeg) > MAX_YAW_DEG) ||
          (frame.pitchDeg !== null && Math.abs(frame.pitchDeg) > MAX_PITCH_DEG);
        if (lookingAway) {
          const confirmed = strikeTracker.current.strike('LOOKING_AWAY');
          if (confirmed) recordViolation(confirmed);
        } else {
          strikeTracker.current.clear('LOOKING_AWAY');
        }
      }, PRESENCE_CHECK_MS);

      identityIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || endedRef.current) return;
        const descriptor = await getFaceDescriptor(videoRef.current);
        if (!descriptor) return;
        const data = await apiPost<{ match: boolean }>('/api/face/match', { embedding: Array.from(descriptor) }).catch(() => null);
        if (!data) return;
        if (data.match) {
          strikeTracker.current.clear('IDENTITY_MISMATCH');
        } else {
          const confirmed = strikeTracker.current.strike('IDENTITY_MISMATCH');
          if (confirmed) recordViolation(confirmed);
        }
      }, IDENTITY_CHECK_MS);

      // Screen-share/mic tracks only fire 'ended' when something external stops them (the
      // browser's own "Stop sharing" bar, OS permission revocation, unplugged device) — not when
      // our own stopEverything() calls .stop() on them at legitimate exam end, so no endedRef
      // guard is strictly required here, but it's added anyway as a defensive no-op.
      const screenTrack = screenStream.getVideoTracks()[0];
      if (screenTrack) {
        screenTrack.onended = () => {
          if (endedRef.current) return;
          recordViolation({ type: 'SCREEN_SHARE_STOPPED', severity: 'critical', message: 'Screen sharing was stopped.' });
        };
      }

      const micTrack = micStream.getAudioTracks()[0];
      if (micTrack) {
        micTrack.onended = () => {
          if (endedRef.current) return;
          recordViolation({ type: 'MIC_UNAVAILABLE', severity: 'warning', message: 'Microphone access was lost or revoked.' });
        };
      }

      if (micTrack) {
        const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioContext = new AudioContextCtor();
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        audioContext.createMediaStreamSource(micStream).connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        audioIntervalRef.current = setInterval(() => {
          if (endedRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const average = sum / dataArray.length;

          if (average > LOUD_AUDIO_THRESHOLD) {
            const confirmed = audioStrikeTracker.current.strike('SUSPICIOUS_AUDIO');
            if (confirmed) recordViolation(confirmed);
          } else {
            audioStrikeTracker.current.clear('SUSPICIOUS_AUDIO');
          }
        }, AUDIO_CHECK_MS);
      }

      document.addEventListener('visibilitychange', handleTabHidden);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleTabHidden);
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Fetch this round's questions whenever currentRound changes. The Live Interview round
  // ('personal') is Claude-driven conversation, not question-bank content — nothing to fetch.
  // Technical questions are LLM-generated fresh per session rather than pulled from the static
  // per-company seeded bank (HR still uses that static bank).
  useEffect(() => {
    if (!session?.companyId || !session.currentRound || session.currentRound === 'personal') return;
    if (session.currentRound === 'technical') {
      startTechnicalRound(sessionId).then(setQuestions);
      return;
    }
    fetchRoundQuestions(session.companyId, session.currentRound).then(setQuestions);
  }, [sessionId, session?.companyId, session?.currentRound]);

  const handleRoundSubmit = async (round: RoundName, result: { score: number; pct: number; answers: Record<string, string> }) => {
    if (round === 'technical') {
      // Grading (MCQ exact-match and LLM-judged coding answers) happens entirely server-side,
      // since correctAnswer/rubric was never sent to the client for this round.
      await submitTechnicalRound(sessionId, result.answers);
    } else {
      await submitRoundResponses(
        sessionId,
        questions.map((q) => ({
          questionId: q.id,
          round,
          answer: result.answers[q.id] ?? '',
          score: scoreAnswer(q, result.answers[q.id] ?? ''),
        })),
      );
      await recordRoundScore(sessionId, round, result.score, result.pct);
    }

    const { session: updated } = await apiGet<{ session: SessionInfo }>(`/api/exam/sessions/${sessionId}`);

    if (!updated || updated.status === 'submitted') {
      endedRef.current = true;
      stopEverything();
      setEnded('submitted');
      return;
    }
    setSession(updated);
  };

  if (ended) {
    return <ExamResults sessionId={sessionId} onContinue={onExamComplete} />;
  }

  if (loading || !session?.currentRound || !durations) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">Loading your exam...</p>
      </div>
    );
  }

  const durationMin =
    session.currentRound === 'technical'
      ? durations.technicalDurationMin
      : session.currentRound === 'personal'
        ? durations.personalDurationMin
        : durations.hrDurationMin;

  return (
    <div className="relative">
      <video ref={videoRef} autoPlay muted playsInline className="fixed bottom-4 right-4 w-40 h-32 object-cover rounded-lg border border-slate-700 z-50" />

      {liveViolations.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-1 max-w-xs">
          {liveViolations.slice(-3).map((v, i) => (
            <div key={i} className="bg-red-900/80 border border-red-500/50 rounded-lg p-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-red-200 text-xs">{v.message}</p>
            </div>
          ))}
        </div>
      )}

      <Badge className="fixed top-4 left-4 z-50 bg-slate-800 text-white">{EXAM_TYPE_LABELS[session.currentRound]}</Badge>

      {session.currentRound === 'personal' ? (
        <LiveInterviewRound
          sessionId={sessionId}
          onSubmit={(result) => handleRoundSubmit(session.currentRound as RoundName, result)}
        />
      ) : (
        <RoundView
          title={EXAM_TYPE_LABELS[session.currentRound]}
          durationMin={durationMin}
          questions={questions}
          onSubmit={(result) => handleRoundSubmit(session.currentRound as RoundName, result)}
        />
      )}
    </div>
  );
};

export default ExamRunner;
