import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Camera, CheckCircle, AlertCircle } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { loadFaceModels, captureAveragedDescriptor, GUIDANCE_MESSAGES, type FrameQualityReason } from '@/lib/faceEngine';

interface EnrollFaceProps {
  onEnrolled: () => Promise<void> | void;
}

type Status = 'loading_models' | 'idle' | 'requesting_camera' | 'capturing' | 'complete' | 'error';

const SAMPLES = 5;

const EnrollFace = ({ onEnrolled }: EnrollFaceProps) => {
  const [status, setStatus] = useState<Status>('loading_models');
  const [guidance, setGuidance] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Preload the face-api models in the background — no permission prompt involved — but never
  // touch getUserMedia here. Camera access is only requested from startEnrollment(), in direct
  // response to the user clicking "Start Enrollment", so simply landing on this screen (e.g. a
  // stale session with faceEnrolled still false) never surprises the user with a camera prompt.
  useEffect(() => {
    let cancelled = false;

    loadFaceModels()
      .then(() => {
        if (!cancelled) setStatus('idle');
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load face models.');
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startEnrollment = async () => {
    setStatus('requesting_camera');
    setProgress(0);
    setGuidance(null);
    setErrorMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Camera access failed.');
      setStatus('error');
      return;
    }

    if (!videoRef.current) return;
    setStatus('capturing');
    setGuidance('Analyzing your face...');

    try {
      let samplesDone = 0;
      const descriptor = await captureAveragedDescriptor(videoRef.current, {
        samples: SAMPLES,
        intervalMs: 1000,
        onGuidance: (reason: FrameQualityReason | null) => {
          if (reason === null) {
            samplesDone += 1;
            setProgress(Math.min(100, Math.round((samplesDone / SAMPLES) * 100)));
            setGuidance(null);
          } else {
            setGuidance(GUIDANCE_MESSAGES[reason]);
          }
        },
      });

      await apiPost('/api/face/enroll', { embedding: Array.from(descriptor) });

      setProgress(100);
      setStatus('complete');
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setTimeout(() => onEnrolled(), 1500);
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message.startsWith('quality_gate_failed')
          ? 'We could not get a clear, well-lit view of your face. Please adjust and try again.'
          : err instanceof Error
            ? err.message
            : 'Enrollment failed. Please try again.',
      );
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-slate-900 border-slate-700">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl text-white">Face Enrollment Required</CardTitle>
              <CardDescription className="text-slate-300">
                Every exam requires a verified face template. This only takes a few seconds.
              </CardDescription>
            </div>
            {status === 'complete' && <Badge className="bg-green-600 text-white">COMPLETE</Badge>}
            {status === 'capturing' && <Badge className="bg-blue-500 text-white">CAPTURING</Badge>}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {status === 'capturing' && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-300">
                <span>Capture Progress</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-64 bg-slate-700 rounded-lg object-cover"
            />
          </div>

          {guidance && (
            <div className="bg-amber-900/20 border border-amber-500/50 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">{guidance}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-300 text-sm">{errorMessage}</p>
            </div>
          )}

          {status === 'complete' ? (
            <div className="text-center space-y-3 py-4">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto" />
              <p className="text-white text-lg font-semibold">Enrollment complete — redirecting...</p>
            </div>
          ) : (
            <Button
              onClick={startEnrollment}
              disabled={status === 'loading_models' || status === 'requesting_camera' || status === 'capturing'}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg"
            >
              <Camera className="w-4 h-4 mr-2" />
              {status === 'loading_models'
                ? 'Loading face models...'
                : status === 'requesting_camera'
                  ? 'Waiting for camera permission...'
                  : status === 'capturing'
                    ? 'Capturing...'
                    : status === 'error'
                      ? 'Retry Enrollment'
                      : 'Start Enrollment'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EnrollFace;
